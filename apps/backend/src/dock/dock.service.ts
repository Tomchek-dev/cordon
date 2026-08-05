import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BangCommandsService, type BangCommandReply } from '../chat/bang-commands.service';
import type { SlashCommandContext } from '../chat/slash-commands.service';
import { AuditLogService } from '../audit-log/audit-log.service';

const DOCK_BOT_TOKEN_HASH = 'system:dock-bot';
const UNIT_PATTERN = /^(\d+)\s+(bins?|pallets?)(?:\s+(?:to|for)\s+(.+))?$/i;

@Injectable()
export class DockService implements OnModuleInit {
  private readonly logger = new Logger(DockService.name);
  private botId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bangCommands: BangCommandsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async onModuleInit() {
    const bot = await this.prisma.bot.upsert({
      where: { tokenHash: DOCK_BOT_TOKEN_HASH },
      update: {},
      create: { name: 'Dock Bot', tokenHash: DOCK_BOT_TOKEN_HASH, ownerId: null, permissions: [] },
    });
    this.botId = bot.id;
    this.logger.log(`Dock Bot ready (id=${bot.id})`);

    this.bangCommands.register('in', 'Log incoming units: !in <qty> bins|pallets', (ctx) =>
      this.handleLog(ctx, 'IN'),
    );
    this.bangCommands.register('out', 'Log outgoing units: !out <qty> pallets [to <destination>]', (ctx) =>
      this.handleLog(ctx, 'OUT'),
    );
  }

  private async handleLog(ctx: SlashCommandContext, direction: 'IN' | 'OUT'): Promise<BangCommandReply> {
    const match = ctx.args.match(UNIT_PATTERN);
    if (!match) {
      return {
        content:
          direction === 'IN'
            ? 'Usage: !in <quantity> bins|pallets — e.g. !in 5 bins'
            : 'Usage: !out <quantity> pallets [to <destination>] — e.g. !out 3 pallets to Denver',
        botId: this.botId,
      };
    }

    const [, qtyText, unitText, destination] = match;
    const quantity = parseInt(qtyText, 10);
    const unitType = unitText.toLowerCase().startsWith('bin') ? 'BIN' : 'PALLET';

    const log = await this.prisma.dockLog.create({
      data: {
        channelId: ctx.channelId,
        direction,
        unitType,
        quantity,
        destination: destination?.trim() || null,
        loggedById: ctx.userId,
      },
    });

    await this.auditLog.log(ctx.userId, `dock.${direction.toLowerCase()}`, 'DockLog', log.id, {
      quantity,
      unitType,
      destination: log.destination,
    });

    const unitLabel = `${unitType === 'BIN' ? 'bin' : 'pallet'}${quantity === 1 ? '' : 's'}`;
    const content =
      direction === 'IN'
        ? `📥 Logged ${quantity} ${unitLabel} incoming.`
        : `📤 Logged ${quantity} ${unitLabel} outgoing${log.destination ? ` to ${log.destination}` : ''}.`;

    return { content, botId: this.botId };
  }

  async getMetrics(period: 'week' | 'month' | 'year') {
    const lookbackDays: Record<typeof period, number> = { week: 12 * 7, month: 12 * 31, year: 5 * 366 };
    const since = new Date(Date.now() - lookbackDays[period] * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.$queryRaw<
      { bucket: Date; direction: string; unitType: string; totalQuantity: bigint }[]
    >`
      SELECT date_trunc(${period}, "createdAt") as bucket,
             direction, "unitType",
             sum(quantity)::bigint as "totalQuantity"
      FROM dock_logs
      WHERE "createdAt" >= ${since}
      GROUP BY bucket, direction, "unitType"
      ORDER BY bucket ASC
    `;

    return rows.map((r) => ({
      bucket: r.bucket,
      direction: r.direction,
      unitType: r.unitType,
      totalQuantity: Number(r.totalQuantity),
    }));
  }
}
