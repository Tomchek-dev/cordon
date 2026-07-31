import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { VoiceService } from '../voice/voice.service';

@Module({
  imports: [AuthModule, AuditLogModule],
  controllers: [ChannelsController],
  providers: [ChannelsService, VoiceService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
