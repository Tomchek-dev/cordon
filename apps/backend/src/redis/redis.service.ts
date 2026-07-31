import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly client: Redis;
  readonly publisher: Redis;
  readonly subscriber: Redis;

  constructor() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.client = new Redis(url);
    this.publisher = new Redis(url);
    this.subscriber = new Redis(url);
  }

  async onModuleInit() {
    // ioredis connects lazily on first command; ping ensures the connection is live early.
    await this.client.ping();
  }

  async onModuleDestroy() {
    await Promise.all([this.client.quit(), this.publisher.quit(), this.subscriber.quit()]);
  }
}
