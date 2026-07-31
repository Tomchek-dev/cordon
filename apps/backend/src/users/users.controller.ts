import {
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
import { AVATARS_DIR, avatarFilename, avatarUpload, ensureDir } from '../uploads/uploads.util';
import { encryptFile } from '../uploads/encryption.util';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get('me')
  me(@Req() req: Request) {
    return this.usersService.findMe(req.user!.userId);
  }

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('avatar', avatarUpload))
  async uploadAvatar(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    ensureDir(AVATARS_DIR);
    const filename = avatarFilename(req.user!.userId, file.originalname);
    await writeFile(join(AVATARS_DIR, filename), encryptFile(file.buffer, file.mimetype));
    return this.usersService.setAvatar(req.user!.userId, `/uploads/avatars/${filename}`);
  }

  @Patch('me/preferences')
  setPreferences(@Body('notifyDmOnly') notifyDmOnly: boolean, @Req() req: Request) {
    return this.usersService.setPreferences(req.user!.userId, notifyDmOnly);
  }

  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  setRole(@Param('id') id: string, @Body('role') role: 'ADMIN' | 'MOD' | 'MEMBER', @Req() req: Request) {
    return this.usersService.setRole(req.user!.userId, id, role);
  }
}
