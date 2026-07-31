import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { MESSAGE_CREATED_EVENT, NOTIFICATION_EVENT, type MessageCreatedEvent, type NotificationEvent } from '../chat/events';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  @OnEvent(MESSAGE_CREATED_EVENT)
  async handleMessageCreated(message: MessageCreatedEvent) {
    const channel = await this.prisma.channel.findUnique({ where: { id: message.channelId } });
    if (!channel) return;

    const recipients = await this.prisma.channelMember.findMany({
      where: {
        channelId: message.channelId,
        userId: { not: message.authorId ?? undefined },
        muted: false,
      },
      include: { user: { select: { id: true, notifyDmOnly: true } } },
    });

    const preview = message.content.slice(0, 140) || (message.attachmentUrl ? '📎 attachment' : '');

    for (const recipient of recipients) {
      // "DM-only" means: skip in-app notifications for channel chatter, but
      // never for a direct message.
      if (recipient.user.notifyDmOnly && channel.type !== 'DM') continue;

      this.events.emit(NOTIFICATION_EVENT, {
        userId: recipient.userId,
        channelId: message.channelId,
        preview,
        kind: 'message',
      } satisfies NotificationEvent);
    }
  }
}
