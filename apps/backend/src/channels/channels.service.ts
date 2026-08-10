import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MESSAGE_AUTHOR_INCLUDE } from '../chat/events';
import { AuditLogService } from '../audit-log/audit-log.service';

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
    private readonly auditLog: AuditLogService,
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

    // Private channels restricted to a role the user holds get the same
    // join-on-list treatment as public channels - a role grant is an
    // additional way in, on top of (not instead of) explicit membership.
    const roleGrantedChannels = await this.prisma.channel.findMany({
      where: {
        isPrivate: true,
        roleAccess: { some: { role: { assignments: { some: { userId } } } } },
      },
    });
    await Promise.all(
      roleGrantedChannels.map((channel) =>
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
        if (membership.channel.type === 'DM' && membership.channel.botId) {
          // Bot DMs have no second ChannelMember row - synthesize the same
          // shape from the Bot record instead.
          const bot = await this.prisma.bot.findUnique({
            where: { id: membership.channel.botId },
            select: { id: true, name: true },
          });
          dmParticipant = bot ? { id: bot.id, username: bot.name, displayName: bot.name, status: 'ONLINE', avatar: null } : null;
        } else if (membership.channel.type === 'DM') {
          const other = await this.prisma.channelMember.findFirst({
            where: { channelId: membership.channelId, userId: { not: userId } },
            include: { user: { select: { id: true, username: true, displayName: true, status: true, avatar: true } } },
          });
          dmParticipant = other?.user ?? null;
        }

        const lastMessageRow = await this.prisma.message.findFirst({
          where: { channelId: membership.channelId },
          orderBy: { createdAt: 'desc' },
          select: {
            content: true,
            createdAt: true,
            author: { select: { displayName: true } },
            bot: { select: { name: true } },
          },
        });
        const lastMessage = lastMessageRow
          ? {
              content: lastMessageRow.content,
              createdAt: lastMessageRow.createdAt,
              senderName: lastMessageRow.author?.displayName ?? lastMessageRow.bot?.name ?? 'System',
            }
          : null;

        return { ...membership.channel, unreadCount, dmParticipant, muted: membership.muted, lastMessage };
      }),
    );
  }

  async create(
    name: string,
    ownerId: string,
    type: 'TEXT' | 'VOICE' = 'TEXT',
    isPrivate = false,
    memberIds: string[] = [],
    roleIds: string[] = [],
    isAnnouncementChannel = false,
  ) {
    const initialMemberIds = [...new Set([ownerId, ...memberIds])];
    const channel = await this.prisma.channel.create({
      data: {
        name,
        type,
        isPrivate,
        isAnnouncementChannel,
        members: {
          create: initialMemberIds.map((userId) => ({
            userId,
            role: userId === ownerId ? 'OWNER' : 'MEMBER',
          })),
        },
        roleAccess: {
          create: roleIds.map((roleId) => ({ roleId })),
        },
      },
    });
    this.events.emit(CHANNEL_CREATED_EVENT, {
      channelId: channel.id,
      memberIds: isPrivate ? initialMemberIds : 'all',
    } satisfies ChannelCreatedEvent);
    await this.auditLog.log(ownerId, 'channel.created', 'Channel', channel.id, {
      name,
      type,
      isPrivate,
      roleIds,
      isAnnouncementChannel,
    });
    return channel;
  }

  async setAnnouncementMode(channelId: string, enabled: boolean, actorId: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      throw new NotFoundException('channel not found');
    }
    if (channel.type !== 'VOICE') {
      throw new BadRequestException('announcement mode only applies to voice channels');
    }
    const updated = await this.prisma.channel.update({
      where: { id: channelId },
      data: { isAnnouncementChannel: enabled },
      select: { id: true, isAnnouncementChannel: true },
    });
    await this.auditLog.log(actorId, 'channel.announcement_mode', 'Channel', channelId, { enabled });
    return updated;
  }

  async addRole(channelId: string, requesterId: string, roleId: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      throw new NotFoundException('channel not found');
    }
    if (!channel.isPrivate) {
      throw new ForbiddenException('public channels are open to everyone already');
    }

    const requesterMembership = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId: requesterId } },
    });
    if (!requesterMembership || requesterMembership.role === 'MEMBER') {
      throw new ForbiddenException('only the channel owner or an admin can restrict it to a role');
    }

    await this.prisma.channelRoleAccess.upsert({
      where: { roleId_channelId: { roleId, channelId } },
      create: { roleId, channelId },
      update: {},
    });
    return { ok: true };
  }

  async setAvatar(channelId: string, avatarUrl: string) {
    return this.prisma.channel.update({
      where: { id: channelId },
      data: { avatar: avatarUrl },
      select: { id: true, name: true, avatar: true },
    });
  }

  async addMember(channelId: string, requesterId: string, targetUserId: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      throw new NotFoundException('channel not found');
    }
    if (!channel.isPrivate) {
      throw new ForbiddenException('public channels are open to everyone already');
    }

    const requesterMembership = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId: requesterId } },
    });
    if (!requesterMembership || requesterMembership.role === 'MEMBER') {
      throw new ForbiddenException('only the channel owner or an admin can add members');
    }

    await this.prisma.channelMember.upsert({
      where: { channelId_userId: { channelId, userId: targetUserId } },
      create: { channelId, userId: targetUserId },
      update: {},
    });
    this.events.emit(CHANNEL_CREATED_EVENT, {
      channelId,
      memberIds: [targetUserId],
    } satisfies ChannelCreatedEvent);
    return { ok: true };
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

  async createBotDm(userId: string, botId: string) {
    const existing = await this.prisma.channel.findFirst({
      where: { type: 'DM', botId, members: { some: { userId } } },
    });
    if (existing) return existing;

    const bot = await this.prisma.bot.findUnique({ where: { id: botId } });
    if (!bot) {
      throw new NotFoundException('bot not found');
    }
    if (!bot.dmEnabled) {
      throw new ForbiddenException('this bot cannot be DMed');
    }

    // No ChannelMember row for the bot itself - it has no account to log in
    // with, it just reacts to MESSAGE_CREATED_EVENT like everywhere else.
    const channel = await this.prisma.channel.create({
      data: {
        name: `bot-dm-${randomUUID()}`,
        type: 'DM',
        isPrivate: true,
        botId,
        members: { create: [{ userId }] },
      },
    });
    this.events.emit(CHANNEL_CREATED_EVENT, {
      channelId: channel.id,
      memberIds: [userId],
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
    if (membership) {
      return channel;
    }

    const hasRoleAccess = await this.prisma.channelRoleAccess.findFirst({
      where: { channelId, role: { assignments: { some: { userId } } } },
    });
    if (hasRoleAccess) {
      await this.prisma.channelMember.upsert({
        where: { channelId_userId: { channelId, userId } },
        create: { channelId, userId },
        update: {},
      });
      return channel;
    }

    throw new ForbiddenException('not a member of this channel');
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

  async getReadReceipts(channelId: string, userId: string) {
    await this.ensureMembership(channelId, userId);
    const members = await this.prisma.channelMember.findMany({
      where: { channelId, userId: { not: userId } },
      select: {
        lastReadAt: true,
        user: { select: { id: true, displayName: true } },
      },
    });
    return members.map((m) => ({ userId: m.user.id, displayName: m.user.displayName, lastReadAt: m.lastReadAt }));
  }

  async findPinnedMessages(channelId: string, userId: string) {
    await this.ensureMembership(channelId, userId);
    return this.prisma.message.findMany({
      where: { channelId, pinnedAt: { not: null } },
      orderBy: { pinnedAt: 'desc' },
      include: MESSAGE_AUTHOR_INCLUDE,
    });
  }
}
