import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SearchService } from './search.service';

@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('messages')
  searchMessages(
    @Query('q') query: string,
    @Query('channelId') channelId: string | undefined,
    @Req() req: Request,
  ) {
    return this.searchService.searchMessages(req.user!.userId, query ?? '', channelId);
  }
}
