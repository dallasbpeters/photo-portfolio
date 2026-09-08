/**
 * One format for every timestamp that leaves the server.
 *
 * The two drivers disagree, and the disagreement is silent. The neon HTTP
 * client parses `timestamptz` into a `Date`, which `JSON.stringify` renders as
 * ISO 8601 for free. Drizzle types the same column as whatever its `mode` says
 * — and a `mode: "string"` column arrives as the text Postgres prints,
 * `"2026-08-22 18:47:04.595078+00"`, which is not ISO 8601 and which a
 * browser's `new Date()` is not obliged to parse.
 *
 * So every DTO that passed a timestamp straight through was relying on which
 * driver had loaded the row. That worked for as long as there was one driver.
 * Converting an endpoint changed the format of its responses without changing
 * a line of the DTO, which is the kind of break that reaches a client rather
 * than a test.
 *
 * The row types were part of the same untruth: they declared `created_at:
 * string` and were handed a Date, satisfied only by the `as` cast standing in
 * front of every raw query.
 *
 * This is the one place that decides, so the answer no longer depends on how
 * the row was loaded.
 */

/**
 * A timestamp as ISO 8601, whatever the driver handed over.
 *
 * The string is passed to `Date` exactly as it arrives. Tidying it into
 * something ISO-looking first is the trap: `"…04.595078+00"` parses on Node's
 * lenient path, and the same text with a `T` in place of the space does not
 * parse at all — `+00` is not a valid ISO offset, so making the rest stricter
 * makes the whole thing unparseable. That mistake is silent, because the
 * fallback below then returns the raw text and the value still looks like a
 * timestamp.
 *
 * An unparseable value is returned unchanged rather than throwing: a malformed
 * timestamp should not turn a list into a 500.
 */
export const toIso = (value: string | Date | null | undefined): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value !== "string") {
    return "";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
};
