import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelsService } from '../channels/channels.service';

export interface CreateCalendarEventInput {
  title: string;
  notes?: string;
  date: string;
  visibility: 'PERSONAL' | 'GENERAL';
  channelId?: string;
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channelsService: ChannelsService,
  ) {}

  async create(userId: string, input: CreateCalendarEventInput) {
    if (!input.title?.trim()) {
      throw new BadRequestException('title is required');
    }
    const date = new Date(input.date);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('invalid date');
    }
    if (input.visibility === 'GENERAL') {
      if (!input.channelId) {
        throw new BadRequestException('channelId is required for a general (team) event');
      }
      await this.channelsService.ensureMembership(input.channelId, userId);
    }

    return this.prisma.calendarEvent.create({
      data: {
        title: input.title.trim(),
        notes: input.notes?.trim() || null,
        date,
        visibility: input.visibility,
        createdById: userId,
        channelId: input.visibility === 'GENERAL' ? input.channelId : null,
      },
    });
  }

  async findForUser(userId: string) {
    const memberships = await this.prisma.channelMember.findMany({
      where: { userId },
      select: { channelId: true },
    });
    const channelIds = memberships.map((m) => m.channelId);

    return this.prisma.calendarEvent.findMany({
      where: {
        OR: [
          { createdById: userId },
          { visibility: 'GENERAL', channelId: { in: channelIds } },
        ],
      },
      orderBy: { date: 'asc' },
      include: { createdBy: { select: { id: true, displayName: true } } },
    });
  }

  async remove(userId: string, eventId: string) {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('event not found');
    if (event.createdById !== userId) throw new ForbiddenException('only the creator can remove this event');
    await this.prisma.calendarEvent.delete({ where: { id: eventId } });
    return { ok: true };
  }
}
