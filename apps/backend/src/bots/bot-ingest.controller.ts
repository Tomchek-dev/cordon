import { Body, Controller, Param, Post } from '@nestjs/common';
import { BotsService } from './bots.service';
import { PostBotMessageDto } from './dto/post-bot-message.dto';

// Authenticated by the bot token in the URL, not a user JWT - deliberately
// outside JwtAuthGuard. Matches Discord/Slack-style incoming webhook APIs.
@Controller('api/bots')
export class BotIngestController {
  constructor(private readonly botsService: BotsService) {}

  @Post(':token/messages')
  postMessage(@Param('token') token: string, @Body() dto: PostBotMessageDto) {
    return this.botsService.postMessage(token, dto.channelId, dto.content);
  }
}
