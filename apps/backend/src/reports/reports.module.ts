import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsScheduler } from './reports.scheduler';

@Module({
  imports: [AuthModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsScheduler],
})
export class ReportsModule {}
