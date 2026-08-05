import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RolesService } from './roles.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  // MOD needs this to populate the "restrict to roles" checklist when creating a channel.
  @Get()
  @Roles('ADMIN', 'MOD')
  findAll() {
    return this.rolesService.findAll();
  }

  @Post()
  @Roles('ADMIN')
  create(@Body('name') name: string, @Req() req: Request) {
    return this.rolesService.create(req.user!.userId, name);
  }

  @Delete(':id')
  @Roles('ADMIN')
  delete(@Param('id') id: string, @Req() req: Request) {
    return this.rolesService.delete(req.user!.userId, id);
  }

  @Post(':id/assign')
  @Roles('ADMIN')
  assign(@Param('id') id: string, @Body('userId') userId: string, @Req() req: Request) {
    return this.rolesService.assign(req.user!.userId, id, userId);
  }

  @Delete(':id/assign/:userId')
  @Roles('ADMIN')
  unassign(@Param('id') id: string, @Param('userId') userId: string, @Req() req: Request) {
    return this.rolesService.unassign(req.user!.userId, id, userId);
  }
}
