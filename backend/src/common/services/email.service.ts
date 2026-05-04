import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: config.get<number>('SMTP_PORT', 587),
        secure: config.get<string>('SMTP_SECURE') === 'true',
        auth: { user, pass },
      });
      this.logger.log('SMTP 邮件服务已初始化');
    } else {
      this.logger.warn('SMTP 未配置，邮件功能不可用（需要 SMTP_HOST / SMTP_USER / SMTP_PASS）');
    }
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  async sendTaskCompletion(options: {
    to: string;
    clientName: string;
    taskTitle: string;
    startLocation: string;
    endLocation: string;
    startTime: Date;
    endTime: Date;
    driverName: string;
    notes?: string;
    imageUrls?: string[];
  }): Promise<void> {
    if (!this.transporter) {
      throw new Error('SMTP 未配置，请在 .env 文件中添加 SMTP_HOST / SMTP_USER / SMTP_PASS');
    }

    const from = this.config.get<string>('SMTP_FROM') || this.config.get<string>('SMTP_USER');

    const imagesHtml = options.imageUrls?.length
      ? options.imageUrls
          .map(
            (url, i) =>
              `<div style="margin:10px 0;">
                <a href="${url}" target="_blank">
                  <img src="${url}" alt="完成照片${i + 1}"
                    style="max-width:100%;max-height:500px;border-radius:8px;border:1px solid #e8e8e8;" />
                </a>
              </div>`,
          )
          .join('')
      : '<p style="color:#999;font-style:italic;">（无照片）</p>';

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif;">
  <div style="max-width:620px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
    <div style="background:#1677ff;padding:24px 32px;">
      <h2 style="color:#fff;margin:0;font-size:20px;">运输任务完成通知</h2>
    </div>
    <div style="padding:32px;">
      <p style="font-size:15px;color:#333;">尊敬的 <strong>${options.clientName}</strong>，您好！</p>
      <p style="font-size:14px;color:#555;margin-bottom:20px;">您的运输任务已圆满完成，以下是本次运输的详细信息：</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px;">
        <tr>
          <td style="padding:10px 14px;background:#f5f5f5;font-weight:bold;color:#333;width:110px;border-bottom:1px solid #e8e8e8;">任务名称</td>
          <td style="padding:10px 14px;color:#333;border-bottom:1px solid #e8e8e8;">${options.taskTitle}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;background:#f5f5f5;font-weight:bold;color:#333;border-bottom:1px solid #e8e8e8;">起点</td>
          <td style="padding:10px 14px;color:#333;border-bottom:1px solid #e8e8e8;">${options.startLocation}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;background:#f5f5f5;font-weight:bold;color:#333;border-bottom:1px solid #e8e8e8;">终点</td>
          <td style="padding:10px 14px;color:#333;border-bottom:1px solid #e8e8e8;">${options.endLocation}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;background:#f5f5f5;font-weight:bold;color:#333;border-bottom:1px solid #e8e8e8;">司机</td>
          <td style="padding:10px 14px;color:#333;border-bottom:1px solid #e8e8e8;">${options.driverName}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;background:#f5f5f5;font-weight:bold;color:#333;border-bottom:1px solid #e8e8e8;">开始时间</td>
          <td style="padding:10px 14px;color:#333;border-bottom:1px solid #e8e8e8;">${new Date(options.startTime).toLocaleString('zh-CN')}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;background:#f5f5f5;font-weight:bold;color:#333;${options.notes ? 'border-bottom:1px solid #e8e8e8;' : ''}">完成时间</td>
          <td style="padding:10px 14px;color:#333;${options.notes ? 'border-bottom:1px solid #e8e8e8;' : ''}">${new Date(options.endTime).toLocaleString('zh-CN')}</td>
        </tr>
        ${
          options.notes
            ? `<tr>
          <td style="padding:10px 14px;background:#f5f5f5;font-weight:bold;color:#333;">备注</td>
          <td style="padding:10px 14px;color:#333;">${options.notes}</td>
        </tr>`
            : ''
        }
      </table>

      <h3 style="color:#333;font-size:15px;margin-bottom:12px;">完成照片</h3>
      ${imagesHtml}

      <p style="color:#999;font-size:12px;margin-top:32px;border-top:1px solid #e8e8e8;padding-top:16px;">
        此邮件由货运调度管理系统自动发送，请勿回复。
      </p>
    </div>
  </div>
</body>
</html>`;

    await this.transporter.sendMail({
      from,
      to: options.to,
      subject: `运输任务完成通知 - ${options.taskTitle}`,
      html,
    });

    this.logger.log(`任务完成邮件已发送至 ${options.to}`);
  }
}
