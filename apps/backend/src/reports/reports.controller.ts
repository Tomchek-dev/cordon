import { Controller, Get, Post, UseGuards } from '@nestjs/common';
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

  @Post('generate')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MOD')
  generate() {
    return this.reportsService.generateReport();
  }
}
