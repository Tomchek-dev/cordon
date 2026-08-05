import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { MESSAGE_AUTHOR_INCLUDE, MESSAGE_CREATED_EVENT, NOTIFICATION_EVENT } from '../chat/events';
import type { MessageCreatedEvent, NotificationEvent } from '../chat/events';
import { RemindersService } from '../reminders/reminders.service';

@Injectable()
export class CalendarScheduler {
  private readonly logger = new Logger(CalendarScheduler.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reminders: RemindersService,
    private readonly events: EventEmitter2,
  ) {}

  @Interval(30_000)
  async checkDueEvents() {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.prisma.calendarEvent.findMany({
        where: { reminderSent: false, date: { lte: new Date() } },
        include: { createdBy: { select: { id: true, displayName: true } } },
      });

      for (const event of due) {
        await this.fire(event);
      }
    } catch (err) {
      this.logger.error(`Failed while checking due calendar events: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async fire(event: {
    id: string;
    title: string;
    notes: string | null;
    visibility: string;
    channelId: string | null;
    createdById: string;
    createdBy: { id: string; displayName: string };
  }) {
    if (event.visibility === 'GENERAL' && event.channelId) {
      // Posting into the channel lets the existing NotificationsService fan
      // this out to every non-muted member automatically - the same path any
      // other bot-posted message takes.
      const message = await this.prisma.message.create({
        data: {
          channelId: event.channelId,
          botId: this.reminders.getBotId(),
          content: `📅 ${event.title}${event.notes ? ` — ${event.notes}` : ''}`,
        },
        include: MESSAGE_AUTHOR_INCLUDE,
      });
      this.events.emit(MESSAGE_CREATED_EVENT, message satisfies MessageCreatedEvent);
    } else {
      // A personal event is just a private ping to its creator - no channel
      // message, so it never leaks into a shared channel.
      this.events.emit(NOTIFICATION_EVENT, {
        userId: event.createdById,
        channelId: event.channelId ?? '',
        preview: event.title,
        kind: 'reminder',
      } satisfies NotificationEvent);
    }

    await this.prisma.calendarEvent.update({ where: { id: event.id }, data: { reminderSent: true } });
  }
}
