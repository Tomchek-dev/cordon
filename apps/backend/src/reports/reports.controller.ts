import { BadRequestException, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ReportsService } from './reports.service';

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  list() {
    return this.reportsService.listReports();
  }

  @Get('metrics')
  metrics(@Query('period') period: string | undefined) {
    if (period !== 'week' && period !== 'month' && period !== 'year') {
      throw new BadRequestException('period must be week, month, or year');
    }
    return this.reportsService.getUserMetrics(period);
  }

  @Post('generate')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MOD')
  generate() {
    return this.reportsService.generateReport();
  }
}
