import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/client';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';

export type PresenceStatus = 'ONLINE' | 'OFFLINE' | 'AWAY' | 'BUSY';

const PRESENCE_HASH = 'presence:status';
export const PRESENCE_CHANNEL = 'presence-updates';

@Injectable()
export class PresenceService {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  async setStatus(userId: string, status: PresenceStatus) {
    await this.redis.client.hset(PRESENCE_HASH, userId, status);
    try {
      await this.prisma.user.update({ where: { id: userId }, data: { status } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        await this.redis.client.hdel(PRESENCE_HASH, userId);
        return;
      }
      throw err;
    }
    await this.redis.publisher.publish(PRESENCE_CHANNEL, JSON.stringify({ userId, status }));
  }

  async getAllStatuses(): Promise<Record<string, PresenceStatus>> {
    const all = await this.redis.client.hgetall(PRESENCE_HASH);
    return all as Record<string, PresenceStatus>;
  }
}
