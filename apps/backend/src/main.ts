import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { UPLOAD_ROOT } from './uploads/uploads.util';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({ origin: process.env.FRONTEND_ORIGIN ?? '*' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useStaticAssets(UPLOAD_ROOT, { prefix: '/uploads' });
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
