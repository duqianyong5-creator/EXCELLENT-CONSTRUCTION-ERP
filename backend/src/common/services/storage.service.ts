import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { sniffImage } from './image-sniff';
import { ErrorCode } from '../i18n/messages';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private supabase: SupabaseClient | null = null;
  private bucket: string;

  constructor(private config: ConfigService) {
    const url = config.get<string>('SUPABASE_URL');
    const key = config.get<string>('SUPABASE_SERVICE_KEY');
    this.bucket = config.get<string>('SUPABASE_STORAGE_BUCKET', 'truck-uploads');

    if (url && key) {
      this.supabase = createClient(url, key);
      this.ensureBucket();
    } else {
      this.logger.warn('Supabase Storage 未配置，将使用本地存储');
    }
  }

  private async ensureBucket() {
    if (!this.supabase) return;
    const { data: buckets } = await this.supabase.storage.listBuckets();
    const exists = buckets?.some((b) => b.name === this.bucket);
    if (!exists) {
      await this.supabase.storage.createBucket(this.bucket, { public: true });
      this.logger.log(`Supabase Storage Bucket "${this.bucket}" 已创建`);
    }
  }

  async upload(
    file: Express.Multer.File,
    folder = 'work-records',
  ): Promise<string> {
    // 扩展名和 Content-Type 一律按文件内容判定，不采信客户端给的值。
    // 否则一个司机账号就能把 .html / .svg 存进公开桶，用公司域名做钓鱼页；
    // 走本地存储兜底时更糟——那是和 API 同源提供的，等于存储型 XSS。
    const sniffed = sniffImage(file.buffer);
    if (!sniffed) {
      throw new BadRequestException(ErrorCode.UPLOAD_IMAGE_ONLY);
    }
    const { ext, contentType } = sniffed;
    const filename = `${folder}/${randomUUID()}${ext}`;

    if (this.supabase) {
      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .upload(filename, file.buffer, {
          contentType,
          upsert: false,
        });

      if (error) throw new Error(`Supabase Storage 上传失败: ${error.message}`);

      const { data: urlData } = this.supabase.storage
        .from(this.bucket)
        .getPublicUrl(data.path);

      return urlData.publicUrl;
    }

    // 本地存储备用
    const fs = require('fs');
    const path = require('path');
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const localPath = path.join(uploadDir, `${randomUUID()}${ext}`);
    fs.writeFileSync(localPath, file.buffer);
    return `/uploads/${path.basename(localPath)}`;
  }

  async uploadMany(files: Express.Multer.File[], folder = 'work-records'): Promise<string[]> {
    return Promise.all(files.map((f) => this.upload(f, folder)));
  }

  async delete(url: string): Promise<void> {
    if (!this.supabase || !url.includes('supabase')) return;
    const path = url.split(`/${this.bucket}/`)[1];
    if (path) await this.supabase.storage.from(this.bucket).remove([path]);
  }
}
