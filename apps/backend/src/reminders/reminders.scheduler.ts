import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { MESSAGE_AUTHOR_INCLUDE, MESSAGE_CREATED_EVENT, NOTIFICATION_EVENT } from '../chat/events';
import type { MessageCreatedEvent, NotificationEvent } from '../chat/events';
import { RemindersService } from './reminders.service';

interface ReminderPayload {
  userId: string;
  channelId: string;
  task: string;
}

@Injectable()
export class RemindersScheduler {
  private readonly logger = new Logger(RemindersScheduler.name);
  // Polling the DB (rather than an in-memory timer) is what makes reminders
  // survive a backend restart - a scheduled BotEvent just sits there until due.
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reminders: RemindersService,
    private readonly events: EventEmitter2,
  ) {}

  @Interval(10_000)
  async checkDueReminders() {
    if (this.running) return; // avoid overlapping runs if a batch takes >10s
    this.running = true;
    try {
      const due = await this.prisma.botEvent.findMany({
        where: { type: 'REMINDER', sentAt: null, scheduledFor: { lte: new Date() } },
      });

      for (const event of due) {
        await this.fire(event.id, event.payload as unknown as ReminderPayload);
      }
    } catch (err) {
      this.logger.error(`Failed while checking due reminders: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async fire(eventId: string, payload: ReminderPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.userId } });

    const message = await this.prisma.message.create({
      data: {
        channelId: payload.channelId,
        botId: this.reminders.getBotId(),
        content: `⏰ Reminder for @${user?.username ?? 'someone'}: ${payload.task}`,
      },
      include: MESSAGE_AUTHOR_INCLUDE,
    });

    this.events.emit(MESSAGE_CREATED_EVENT, message satisfies MessageCreatedEvent);
    // A reminder is something the user explicitly asked for, so it bypasses
    // mute/DM-only preferences (those only govern other people's chatter).
    this.events.emit(NOTIFICATION_EVENT, {
      userId: payload.userId,
      channelId: payload.channelId,
      preview: payload.task,
      kind: 'reminder',
    } satisfies NotificationEvent);

    await this.prisma.botEvent.update({ where: { id: eventId }, data: { sentAt: new Date() } });
  }
}
