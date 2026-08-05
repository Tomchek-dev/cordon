import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChannelsModule } from '../channels/channels.module';
import { PresenceModule } from '../presence/presence.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ChatGateway } from './chat.gateway';
import { SlashCommandsService } from './slash-commands.service';
import { BangCommandsService } from './bang-commands.service';
import { CommandsController } from './commands.controller';

@Module({
  imports: [AuthModule, ChannelsModule, PresenceModule, AuditLogModule],
  controllers: [CommandsController],
  providers: [ChatGateway, SlashCommandsService, BangCommandsService],
  exports: [SlashCommandsService, BangCommandsService],
})
export class ChatModule {}
