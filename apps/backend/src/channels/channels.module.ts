import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { VoiceService } from '../voice/voice.service';

@Module({
  imports: [AuthModule],
  controllers: [ChannelsController],
  providers: [ChannelsService, VoiceService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
