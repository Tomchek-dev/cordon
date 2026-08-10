import { existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { memoryStorage } from 'multer';
import type { Request } from 'express';

export const UPLOAD_ROOT = join(process.cwd(), 'uploads');
export const AVATARS_DIR = join(UPLOAD_ROOT, 'avatars');
export const ATTACHMENTS_DIR = join(UPLOAD_ROOT, 'attachments');

export function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// Files are buffered in memory (not streamed straight to disk) so the
// controller can encrypt them before they ever touch the filesystem.
export const avatarUpload = {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, accept: boolean) => void) => {
    cb(file.mimetype.startsWith('image/') ? null : new Error('avatar must be an image'), file.mimetype.startsWith('image/'));
  },
};

// Capped at 250MB rather than higher because the whole file is buffered in
// memory (see the comment above) before it's written to disk - keep the
// frontend's pre-flight check in page.tsx's handleAttachmentChange in sync
// if this changes.
export const attachmentUpload = {
  storage: memoryStorage(),
  limits: { fileSize: 250 * 1024 * 1024 },
};

export function avatarFilename(userId: string, originalname: string) {
  return `${userId}-${randomUUID()}${extname(originalname)}`;
}

export function attachmentFilename(originalname: string) {
  return `${randomUUID()}${extname(originalname)}`;
}
