import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Trust X-Forwarded-For for exactly this many reverse-proxy hops instead of
  // reading req.ip as the nearest proxy's own address - otherwise every
  // client behind the proxy chain shares one rate-limit bucket. Defaults to
  // 1 (Caddy alone); set TRUST_PROXY_HOPS=2 when Caddy itself sits behind an
  // existing nginx (see setup.sh --behind-nginx).
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
  // Frontend and backend share an origin behind Caddy, so browser traffic
  // never needs cross-origin CORS. Only enable it if FRONTEND_ORIGIN is
  // explicitly set for some other deployment shape.
  app.enableCors({ origin: process.env.FRONTEND_ORIGIN ?? false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
