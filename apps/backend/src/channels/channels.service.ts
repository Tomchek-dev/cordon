import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MESSAGE_AUTHOR_INCLUDE } from '../chat/events';

export const CHANNEL_CREATED_EVENT = 'channel.created';

export interface ChannelCreatedEvent {
  channelId: string;
  // 'all' for public channels (anyone can join); otherwise the specific participants
  // who need their socket auto-joined to the room (e.g. both sides of a new DM).
  memberIds: string[] | 'all';
}

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async findAllForUser(userId: string) {
    const publicChannels = await this.prisma.channel.findMany({
      where: { type: { in: ['TEXT', 'VOICE'] }, isPrivate: false },
    });

    // Public text/voice channels are open to everyone; join-on-list keeps membership
    // (and therefore lastReadAt/unread tracking) in sync without an explicit join step.
    await Promise.all(
      publicChannels.map((channel) =>
        this.prisma.channelMember.upsert({
          where: { channelId_userId: { channelId: channel.id, userId } },
          create: { channelId: channel.id, userId },
          update: {},
        }),
      ),
    );

    const memberships = await this.prisma.channelMember.findMany({
      where: { userId },
      include: { channel: true },
    });

    return Promise.all(
      memberships.map(async (membership) => {
        const unreadCount = await this.prisma.message.count({
          where: {
            channelId: membership.channelId,
            createdAt: { gt: membership.lastReadAt },
            NOT: { authorId: userId },
          },
        });

        let dmParticipant: {
          id: string;
          username: string;
          displayName: string;
          status: string;
          avatar: string | null;
        } | null = null;
        if (membership.channel.type === 'DM') {
          const other = await this.prisma.channelMember.findFirst({
            where: { channelId: membership.channelId, userId: { not: userId } },
            include: { user: { select: { id: true, username: true, displayName: true, status: true, avatar: true } } },
          });
          dmParticipant = other?.user ?? null;
        }

        return { ...membership.channel, unreadCount, dmParticipant, muted: membership.muted };
      }),
    );
  }

  async create(name: string, ownerId: string, type: 'TEXT' | 'VOICE' = 'TEXT') {
    const channel = await this.prisma.channel.create({
      data: {
        name,
        type,
        isPrivate: false,
        members: { create: [{ userId: ownerId, role: 'OWNER' }] },
      },
    });
    this.events.emit(CHANNEL_CREATED_EVENT, {
      channelId: channel.id,
      memberIds: 'all',
    } satisfies ChannelCreatedEvent);
    return channel;
  }

  async createDm(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new ForbiddenException('cannot start a DM with yourself');
    }

    const existing = await this.prisma.channel.findFirst({
      where: {
        type: 'DM',
        AND: [{ members: { some: { userId } } }, { members: { some: { userId: targetUserId } } }],
      },
    });
    if (existing) return existing;

    const channel = await this.prisma.channel.create({
      data: {
        name: `dm-${randomUUID()}`,
        type: 'DM',
        isPrivate: true,
        members: { create: [{ userId }, { userId: targetUserId }] },
      },
    });
    this.events.emit(CHANNEL_CREATED_EVENT, {
      channelId: channel.id,
      memberIds: [userId, targetUserId],
    } satisfies ChannelCreatedEvent);
    return channel;
  }

  async ensureMembership(channelId: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      throw new NotFoundException('channel not found');
    }

    if ((channel.type === 'TEXT' || channel.type === 'VOICE') && !channel.isPrivate) {
      await this.prisma.channelMember.upsert({
        where: { channelId_userId: { channelId, userId } },
        create: { channelId, userId },
        update: {},
      });
      return channel;
    }

    const membership = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!membership) {
      throw new ForbiddenException('not a member of this channel');
    }
    return channel;
  }

  async markRead(channelId: string, userId: string) {
    await this.prisma.channelMember.update({
      where: { channelId_userId: { channelId, userId } },
      data: { lastReadAt: new Date() },
    });
  }

  async setMuted(channelId: string, userId: string, muted: boolean) {
    await this.ensureMembership(channelId, userId);
    await this.prisma.channelMember.update({
      where: { channelId_userId: { channelId, userId } },
      data: { muted },
    });
    return { muted };
  }

  async findMessages(channelId: string, userId: string) {
    await this.ensureMembership(channelId, userId);
    return this.prisma.message.findMany({
      where: { channelId },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: MESSAGE_AUTHOR_INCLUDE,
    });
  }
}
