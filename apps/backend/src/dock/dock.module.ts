import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { DockController } from './dock.controller';
import { DockService } from './dock.service';

@Module({
  imports: [AuthModule, ChatModule, AuditLogModule],
  controllers: [DockController],
  providers: [DockService],
})
export class DockModule {}
