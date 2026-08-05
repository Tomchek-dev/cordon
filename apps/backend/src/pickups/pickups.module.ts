import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { PickupsService } from './pickups.service';

@Module({
  imports: [ChatModule, AuditLogModule],
  providers: [PickupsService],
})
export class PickupsModule {}
