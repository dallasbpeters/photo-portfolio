import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** How long a reset link stays valid. */
export const RESET_TOKEN_TTL_MINUTES = 60;

/** URL-safe secret mailed to the user. 32 bytes = 256 bits of entropy. */
export const createResetToken = (): string => randomBytes(32).toString('base64url');

/**
 * Only this hash is persisted. SHA-256 without a salt is correct here (unlike for
 * passwords): the input is already high-entropy random, so there is nothing to
 * brute-force and lookup by hash must stay a single indexed query.
 */
export const hashResetToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** Constant-time compare so hash comparison can't be timed. */
export const resetTokenMatches = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};

/** Minimum length enforced on a newly chosen password. */
export const MIN_PASSWORD_LENGTH = 8;
