import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { extname } from 'path';

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
    const ext = extname(file.originalname);
    const filename = `${folder}/${randomUUID()}${ext}`;

    if (this.supabase) {
      const { data, error } = await this.supabase.storage
        .from(this.bucket)
        .upload(filename, file.buffer, {
          contentType: file.mimetype,
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
