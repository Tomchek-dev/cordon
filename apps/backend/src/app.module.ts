import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { UploadsModule } from './uploads/uploads.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { CalendarModule } from './calendar/calendar.module';
import { PickupsModule } from './pickups/pickups.module';
import { DockModule } from './dock/dock.module';
import { GifsModule } from './gifs/gifs.module';
import { RolesModule } from './roles/roles.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
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
    UploadsModule,
    AuditLogModule,
    CalendarModule,
    PickupsModule,
    DockModule,
    GifsModule,
    RolesModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
