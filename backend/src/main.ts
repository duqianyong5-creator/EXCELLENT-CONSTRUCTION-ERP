import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as os from 'os';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 请求日志中间件
  app.use((req, res, next) => {
    logger.log(`Incoming Request: ${req.method} ${req.url}`);
    next();
  });

app.enableCors({
    origin: (origin, callback) => {
      // 允许所有来源（开发模式下反射 origin）
      callback(null, true);
    },
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

  const config = new DocumentBuilder()
    .setTitle('货车调度管理系统 API')
    .setDescription('Truck Dispatch Management System API Documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  
  const nets = os.networkInterfaces();
  console.log(`🚀 Server running on:`);
  console.log(`   - Local:   http://localhost:${port}`);
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`   - Network: http://${net.address}:${port}`);
      }
    }
  }
  console.log(`📚 API Docs: http://localhost:${port}/api/docs`);
}
bootstrap();
