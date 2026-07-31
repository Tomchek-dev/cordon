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
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { avatarUpload } from '../uploads/uploads.util';
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
  uploadAvatar(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    return this.usersService.setAvatar(req.user!.userId, `/uploads/avatars/${file.filename}`);
  }

  @Patch('me/preferences')
  setPreferences(@Body('notifyDmOnly') notifyDmOnly: boolean, @Req() req: Request) {
    return this.usersService.setPreferences(req.user!.userId, notifyDmOnly);
  }

  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  setRole(@Param('id') id: string, @Body('role') role: 'ADMIN' | 'MOD' | 'MEMBER') {
    return this.usersService.setRole(id, role);
  }
}
