import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SlashCommandsService } from './slash-commands.service';
import { BangCommandsService } from './bang-commands.service';

@UseGuards(JwtAuthGuard)
@Controller('commands')
export class CommandsController {
  constructor(
    private readonly slashCommands: SlashCommandsService,
    private readonly bangCommands: BangCommandsService,
  ) {}

  @Get()
  list() {
    return {
      slash: this.slashCommands.list(),
      bang: this.bangCommands.list(),
    };
  }
}
