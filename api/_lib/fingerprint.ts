/**
 * A stable fingerprint of everything that could change a node's output.
 *
 * This is what lets a board run skip a node that would only produce the image
 * it already has. The obvious cheaper test — has the row been touched since the
 * last run — is wrong in the direction that costs money: dragging a node across
 * the canvas touches it, so every run after any rearrangement would re-generate
 * the entire board.
 *
 * Geometry is therefore deliberately absent from the input. Moving a node must
 * never invalidate a result someone has already paid for.
 *
 * Invalidation propagates on its own. An input's value here is the
 * upstream's resolved result URL, not its id, so re-running a node produces a
 * new blob URL, which changes every fingerprint downstream of it, which re-runs
 * them. There is no dirty flag to set and therefore none to forget to set.
 */

/**
 * JSON with object keys in a fixed order.
 *
 * JSON.stringify preserves insertion order, so two objects holding the same
 * settings would hash differently purely because of the order they were built
 * in — a node would re-run for no reason after an unrelated edit.
 */
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries
    .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`)
    .join(",")}}`;
};

export interface FingerprintInput {
  /** The node's own settings — its typed prompt, its style. */
  config: Record<string, unknown> | null;
  /** Resolved value per input port: an upstream URL, or a text item's body. */
  inputs: Record<string, string | null>;
  nodeType: string;
}

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

/** SHA-256 of the canonical form, as hex. */
export const inputFingerprint = async (
  input: FingerprintInput
): Promise<string> => {
  const bytes = new TextEncoder().encode(canonical(input));
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
};
