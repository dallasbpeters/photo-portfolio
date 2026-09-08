import { containedBy } from "../../config/graph.js";

/**
 * Which pictures a board item stands for.
 *
 * Lifted out of api/boards/[id]/export.ts so the dataset endpoint can ask the
 * same question and get the same answer. The two do different things with the
 * pictures — one hands them back as a download, the other packs them for a
 * trainer — but "what is on this frame" must mean one thing, or exporting a
 * frame and training on it would quietly disagree about its contents.
 *
 * The geometry is the reason this cannot be a SQL clause. A frame does not own
 * its contents in the database; it *contains* them by sitting under them on the
 * canvas, and `containedBy` is what decides that. So the rows come back
 * unfiltered and the containment is worked out here, with the same function the
 * canvas uses.
 */

export interface ItemRow {
  config: unknown;
  height: number | string;
  id: string;
  image_url: string | null;
  kind: string;
  photo_url: string | null;
  result: unknown;
  width: number | string;
  x: number | string;
  y: number | string;
}

const num = (value: number | string): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const asObject = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

/** Every picture a node produced, newest run first, in the order shown. */
export const resultUrls = (row: ItemRow): string[] => {
  const result = asObject(row.result);
  const variations = Array.isArray(result.variations)
    ? (result.variations as Record<string, unknown>[])
    : [];
  const urls = variations
    .map((variation) => variation?.url)
    .filter((url): url is string => typeof url === "string" && url !== "");
  if (urls.length > 0) {
    return urls;
  }
  return typeof result.url === "string" ? [result.url] : [];
};

/**
 * What to pack, given what was asked for.
 *
 * A node means its own output. A frame means what is sitting on it — which is
 * how you export or train on an arrangement without first wiring it into
 * anything.
 */
export const urlsFor = (target: ItemRow, rows: ItemRow[]): string[] => {
  if (target.kind !== "frame") {
    const own = resultUrls(target);
    return own.length > 0
      ? own
      : [target.photo_url ?? target.image_url].filter(
          (url): url is string => typeof url === "string" && url !== ""
        );
  }
  const box = (row: ItemRow) => ({
    height: num(row.height),
    id: row.id,
    kind: row.kind,
    width: num(row.width),
    x: num(row.x),
    y: num(row.y),
  });
  return containedBy(box(target), rows.map(box)).flatMap((inside) => {
    const row = rows.find((candidate) => candidate.id === inside.id);
    return row ? urlsFor(row, rows) : [];
  });
};
