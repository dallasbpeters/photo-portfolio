import type { Point } from "./drawing";

/**
 * A mask painted straight onto an image node.
 *
 * Stored as strokes rather than as a bitmap: strokes are small, they survive
 * the item being resized, and they can be undone one at a time. The bitmap fal
 * needs is made from them at run time — see rasterizeMask.
 *
 * Points are in unit space, 0–1 across the item's box, exactly as a drawing
 * item stores its own. Resizing the node then scales the mask with the picture
 * instead of sliding out of register with it, which is the whole reason a mask
 * painted at one zoom still lines up at another.
 */

export interface MaskStroke {
  points: Point[];
  /** Unit-space too: a fraction of the item's width, so it scales with it. */
  width: number;
}

export interface MaskConfig {
  /**
   * What the painted area means.
   *
   * false — paint what to change, which is fal's own convention and needs no
   * translation. true — paint what to keep, and the bitmap is inverted on the
   * way out. Both are wanted: "replace the sky" and "keep the logo, redo
   * everything else" are equally common and are each awkward to express as the
   * other.
   */
  invert: boolean;
  strokes: MaskStroke[];
}

/** Brush width as a fraction of the node's width, so it scales with the node. */
export const DEFAULT_MASK_WIDTH = 0.08;

export const isMaskConfig = (value: unknown): value is MaskConfig =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as MaskConfig).strokes);

/** The mask on an item, or null when it has none worth sending. */
export const maskOf = (config: unknown): MaskConfig | null => {
  const mask = (config as { mask?: unknown } | null)?.mask;
  if (!isMaskConfig(mask)) {
    return null;
  }
  // An empty mask is not a mask. Sent as one it would mean "change nothing" —
  // or, inverted, "change everything" — and either is a confusing answer to
  // having cleared the paint off a node.
  return mask.strokes.length > 0 ? mask : null;
};

/**
 * The mask as the bitmap an inpainting endpoint expects: white where the model
 * should paint, black where it must not.
 *
 * Drawn at the source image's own pixel size, because fal compares the mask
 * with the image and a mismatch is either rejected or silently stretched. The
 * strokes are in unit space precisely so this can be done at any size.
 *
 * Round caps and joins: a painted mask is a brush, and square ends leave
 * notches at every direction change that show up as hard edges in the result.
 */
export const rasterizeMask = (
  mask: MaskConfig,
  size: { height: number; width: number }
): Promise<Blob> => {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;

  const context = canvas.getContext("2d");
  if (!context) {
    return Promise.reject(new Error("This browser cannot build a mask"));
  }

  // Black ground, white paint — then inverted wholesale if the strokes meant
  // "keep" rather than "change". Inverting the finished bitmap rather than
  // swapping the two colours keeps the anti-aliased stroke edges correct: a
  // half-covered pixel stays half-covered either way round.
  context.fillStyle = "#000000";
  context.fillRect(0, 0, size.width, size.height);

  context.strokeStyle = "#ffffff";
  context.lineCap = "round";
  context.lineJoin = "round";

  for (const stroke of mask.strokes) {
    const [first, ...rest] = stroke.points;
    if (!first) {
      continue;
    }
    context.lineWidth = Math.max(1, stroke.width * size.width);
    context.beginPath();
    context.moveTo(first.x * size.width, first.y * size.height);
    for (const point of rest) {
      context.lineTo(point.x * size.width, point.y * size.height);
    }
    if (rest.length === 0) {
      // A single tap is a dot, and a path of one point strokes nothing. Drawn
      // as a filled circle of the same width so dabbing works like painting.
      context.fillStyle = "#ffffff";
      context.beginPath();
      context.arc(
        first.x * size.width,
        first.y * size.height,
        Math.max(1, (stroke.width * size.width) / 2),
        0,
        Math.PI * 2
      );
      context.fill();
      continue;
    }
    context.stroke();
  }

  if (mask.invert) {
    context.globalCompositeOperation = "difference";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.globalCompositeOperation = "source-over";
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("The mask could not be built"));
    }, "image/png");
  });
};

/**
 * The pixel size of the image being masked.
 *
 * The mask has to match the source image, not the node it is drawn on — the
 * node is whatever size it was dragged to, and a mask at those proportions
 * would be stretched across the picture.
 */
export const naturalSizeOf = (
  url: string
): Promise<{ height: number; width: number }> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () =>
      resolve({ height: image.naturalHeight, width: image.naturalWidth });
    image.onerror = () =>
      reject(new Error("Could not read the image being masked"));
    image.src = url;
  });
