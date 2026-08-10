import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BotsService } from './bots.service';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';

@UseGuards(JwtAuthGuard)
@Controller('bots')
export class BotsController {
  constructor(private readonly botsService: BotsService) {}

  @Get()
  findAll(@Req() req: Request) {
    return this.botsService.findAllForOwner(req.user!.userId);
  }

  @Get('dm-available')
  findDmEnabled() {
    return this.botsService.findDmEnabled();
  }

  @Post()
  create(@Body() dto: CreateBotDto, @Req() req: Request) {
    return this.botsService.create(req.user!.userId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBotDto, @Req() req: Request) {
    return this.botsService.update(req.user!.userId, id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.botsService.remove(req.user!.userId, id);
  }
}
