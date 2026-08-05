import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { DockService } from './dock.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'MOD')
@Controller('dock')
export class DockController {
  constructor(private readonly dockService: DockService) {}

  @Get('metrics')
  metrics(@Query('period') period: string | undefined) {
    if (period !== 'week' && period !== 'month' && period !== 'year') {
      throw new BadRequestException('period must be week, month, or year');
    }
    return this.dockService.getMetrics(period);
  }
}
