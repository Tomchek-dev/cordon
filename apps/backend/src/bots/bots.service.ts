import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelsService } from '../channels/channels.service';
import { MESSAGE_AUTHOR_INCLUDE, MESSAGE_CREATED_EVENT, type MessageCreatedEvent } from '../chat/events';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';
import { AuditLogService } from '../audit-log/audit-log.service';

const BOT_SELECT = {
  id: true,
  name: true,
  webhookUrl: true,
  permissions: true,
  ownerId: true,
  createdAt: true,
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class BotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channelsService: ChannelsService,
    private readonly events: EventEmitter2,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(ownerId: string, dto: CreateBotDto) {
    const token = `bot_${randomBytes(24).toString('hex')}`;
    const bot = await this.prisma.bot.create({
      data: {
        name: dto.name,
        webhookUrl: dto.webhookUrl,
        ownerId,
        tokenHash: hashToken(token),
        permissions: [],
      },
      select: BOT_SELECT,
    });
    await this.auditLog.log(ownerId, 'bot.created', 'Bot', bot.id, { name: bot.name });
    // The raw token is only ever available at creation time - the server only
    // ever stores/compares its hash, same as a password.
    return { ...bot, token };
  }

  findAllForOwner(ownerId: string) {
    return this.prisma.bot.findMany({ where: { ownerId }, select: BOT_SELECT });
  }

  findDmEnabled() {
    return this.prisma.bot.findMany({ where: { dmEnabled: true }, select: { id: true, name: true } });
  }

  async update(ownerId: string, botId: string, dto: UpdateBotDto) {
    const bot = await this.prisma.bot.findUnique({ where: { id: botId } });
    if (!bot) throw new NotFoundException('bot not found');
    if (bot.ownerId !== ownerId) throw new ForbiddenException('not your bot');
    return this.prisma.bot.update({
      where: { id: botId },
      data: { webhookUrl: dto.webhookUrl },
      select: BOT_SELECT,
    });
  }

  async remove(ownerId: string, botId: string) {
    const bot = await this.prisma.bot.findUnique({ where: { id: botId } });
    if (!bot) throw new NotFoundException('bot not found');
    if (bot.ownerId !== ownerId) throw new ForbiddenException('not your bot');
    await this.prisma.bot.delete({ where: { id: botId } });
    await this.auditLog.log(ownerId, 'bot.deleted', 'Bot', botId, { name: bot.name });
    return { ok: true };
  }

  async postMessage(rawToken: string, channelId: string, content: string) {
    const bot = await this.prisma.bot.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!bot) {
      throw new UnauthorizedException('invalid bot token');
    }
    if (!bot.ownerId) {
      // System bots (e.g. the Reminder Bot) have no HTTP-facing token and post
      // internally; this branch should be unreachable in practice.
      throw new UnauthorizedException('this bot cannot post via the API');
    }
    if (!content?.trim()) {
      throw new ForbiddenException('content is required');
    }

    // A bot can post anywhere its owner can - it acts as an extension of the
    // account that created it, not an independent identity with its own ACLs.
    await this.channelsService.ensureMembership(channelId, bot.ownerId);

    const message = await this.prisma.message.create({
      data: { channelId, botId: bot.id, content },
      include: MESSAGE_AUTHOR_INCLUDE,
    });

    this.events.emit(MESSAGE_CREATED_EVENT, {
      ...message,
      cards: message.cards as MessageCreatedEvent['cards'],
    } satisfies MessageCreatedEvent);
    return message;
  }
}
