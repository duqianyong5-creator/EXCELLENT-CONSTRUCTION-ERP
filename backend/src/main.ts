import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import * as os from 'os';
import { AppModule } from './app.module';
import { createCorsOriginResolver } from './config/security.config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // 生产环境不输出 debug：里面会带车辆坐标等位置信息，不该进第三方日志平台
    logger: process.env.NODE_ENV === 'production'
      ? ['error', 'warn', 'log']
      : ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  const configService = app.get(ConfigService);
  const isProd = process.env.NODE_ENV === 'production';

  // 部署在 Railway/Render 等反向代理后面：信任第一跳代理，拿到真实客户端 IP（限流按 IP 才准）
  app.set('trust proxy', 1);

  app.enableCors({
    origin: createCorsOriginResolver(configService),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads',
  });

  // Swagger 仅在非生产环境暴露，避免线上泄露完整 API 结构
  if (!isProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Truck Dispatch Management System API')
      .setDescription('Truck Dispatch Management System API Documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  const nets = os.networkInterfaces();
  logger.log('Server running on:');
  logger.log(`Local: http://localhost:${port}`);
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        logger.log(`Network: http://${net.address}:${port}`);
      }
    }
  }
  logger.log(`API Docs: http://localhost:${port}/api/docs`);
}

bootstrap();
