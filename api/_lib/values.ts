/**
 * The three coercions every incoming payload is put through.
 *
 * Lifted out of boards.ts so that a second parser — anything else that has to
 * clamp a number or bound a string from the client — can use the same rules
 * rather than writing its own slightly different ones. They are the whole of
 * "never trust a number from a canvas the user drags directly".
 */

/** Coerces anything to a finite number, falling back rather than yielding NaN. */
export const num = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** A trimmed, length-capped string, or null when there was nothing usable. */
export const text = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};
