import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { EbayService } from './ebay.service';

@Module({
  imports: [ChatModule],
  providers: [EbayService],
})
export class EbayModule {}
