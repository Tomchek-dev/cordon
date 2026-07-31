import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { MESSAGE_AUTHOR_INCLUDE, MESSAGE_CREATED_EVENT, type MessageCreatedEvent } from '../chat/events';

const REPORT_BOT_TOKEN_HASH = 'system:report-bot';
const REPORT_CHANNEL_NAME = 'daily-report';

interface ChannelStat {
  name: string;
  count: number;
  topContributors: { name: string; count: number }[];
}

@Injectable()
export class ReportsService implements OnModuleInit {
  private readonly logger = new Logger(ReportsService.name);
  private botId: string;
  private reportChannelId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async onModuleInit() {
    const bot = await this.prisma.bot.upsert({
      where: { tokenHash: REPORT_BOT_TOKEN_HASH },
      update: {},
      create: { name: 'Report Bot', tokenHash: REPORT_BOT_TOKEN_HASH, ownerId: null, permissions: [] },
    });
    this.botId = bot.id;

    let channel = await this.prisma.channel.findFirst({
      where: { name: REPORT_CHANNEL_NAME, type: 'TEXT' },
    });
    if (!channel) {
      channel = await this.prisma.channel.create({
        data: { name: REPORT_CHANNEL_NAME, type: 'TEXT', isPrivate: false },
      });
    }
    this.reportChannelId = channel.id;

    this.logger.log(`Report Bot ready (id=${bot.id}), posting to #${REPORT_CHANNEL_NAME} (id=${channel.id})`);
  }

  getBotId(): string {
    return this.botId;
  }

  getReportChannelId(): string {
    return this.reportChannelId;
  }

  listReports(limit = 30) {
    return this.prisma.dailyReport.findMany({ orderBy: { date: 'desc' }, take: limit });
  }

  async generateReport(forDate: Date = new Date()) {
    const startOfDay = new Date(forDate);
    startOfDay.setHours(0, 0, 0, 0);

    const channels = await this.prisma.channel.findMany({
      where: { type: 'TEXT', isPrivate: false, id: { not: this.reportChannelId } },
    });

    const stats: ChannelStat[] = [];
    for (const channel of channels) {
      const messages = await this.prisma.message.findMany({
        where: { channelId: channel.id, createdAt: { gte: startOfDay } },
        select: { author: { select: { displayName: true } }, botId: true },
      });
      if (messages.length === 0) continue;

      const counts = new Map<string, number>();
      for (const m of messages) {
        const name = m.author?.displayName ?? (m.botId ? 'Bot' : 'Unknown');
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      const topContributors = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => ({ name, count }));

      stats.push({ name: channel.name, count: messages.length, topContributors });
    }

    const unresolvedReminders = await this.prisma.botEvent.count({
      where: { type: 'REMINDER', sentAt: null },
    });

    const digest = this.buildDigest(startOfDay, stats, unresolvedReminders);
    const content = (await this.trySummarize(digest)) ?? digest;

    const message = await this.prisma.message.create({
      data: { channelId: this.reportChannelId, botId: this.botId, content },
      include: MESSAGE_AUTHOR_INCLUDE,
    });
    this.events.emit(MESSAGE_CREATED_EVENT, message satisfies MessageCreatedEvent);

    return this.prisma.dailyReport.create({
      data: { date: startOfDay, channelId: this.reportChannelId, content },
    });
  }

  private buildDigest(date: Date, stats: ChannelStat[], unresolvedReminders: number): string {
    const lines = [`📊 Daily Report — ${date.toLocaleDateString()}`, ''];

    if (stats.length === 0) {
      lines.push('No channel activity today.');
    } else {
      for (const stat of stats) {
        lines.push(`#${stat.name}: ${stat.count} message${stat.count === 1 ? '' : 's'}`);
        for (const c of stat.topContributors) {
          lines.push(`  • ${c.name}: ${c.count}`);
        }
      }
    }

    lines.push('');
    lines.push(`⏰ ${unresolvedReminders} pending reminder${unresolvedReminders === 1 ? '' : 's'}`);
    return lines.join('\n');
  }

  // Optional per the plan - falls back to the deterministic digest on any
  // failure (no credentials configured, network error, refusal, etc).
  private async trySummarize(digest: string): Promise<string | null> {
    try {
      const anthropic = new Anthropic();
      const response = await anthropic.messages.create({
        model: 'claude-opus-5',
        max_tokens: 1024,
        output_config: { effort: 'low' },
        messages: [
          {
            role: 'user',
            content:
              'Rewrite the following raw daily activity digest for an internal team chat tool ' +
              'into a short, friendly, readable summary. Keep every number exactly as given - do ' +
              "not invent or estimate activity that isn't listed. Plain text only, no markdown headers.\n\n" +
              digest,
          },
        ],
      });

      if (response.stop_reason === 'refusal') {
        this.logger.warn('LLM summarization refused; falling back to deterministic digest');
        return null;
      }
      const textBlock = response.content.find((b) => b.type === 'text');
      return textBlock && 'text' in textBlock ? textBlock.text : null;
    } catch (err) {
      this.logger.warn(`LLM summarization unavailable, using deterministic digest: ${(err as Error).message}`);
      return null;
    }
  }
}
