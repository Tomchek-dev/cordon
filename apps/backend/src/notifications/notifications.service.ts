import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { MESSAGE_CREATED_EVENT, NOTIFICATION_EVENT, type MessageCreatedEvent, type NotificationEvent } from '../chat/events';

const MENTION_PATTERN = /@([a-zA-Z0-9_]+)/g;

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
      include: { user: { select: { id: true, username: true, notifyDmOnly: true } } },
    });

    const mentionedUsernames = new Set(
      [...message.content.matchAll(MENTION_PATTERN)].map((m) => m[1].toLowerCase()),
    );

    const preview = message.content.slice(0, 140) || (message.attachmentUrl ? '📎 attachment' : '');

    for (const recipient of recipients) {
      const isMentioned = mentionedUsernames.has(recipient.user.username.toLowerCase());

      // "DM-only" means: skip in-app notifications for channel chatter, but
      // never for a direct message or a direct @mention.
      if (recipient.user.notifyDmOnly && channel.type !== 'DM' && !isMentioned) continue;

      this.events.emit(NOTIFICATION_EVENT, {
        userId: recipient.userId,
        channelId: message.channelId,
        preview,
        kind: isMentioned ? 'mention' : 'message',
      } satisfies NotificationEvent);
    }
  }
}
