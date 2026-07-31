import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { ChannelsModule } from './channels/channels.module';
import { ChatModule } from './chat/chat.module';
import { UsersModule } from './users/users.module';
import { BotsModule } from './bots/bots.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RemindersModule } from './reminders/reminders.module';
import { ReportsModule } from './reports/reports.module';
import { SearchModule } from './search/search.module';
import { PushModule } from './push/push.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    AuthModule,
    ChannelsModule,
    ChatModule,
    UsersModule,
    BotsModule,
    NotificationsModule,
    RemindersModule,
    ReportsModule,
    SearchModule,
    PushModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
