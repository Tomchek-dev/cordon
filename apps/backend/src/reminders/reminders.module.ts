import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { RemindersService } from './reminders.service';
import { RemindersScheduler } from './reminders.scheduler';

@Module({
  imports: [ChatModule],
  providers: [RemindersService, RemindersScheduler],
})
export class RemindersModule {}
