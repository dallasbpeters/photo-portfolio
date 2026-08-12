import { MASK_KEEP, MASK_OPACITY, MASK_PAINT, type MaskConfig } from "./mask";

/**
 * The painted mask, shown over the picture it belongs to.
 *
 * Drawn in the item's own coordinates rather than in unit space. The strokes
 * are stored as fractions, and a unit viewBox stretched to a non-square item
 * would scale the stroke *width* by the average of the two axes — so the mask
 * on screen would be a different weight from the bitmap actually sent, and the
 * overlay would quietly stop being a preview of the thing it previews.
 *
 * Multiplying out here is the same arithmetic rasterizeMask does, which is the
 * point: what is shown and what is sent come from one formula.
 *
 * Red at low opacity because that is the convention every masking tool uses,
 * and because it must read as an annotation rather than as paint — what is
 * underneath has to stay visible or there is no way to tell whether the mask
 * covers the right thing.
 */

interface MaskOverlayProps {
  /** The item's box, in canvas units. */
  height: number;
  mask: MaskConfig;
  width: number;
}

export function MaskOverlay({ height, mask, width }: MaskOverlayProps) {
  if (mask.strokes.length === 0) {
    return null;
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${width} ${height}`}
    >
      <title>{mask.invert ? "Protected area" : "Area to change"}</title>
      {mask.strokes.map((stroke, index) => {
        const [first, ...rest] = stroke.points;
        if (!first) {
          return null;
        }
        const d = [
          `M ${first.x * width} ${first.y * height}`,
          ...rest.map((point) => `L ${point.x * width} ${point.y * height}`),
        ].join(" ");
        return (
          <path
            d={d}
            fill="none"
            // Position is the identity: two identical strokes are two strokes.
            // biome-ignore lint/suspicious/noArrayIndexKey: a stroke has no identity but its order
            key={index}
            // Inverted means the paint marks what to *keep*, so it is shown in
            // a different colour. Painting "protect this" and seeing the same
            // red that elsewhere means "replace this" is how a mask ends up
            // used backwards without anyone noticing.
            stroke={mask.invert ? MASK_KEEP : MASK_PAINT}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={MASK_OPACITY}
            strokeWidth={Math.max(1, stroke.width * width)}
          />
        );
      })}
    </svg>
  );
}
