import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { MESSAGE_CREATED_EVENT, type MessageCreatedEvent } from '../chat/events';

@Injectable()
export class BotWebhooksService {
  private readonly logger = new Logger(BotWebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(MESSAGE_CREATED_EVENT)
  async handleMessageCreated(message: MessageCreatedEvent) {
    // Notify any bot whose owner can see this channel and who has a webhook
    // configured - mirrors the same access rule bots use to post (they act as
    // an extension of their owner's membership, not an independent identity).
    const bots = await this.prisma.bot.findMany({
      where: {
        id: { not: message.botId ?? undefined }, // don't notify a bot about its own message
        webhookUrl: { not: null },
        owner: { memberships: { some: { channelId: message.channelId } } },
      },
    });

    await Promise.all(bots.map((bot) => this.deliver(bot, message)));
  }

  private async deliver(bot: { name: string; webhookUrl: string | null }, message: MessageCreatedEvent) {
    if (!bot.webhookUrl) return;
    const mentioned = message.content.toLowerCase().includes(`@${bot.name.toLowerCase()}`);

    try {
      await fetch(bot.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: mentioned ? 'mention' : 'message',
          channelId: message.channelId,
          message: {
            id: message.id,
            content: message.content,
            authorId: message.authorId,
            botId: message.botId,
            createdAt: message.createdAt,
          },
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      this.logger.warn(`Webhook delivery to ${bot.webhookUrl} failed: ${(err as Error).message}`);
    }
  }
}
