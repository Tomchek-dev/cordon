import { IsOptional, IsUrl } from 'class-validator';

export class UpdateBotDto {
  @IsOptional()
  @IsUrl({ require_tld: false })
  webhookUrl?: string;
}
