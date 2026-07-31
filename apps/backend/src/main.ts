import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Frontend and backend share an origin behind Caddy, so browser traffic
  // never needs cross-origin CORS. Only enable it if FRONTEND_ORIGIN is
  // explicitly set for some other deployment shape.
  app.enableCors({ origin: process.env.FRONTEND_ORIGIN ?? false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
