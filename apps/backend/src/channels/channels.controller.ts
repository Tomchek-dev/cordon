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
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  ATTACHMENTS_DIR,
  AVATARS_DIR,
  attachmentFilename,
  attachmentUpload,
  avatarFilename,
  avatarUpload,
  ensureDir,
} from '../uploads/uploads.util';
import { encryptFile } from '../uploads/encryption.util';
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
  create(
    @Body('name') name: string,
    @Body('type') type: string | undefined,
    @Body('isPrivate') isPrivate: boolean | undefined,
    @Body('memberIds') memberIds: string[] | undefined,
    @Body('roleIds') roleIds: string[] | undefined,
    @Req() req: Request,
  ) {
    if (type !== undefined && type !== 'TEXT' && type !== 'VOICE') {
      throw new BadRequestException('type must be TEXT or VOICE');
    }
    return this.channelsService.create(
      name,
      req.user!.userId,
      type,
      isPrivate ?? false,
      memberIds ?? [],
      roleIds ?? [],
    );
  }

  @Post(':id/members')
  addMember(@Param('id') id: string, @Body('userId') targetUserId: string, @Req() req: Request) {
    return this.channelsService.addMember(id, req.user!.userId, targetUserId);
  }

  @Post(':id/roles')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MOD')
  addRole(@Param('id') id: string, @Body('roleId') roleId: string, @Req() req: Request) {
    return this.channelsService.addRole(id, req.user!.userId, roleId);
  }

  @Post(':id/avatar')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MOD')
  @UseInterceptors(FileInterceptor('avatar', avatarUpload))
  async uploadChannelAvatar(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    await this.channelsService.ensureMembership(id, req.user!.userId);
    ensureDir(AVATARS_DIR);
    const filename = avatarFilename(id, file.originalname);
    await writeFile(join(AVATARS_DIR, filename), encryptFile(file.buffer, file.mimetype));
    return this.channelsService.setAvatar(id, `/uploads/avatars/${filename}`);
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

  @Get(':id/pinned')
  findPinnedMessages(@Param('id') id: string, @Req() req: Request) {
    return this.channelsService.findPinnedMessages(id, req.user!.userId);
  }

  @Get(':id/read-receipts')
  getReadReceipts(@Param('id') id: string, @Req() req: Request) {
    return this.channelsService.getReadReceipts(id, req.user!.userId);
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
    ensureDir(ATTACHMENTS_DIR);
    const filename = attachmentFilename(file.originalname);
    await writeFile(join(ATTACHMENTS_DIR, filename), encryptFile(file.buffer, file.mimetype));
    return {
      url: `/uploads/attachments/${filename}`,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}
