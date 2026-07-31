import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChannelsModule } from '../channels/channels.module';
import { BotsController } from './bots.controller';
import { BotIngestController } from './bot-ingest.controller';
import { BotsService } from './bots.service';
import { BotWebhooksService } from './bot-webhooks.service';

@Module({
  imports: [AuthModule, ChannelsModule],
  controllers: [BotsController, BotIngestController],
  providers: [BotsService, BotWebhooksService],
})
export class BotsModule {}
