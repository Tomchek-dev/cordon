import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  SlashCommandsService,
  type SlashCommandContext,
  type SlashCommandReply,
} from '../chat/slash-commands.service';
import { parseDuration } from './duration.util';

// System bots never authenticate over HTTP, so this sentinel just needs to be a
// stable, unique value - it is never compared as a real secret.
const REMINDER_BOT_TOKEN_HASH = 'system:reminder-bot';

@Injectable()
export class RemindersService implements OnModuleInit {
  private readonly logger = new Logger(RemindersService.name);
  private botId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly slashCommands: SlashCommandsService,
  ) {}

  async onModuleInit() {
    const bot = await this.prisma.bot.upsert({
      where: { tokenHash: REMINDER_BOT_TOKEN_HASH },
      update: {},
      create: {
        name: 'Reminder Bot',
        tokenHash: REMINDER_BOT_TOKEN_HASH,
        ownerId: null,
        permissions: [],
      },
    });
    this.botId = bot.id;
    this.logger.log(`Reminder Bot ready (id=${bot.id})`);

    this.slashCommands.register(
      'remind',
      'Set a reminder: /remind me in <duration> to <task> (e.g. 10m, 2h, 1h30m, 1d)',
      (ctx) => this.handleRemind(ctx),
    );
  }

  getBotId(): string {
    return this.botId;
  }

  private async handleRemind(ctx: SlashCommandContext): Promise<SlashCommandReply> {
    const match = ctx.args.match(/^(?:me\s+)?in\s+(\S+)\s+to\s+(.+)$/i);
    if (!match) {
      return {
        content: 'Usage: /remind me in <duration> to <task> — e.g. /remind me in 10m to check the oven',
        botId: this.botId,
      };
    }

    const [, durationText, task] = match;
    const ms = parseDuration(durationText);
    if (!ms) {
      return {
        content: `I don't understand the duration "${durationText}". Try things like 10m, 2h, 1h30m, or 1d.`,
        botId: this.botId,
      };
    }

    await this.prisma.botEvent.create({
      data: {
        botId: this.botId,
        type: 'REMINDER',
        payload: { userId: ctx.userId, channelId: ctx.channelId, task: task.trim() },
        scheduledFor: new Date(Date.now() + ms),
      },
    });

    return { content: `Got it — I'll remind you in ${durationText} to ${task.trim()}.`, botId: this.botId };
  }
}
