import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CalendarService, type CreateCalendarEventInput } from './calendar.service';

@UseGuards(JwtAuthGuard)
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get()
  findForUser(@Req() req: Request) {
    return this.calendarService.findForUser(req.user!.userId);
  }

  @Post()
  create(@Body() input: CreateCalendarEventInput, @Req() req: Request) {
    return this.calendarService.create(req.user!.userId, input);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.calendarService.remove(req.user!.userId, id);
  }
}
