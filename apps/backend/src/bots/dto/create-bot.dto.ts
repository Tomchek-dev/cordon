import { IsOptional, IsString, IsUrl, Length } from 'class-validator';

export class CreateBotDto {
  @IsString()
  @Length(2, 32)
  name: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  webhookUrl?: string;
}
