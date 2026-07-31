import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { attachmentUpload } from '../uploads/uploads.util';
import { ChannelsService } from './channels.service';
import { VoiceService } from '../voice/voice.service';

@UseGuards(JwtAuthGuard)
@Controller('channels')
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly voiceService: VoiceService,
  ) {}

  @Get()
  findAll(@Req() req: Request) {
    return this.channelsService.findAllForUser(req.user!.userId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MOD')
  create(@Body('name') name: string, @Body('type') type: string | undefined, @Req() req: Request) {
    if (type !== undefined && type !== 'TEXT' && type !== 'VOICE') {
      throw new BadRequestException('type must be TEXT or VOICE');
    }
    return this.channelsService.create(name, req.user!.userId, type);
  }

  @Post(':id/voice-token')
  async createVoiceToken(@Param('id') id: string, @Req() req: Request) {
    await this.channelsService.ensureMembership(id, req.user!.userId);
    return this.voiceService.createToken(id, req.user!.userId);
  }

  @Post('dm')
  createDm(@Body('userId') targetUserId: string, @Req() req: Request) {
    return this.channelsService.createDm(req.user!.userId, targetUserId);
  }

  @Get(':id/messages')
  findMessages(@Param('id') id: string, @Req() req: Request) {
    return this.channelsService.findMessages(id, req.user!.userId);
  }

  @Patch(':id/mute')
  setMuted(@Param('id') id: string, @Body('muted') muted: boolean, @Req() req: Request) {
    return this.channelsService.setMuted(id, req.user!.userId, muted);
  }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', attachmentUpload))
  async uploadAttachment(
    @Param('id') channelId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    await this.channelsService.ensureMembership(channelId, req.user!.userId);
    return {
      url: `/uploads/attachments/${file.filename}`,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}
