import {
  DEFAULT_LOGO_PLACEMENT,
  DEFAULT_LOGO_WIDTH,
  LOGO_PLACEMENTS,
  type LogoPlacement,
} from "../../config/nodes/logoPlacement.js";
import type { BoardItemRow } from "./boards.js";

/**
 * Which logo a wired Brand node is offering, and on what terms.
 *
 * The whole point is that the mark is *not* drawn by a model. Asked to place a
 * logo, an image model redraws it — different letterforms, a warped device,
 * colours it preferred — and that is precisely the failure a brand kit exists to
 * prevent. So the picture is generated from the prompt, and then the logo file
 * is composited onto it, pixel for pixel.
 *
 * It also means the clear space and minimum width the kit stores against each
 * logo become real. Sent to a model they are prose it may ignore; here they are
 * arithmetic — see logoBox, which will not draw a mark smaller than the brand
 * allows and refuses outright when the margin will not fit.
 *
 * Pure, and deliberately free of `sharp`: the compositing lives next door in
 * brandStamp.ts. Reading the wires is the part with decisions in it — which logo
 * wins when two brands are attached, what a malformed placement falls back to —
 * and it is only testable in the browser the tests run in if importing it does
 * not drag a native image library along.
 */

/** What a wired Brand node contributes to a composite. */
export interface BrandLogo {
  /** Fraction of the logo's own width to keep clear around it. */
  clearSpace: number;
  /** The width below which the brand says the mark stops being legible. */
  minWidth: number;
  placement: LogoPlacement;
  url: string;
  /** Share of the picture's width, before minWidth is applied. */
  widthPercent: number;
}

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const num = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const placementOf = (value: unknown): LogoPlacement =>
  LOGO_PLACEMENTS.includes(value as LogoPlacement)
    ? (value as LogoPlacement)
    : DEFAULT_LOGO_PLACEMENT;

/**
 * The logo a Brand node wired into this item is offering, if any.
 *
 * Reads the wires the way `elementStyleOf` does — by target, ignoring which port
 * they landed on. A brand contributes to a node however it is attached, and
 * making the logo depend on the port would mean the same wire behaved differently
 * for reasons invisible on the canvas.
 *
 * The url, clear space and minimum width were resolved onto the row from the
 * library by `withBrandKits`; only the placement and size are the node's own.
 *
 * First one wins. Two brands stamped onto one picture is a mess no arithmetic
 * can arrange, and picking deterministically by row order means the same board
 * produces the same picture twice.
 */
export const brandLogoOf = (
  itemId: string,
  rows: BoardItemRow[],
  wires: { source_item_id: string; target_item_id: string }[]
): BrandLogo | null => {
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const wire of wires) {
    if (wire.target_item_id !== itemId) {
      continue;
    }
    const source = byId.get(wire.source_item_id);
    if (source?.node_type !== "brand") {
      continue;
    }
    const config = asObject(source.config);
    const url = config.logoUrl;
    if (typeof url !== "string" || !url) {
      // A brand with no logo chosen still contributes its words; it simply has
      // nothing to stamp.
      continue;
    }
    return {
      clearSpace: num(config.logoClearSpace, 0),
      minWidth: num(config.logoMinWidth, 0),
      placement: placementOf(config.logoPlacement),
      url,
      widthPercent: num(config.logoWidth, DEFAULT_LOGO_WIDTH),
    };
  }
  return null;
};
