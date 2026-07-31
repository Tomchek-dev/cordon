import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReportsService } from './reports.service';

@Injectable()
export class ReportsScheduler {
  private readonly logger = new Logger(ReportsScheduler.name);

  constructor(private readonly reports: ReportsService) {}

  // Every day at 11:59 PM, per the plan.
  @Cron('59 23 * * *')
  async handleDailyReport() {
    try {
      await this.reports.generateReport();
    } catch (err) {
      this.logger.error(`Failed to generate daily report: ${(err as Error).message}`);
    }
  }
}
