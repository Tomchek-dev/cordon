import { Body, Controller, Delete, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PushService, type PushSubscriptionDto } from './push.service';

@UseGuards(JwtAuthGuard)
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('public-key')
  getPublicKey() {
    return this.pushService.getPublicKey();
  }

  @Post('subscribe')
  subscribe(@Body() sub: PushSubscriptionDto, @Req() req: Request) {
    return this.pushService.subscribe(req.user!.userId, sub);
  }

  @Delete('subscribe')
  unsubscribe(@Body('endpoint') endpoint: string) {
    return this.pushService.unsubscribe(endpoint);
  }
}
