import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../presence/presence.service';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      select: { id: true, username: true, displayName: true, status: true, avatar: true, role: true },
      orderBy: { displayName: 'asc' },
    });
    const liveStatuses = await this.presence.getAllStatuses();

    return users.map((user) => ({
      ...user,
      status: liveStatuses[user.id] ?? user.status,
    }));
  }

  findMe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        status: true,
        avatar: true,
        role: true,
        notifyDmOnly: true,
      },
    });
  }

  async setPreferences(userId: string, notifyDmOnly: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { notifyDmOnly },
      select: { id: true, notifyDmOnly: true },
    });
  }

  async setRole(actorId: string, targetUserId: string, role: 'ADMIN' | 'MOD' | 'MEMBER') {
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) {
      throw new NotFoundException('user not found');
    }
    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role },
      select: { id: true, username: true, displayName: true, role: true },
    });
    await this.auditLog.log(actorId, 'user.role_changed', 'User', targetUserId, {
      username: target.username,
      fromRole: target.role,
      toRole: role,
    });
    return updated;
  }

  async setAvatar(userId: string, avatarUrl: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
      select: { id: true, username: true, displayName: true, avatar: true },
    });
  }
}
