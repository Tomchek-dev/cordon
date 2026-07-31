import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/client';

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  log(
    actorId: string | null,
    action: string,
    targetType: string,
    targetId?: string,
    metadata?: Record<string, unknown>,
  ) {
    // Fire-and-forget: an audit log write failing should never block the
    // action it's recording.
    return this.prisma.auditLog
      .create({
        data: { actorId, action, targetType, targetId, metadata: metadata as Prisma.InputJsonValue },
      })
      .catch(() => {});
  }

  list(limit = 200) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { actor: { select: { id: true, username: true, displayName: true } } },
    });
  }
}
