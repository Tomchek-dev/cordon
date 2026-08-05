import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findAll() {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: { assignments: { select: { userId: true } } },
    });
    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      userIds: role.assignments.map((a) => a.userId),
    }));
  }

  async create(actorId: string, name: string) {
    const existing = await this.prisma.role.findUnique({ where: { name } });
    if (existing) {
      throw new ConflictException('a role with this name already exists');
    }
    const role = await this.prisma.role.create({ data: { name } });
    await this.auditLog.log(actorId, 'role.created', 'Role', role.id, { name });
    return { id: role.id, name: role.name, userIds: [] as string[] };
  }

  async delete(actorId: string, roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('role not found');
    }
    await this.prisma.role.delete({ where: { id: roleId } });
    await this.auditLog.log(actorId, 'role.deleted', 'Role', roleId, { name: role.name });
    return { ok: true };
  }

  async assign(actorId: string, roleId: string, userId: string) {
    const [role, user] = await Promise.all([
      this.prisma.role.findUnique({ where: { id: roleId } }),
      this.prisma.user.findUnique({ where: { id: userId } }),
    ]);
    if (!role) throw new NotFoundException('role not found');
    if (!user) throw new NotFoundException('user not found');

    await this.prisma.roleAssignment.upsert({
      where: { roleId_userId: { roleId, userId } },
      create: { roleId, userId },
      update: {},
    });
    await this.auditLog.log(actorId, 'role.assigned', 'Role', roleId, {
      roleName: role.name,
      username: user.username,
    });
    return { ok: true };
  }

  async unassign(actorId: string, roleId: string, userId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('role not found');

    await this.prisma.roleAssignment.deleteMany({ where: { roleId, userId } });
    await this.auditLog.log(actorId, 'role.unassigned', 'Role', roleId, { roleName: role.name, userId });
    return { ok: true };
  }
}
