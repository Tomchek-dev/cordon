import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GifsService } from './gifs.service';

@UseGuards(JwtAuthGuard)
@Controller('gifs')
export class GifsController {
  constructor(private readonly gifsService: GifsService) {}

  @Get('enabled')
  enabled() {
    return { enabled: this.gifsService.isEnabled() };
  }

  @Get('search')
  search(@Query('q') query: string | undefined) {
    if (!query?.trim()) {
      throw new BadRequestException('q is required');
    }
    return this.gifsService.search(query.trim());
  }
}
