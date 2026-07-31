import { IsString, Length } from 'class-validator';

export class PostBotMessageDto {
  @IsString()
  channelId: string;

  @IsString()
  @Length(1, 4000)
  content: string;
}
