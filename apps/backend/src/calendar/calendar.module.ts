import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChannelsModule } from '../channels/channels.module';
import { RemindersModule } from '../reminders/reminders.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { CalendarScheduler } from './calendar.scheduler';

@Module({
  imports: [AuthModule, ChannelsModule, RemindersModule],
  controllers: [CalendarController],
  providers: [CalendarService, CalendarScheduler],
})
export class CalendarModule {}
