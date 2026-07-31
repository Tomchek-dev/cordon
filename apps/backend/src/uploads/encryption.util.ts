import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.UPLOADS_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      'UPLOADS_ENCRYPTION_KEY environment variable is required and must not be empty. ' +
        'Generate one with: openssl rand -hex 32',
    );
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error('UPLOADS_ENCRYPTION_KEY must be a 32-byte (64 hex character) key');
  }
  return key;
}

// On-disk format: [2-byte mimeType length][mimeType utf8][12-byte IV][16-byte authTag][ciphertext]
// Keeping the mimetype alongside the ciphertext means the serving route can set the
// correct Content-Type without a separate DB lookup or sidecar file.
export function encryptFile(data: Buffer, mimeType: string): Buffer {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const mimeTypeBuf = Buffer.from(mimeType, 'utf8');
  const mimeTypeLength = Buffer.alloc(2);
  mimeTypeLength.writeUInt16BE(mimeTypeBuf.length);

  return Buffer.concat([mimeTypeLength, mimeTypeBuf, iv, authTag, ciphertext]);
}

export function decryptFile(fileBuffer: Buffer): { mimeType: string; data: Buffer } {
  const key = getKey();
  const mimeTypeLength = fileBuffer.readUInt16BE(0);
  let offset = 2;
  const mimeType = fileBuffer.subarray(offset, offset + mimeTypeLength).toString('utf8');
  offset += mimeTypeLength;
  const iv = fileBuffer.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;
  const authTag = fileBuffer.subarray(offset, offset + AUTH_TAG_LENGTH);
  offset += AUTH_TAG_LENGTH;
  const ciphertext = fileBuffer.subarray(offset);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const data = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return { mimeType, data };
}
