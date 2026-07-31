export function getRequiredJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'JWT_SECRET environment variable is required and must not be empty. ' +
        'Generate one with: openssl rand -hex 32',
    );
  }
  return secret;
}
