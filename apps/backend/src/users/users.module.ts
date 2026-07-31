import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PresenceModule } from '../presence/presence.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, PresenceModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
