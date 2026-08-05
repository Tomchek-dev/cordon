import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { BangCommandsService, type BangCommandReply } from '../chat/bang-commands.service';
import type { SlashCommandContext } from '../chat/slash-commands.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ATTACHMENTS_DIR, attachmentFilename, ensureDir } from '../uploads/uploads.util';
import { encryptFile } from '../uploads/encryption.util';
import { generatePickupLabel } from './label.util';

const PICKUP_BOT_TOKEN_HASH = 'system:pickup-bot';

@Injectable()
export class PickupsService implements OnModuleInit {
  private readonly logger = new Logger(PickupsService.name);
  private botId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bangCommands: BangCommandsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async onModuleInit() {
    const bot = await this.prisma.bot.upsert({
      where: { tokenHash: PICKUP_BOT_TOKEN_HASH },
      update: {},
      create: { name: 'Pickup Bot', tokenHash: PICKUP_BOT_TOKEN_HASH, ownerId: null, permissions: [] },
    });
    this.botId = bot.id;
    this.logger.log(`Pickup Bot ready (id=${bot.id})`);

    this.bangCommands.register('me', 'Claim the next warehouse pickup in this channel\'s rotation', (ctx) =>
      this.handleMe(ctx),
    );
  }

  private async handleMe(ctx: SlashCommandContext): Promise<BangCommandReply> {
    let rotation = await this.prisma.pickupRotation.findUnique({ where: { channelId: ctx.channelId } });

    if (!rotation) {
      rotation = await this.prisma.pickupRotation.create({
        data: { channelId: ctx.channelId, memberOrder: [ctx.userId], currentIndex: 0 },
      });
    } else if (!rotation.memberOrder.includes(ctx.userId)) {
      rotation = await this.prisma.pickupRotation.update({
        where: { channelId: ctx.channelId },
        data: { memberOrder: [...rotation.memberOrder, ctx.userId] },
      });
    }

    const whoseTurnId = rotation.memberOrder[rotation.currentIndex % rotation.memberOrder.length];
    if (whoseTurnId !== ctx.userId) {
      const whoseTurn = await this.prisma.user.findUnique({ where: { id: whoseTurnId } });
      return {
        content: `It's ${whoseTurn?.displayName ?? 'someone else'}'s turn next, not yours. Hang tight!`,
        botId: this.botId,
      };
    }

    const user = await this.prisma.user.findUnique({ where: { id: ctx.userId } });
    const displayName = user?.displayName ?? 'Unknown';

    const pickup = await this.prisma.pickup.create({
      data: { channelId: ctx.channelId, assignedToId: ctx.userId, labelUrl: '' },
    });

    const labelBuffer = await generatePickupLabel(pickup.id, displayName);
    ensureDir(ATTACHMENTS_DIR);
    const filename = attachmentFilename(`pickup-${pickup.id}.png`);
    await writeFile(join(ATTACHMENTS_DIR, filename), encryptFile(labelBuffer, 'image/png'));
    const labelUrl = `/uploads/attachments/${filename}`;
    await this.prisma.pickup.update({ where: { id: pickup.id }, data: { labelUrl } });

    await this.prisma.pickupRotation.update({
      where: { channelId: ctx.channelId },
      data: { currentIndex: rotation.currentIndex + 1 },
    });

    await this.auditLog.log(ctx.userId, 'pickup.assigned', 'Pickup', pickup.id, { channelId: ctx.channelId });

    return {
      content: `📦 Pickup #${pickup.id.slice(0, 8).toUpperCase()} assigned to ${displayName}. Label ready to print.`,
      botId: this.botId,
      attachmentUrl: labelUrl,
      attachmentName: `pickup-${pickup.id.slice(0, 8)}.png`,
      attachmentMimeType: 'image/png',
      attachmentSize: labelBuffer.length,
    };
  }
}
