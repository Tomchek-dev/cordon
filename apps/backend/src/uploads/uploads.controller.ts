import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Response } from 'express';
import { ATTACHMENTS_DIR, AVATARS_DIR } from './uploads.util';
import { decryptFile } from './encryption.util';

// Public and unauthenticated, same as the static-file serving this replaces:
// avatars need to load in <img> tags, which don't send Authorization headers.
@Controller('uploads')
export class UploadsController {
  @Get('avatars/:filename')
  async avatar(@Param('filename') filename: string, @Res() res: Response) {
    return this.serve(AVATARS_DIR, filename, res);
  }

  @Get('attachments/:filename')
  async attachment(@Param('filename') filename: string, @Res() res: Response) {
    return this.serve(ATTACHMENTS_DIR, filename, res);
  }

  private async serve(dir: string, filename: string, res: Response) {
    // filename is generated server-side (randomUUID-based) and never contains
    // path separators, but reject anything that could escape the directory anyway.
    if (filename.includes('/') || filename.includes('..')) {
      throw new NotFoundException('file not found');
    }

    let raw: Buffer;
    try {
      raw = await readFile(join(dir, filename));
    } catch {
      throw new NotFoundException('file not found');
    }

    const { mimeType, data } = decryptFile(raw);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(data);
  }
}
