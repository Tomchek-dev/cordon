import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChannelsModule } from '../channels/channels.module';
import { PresenceModule } from '../presence/presence.module';
import { ChatGateway } from './chat.gateway';
import { SlashCommandsService } from './slash-commands.service';

@Module({
  imports: [AuthModule, ChannelsModule, PresenceModule],
  providers: [ChatGateway, SlashCommandsService],
  exports: [SlashCommandsService],
})
export class ChatModule {}
