import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_EVENT, type NotificationEvent } from '../chat/events';

export interface PushSubscriptionDto {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const TITLES: Record<NotificationEvent['kind'], string> = {
  message: 'New message',
  mention: 'You were mentioned',
  reminder: '⏰ Reminder',
};

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
  }

  getPublicKey() {
    return { publicKey: process.env.VAPID_PUBLIC_KEY };
  }

  async subscribe(userId: string, sub: PushSubscriptionDto) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
    return { ok: true };
  }

  async unsubscribe(endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
    return { ok: true };
  }

  @OnEvent(NOTIFICATION_EVENT)
  async handleNotification(payload: NotificationEvent) {
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId: payload.userId } });
    if (subs.length === 0) return;

    const body = JSON.stringify({
      title: TITLES[payload.kind] ?? 'Internal Chat',
      body: payload.preview,
      channelId: payload.channelId,
    });

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            // Subscription is dead (browser data cleared, uninstalled, etc.) - stop retrying it.
            await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          } else {
            this.logger.warn(`Push send failed: ${(err as Error).message}`);
          }
        }
      }),
    );
  }
}
