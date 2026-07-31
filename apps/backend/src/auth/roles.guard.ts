import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    // Checked live against the DB (not the JWT) so a role change takes effect
    // immediately instead of waiting for the user's next login.
    const user = await this.prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('insufficient permissions');
    }
    return true;
  }
}
