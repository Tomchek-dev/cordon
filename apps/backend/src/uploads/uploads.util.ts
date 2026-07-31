import { existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { diskStorage } from 'multer';
import type { Request } from 'express';

export const UPLOAD_ROOT = join(process.cwd(), 'uploads');
export const AVATARS_DIR = join(UPLOAD_ROOT, 'avatars');
export const ATTACHMENTS_DIR = join(UPLOAD_ROOT, 'attachments');

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export const avatarUpload = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      ensureDir(AVATARS_DIR);
      cb(null, AVATARS_DIR);
    },
    filename: (req: Request, file, cb) => {
      cb(null, `${req.user!.userId}-${randomUUID()}${extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, accept: boolean) => void) => {
    cb(file.mimetype.startsWith('image/') ? null : new Error('avatar must be an image'), file.mimetype.startsWith('image/'));
  },
};

export const attachmentUpload = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      ensureDir(ATTACHMENTS_DIR);
      cb(null, ATTACHMENTS_DIR);
    },
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}${extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
};
