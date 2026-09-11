/**
 * What fal will accept as a source picture, and how to get under it.
 *
 * Split from shrinkForFal.ts for the same reason falBody.ts and falEndpoint.ts
 * were split from fal.ts: that file reaches sharp, which is a native module
 * and cannot be loaded in the browser environment this project's tests run in.
 * This half is pure, and it is the half worth testing — it decides whether a
 * run pays for a re-encode at all.
 */

/** fal's limit, and the whole reason this file exists. */
export const FAL_MAX_BYTES = 5_242_880;

/**
 * The sizes to try, largest first.
 *
 * A ladder rather than one guess, because how much a picture shrinks depends
 * on the picture: a flat graphic reduces enormously and a noisy photograph
 * barely at all. Stopping at the first rung that fits keeps the most detail
 * that will pass.
 *
 * The bottom rung is deliberately small. A run that reaches it has a picture
 * that will not compress, and a thousand pixels of subject is worth more than
 * a generation refused.
 */
export const SHRINK_STEPS: readonly { quality: number; side: number }[] = [
  { quality: 88, side: 2048 },
  { quality: 80, side: 1536 },
  { quality: 72, side: 1024 },
];

/**
 * Whether this picture has to be re-encoded before fal will take it.
 *
 * An unknown size is treated as fine. A HEAD without content-length is common
 * enough, and shrinking every picture on the chance it might be large costs
 * every run a download and a re-encode to fix a minority.
 */
export const overFalLimit = (bytes: number | null): boolean =>
  bytes !== null && bytes > FAL_MAX_BYTES;
