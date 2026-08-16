/**
 * Export settings for a graded photo.
 *
 * PNG is deliberately not the default. /api/upload rejects anything over 8MB,
 * and a full-resolution PNG of a modern camera file blows past that — which is
 * what the previous editor did on every save.
 */
export type ExportFormat = "image/jpeg" | "image/webp" | "image/png";

export interface ExportSettings {
  format: ExportFormat;
  /** Longest edge in pixels. The image is never upscaled past its original. */
  maxDimension: number;
  /** 0–1. Ignored for PNG. */
  quality: number;
}

export const EXPORT_FORMATS: {
  value: ExportFormat;
  label: string;
  note: string;
}[] = [
  {
    label: "JPEG",
    note: "Smallest — best for the portfolio",
    value: "image/jpeg",
  },
  {
    label: "WebP",
    note: "Smaller again, slightly less universal",
    value: "image/webp",
  },
  { label: "PNG", note: "Lossless, very large files", value: "image/png" },
];

export const MAX_DIMENSIONS = [1600, 2048, 2560, 3200, 4096];

export const DEFAULT_EXPORT: ExportSettings = {
  format: "image/jpeg",
  maxDimension: 2560,
  quality: 0.9,
};

/** Upload ceiling in api/upload.ts. Kept here so the UI can warn before sending. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const fileExtension = (format: ExportFormat): string =>
  ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" })[format];

/** Longest-edge fit, never enlarging beyond the source. */
export const fitWithin = (
  width: number,
  height: number,
  maxDimension: number
): { width: number; height: number } => {
  const longest = Math.max(width, height);
  if (longest <= maxDimension) {
    return { height, width };
  }
  const scale = maxDimension / longest;
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  };
};

export const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** A crop rectangle, normalized 0–1 within the rotated image. */
export interface CropRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

/** A geometric edit applied to the image before encoding. */
export interface CanvasTransform {
  /** A crop within the rotated image, or null for no crop. */
  crop: CropRect | null;
  /** Clockwise degrees. */
  rotation: number;
}

export const NO_TRANSFORM: CanvasTransform = { crop: null, rotation: 0 };

/** Whether the transform changes the pixels at all. */
export const isNeutralTransform = (transform: CanvasTransform): boolean =>
  transform.crop === null && transform.rotation % 360 === 0;

/**
 * The bounding box a rotation produces. 90° swaps width and height; any other
 * angle grows the box to the rotated diagonal.
 */
export const rotatedSize = (
  width: number,
  height: number,
  degrees: number
): { height: number; width: number } => {
  const angle = ((degrees % 360) + 360) % 360;
  const rad = (angle * Math.PI) / 180;
  return {
    height: Math.round(
      Math.abs(width * Math.sin(rad)) + Math.abs(height * Math.cos(rad))
    ),
    width: Math.round(
      Math.abs(width * Math.cos(rad)) + Math.abs(height * Math.sin(rad))
    ),
  };
};

/**
 * Rotates the source and applies a crop, returning a fresh canvas.
 *
 * Rotation can be any angle, so the canvas grows to hold the rotated image
 * (its diagonal). The crop, if any, is taken from the rotated result and is
 * normalised 0–1 so it is meaningful whatever the image's orientation.
 */
export const applyTransform = (
  source: HTMLCanvasElement,
  transform: CanvasTransform
): HTMLCanvasElement => {
  // These two were transposed — `height` was being read into `rotatedWidth` and
  // `width` into `rotatedHeight`. The preview path below (`drawFitted`) and the
  // editor shell both destructure this correctly, so the crop looked right on
  // screen and came out wrong in the file: the export canvas was allocated with
  // the axes swapped, the source was drawn into it off-centre, and the crop
  // rectangle's x/y were then scaled against the opposite dimension.
  const { height: rotatedHeight, width: rotatedWidth } = rotatedSize(
    source.width,
    source.height,
    transform.rotation
  );

  const angle = ((transform.rotation % 360) + 360) % 360;
  const rad = (angle * Math.PI) / 180;

  const rotated = document.createElement("canvas");
  rotated.width = rotatedWidth;
  rotated.height = rotatedHeight;
  const ctx = rotated.getContext("2d");
  if (ctx) {
    ctx.translate(rotatedWidth / 2, rotatedHeight / 2);
    ctx.rotate(rad);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);
  }

  if (!transform.crop) {
    return rotated;
  }
  const { height, width, x, y } = transform.crop;
  const cw = Math.max(1, Math.round(rotatedWidth * width));
  const ch = Math.max(1, Math.round(rotatedHeight * height));
  const cx = Math.round(rotatedWidth * x);
  const cy = Math.round(rotatedHeight * y);

  const cropped = document.createElement("canvas");
  cropped.width = cw;
  cropped.height = ch;
  const cropCtx = cropped.getContext("2d");
  if (cropCtx) {
    cropCtx.drawImage(rotated, cx, cy, cw, ch, 0, 0, cw, ch);
  }
  return cropped;
};

/** The on-screen area the rendered image occupies, in destination pixels. */
export interface RenderedRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

/**
 * Draws the rotated and cropped image into a context of a fixed display size,
 * fitting it like `object-contain` (centred, never distorted).
 *
 * This is the cheap preview path for the crop tool: it scales the full-size GL
 * canvas down to a display canvas, then applies the rotation and crop in the
 * same transform, so a drag updates in real time without touching the GL
 * pipeline. The returned rect lets an overlay align its crop box with the
 * drawn pixels (there is padding when the rotated box does not fill the area).
 */
export const renderTransform = (
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  transform: CanvasTransform,
  targetWidth: number,
  targetHeight: number
): RenderedRect => {
  const angle = ((transform.rotation % 360) + 360) % 360;
  const rad = (angle * Math.PI) / 180;
  const { height: rotHeight, width: rotWidth } = rotatedSize(
    source.width,
    source.height,
    angle
  );

  const scale = Math.min(targetWidth / rotWidth, targetHeight / rotHeight);
  const dW = rotWidth * scale;
  const dH = rotHeight * scale;
  const ox = (targetWidth - dW) / 2;
  const oy = (targetHeight - dH) / 2;

  ctx.save();
  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.translate(ox + dW / 2, oy + dH / 2);
  ctx.rotate(rad);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    source,
    (-source.width / 2) * scale,
    (-source.height / 2) * scale,
    source.width * scale,
    source.height * scale
  );
  ctx.restore();

  if (!transform.crop) {
    return { height: dH, width: dW, x: ox, y: oy };
  }

  // Draw the dimming around the crop, then the untouched crop itself.
  const { height, width, x, y } = transform.crop;
  const cx = ox + dW * x;
  const cy = oy + dH * y;
  const cw = dW * width;
  const ch = dH * height;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(ox + dW, oy);
  ctx.lineTo(ox + dW, oy + dH);
  ctx.lineTo(ox, oy + dH);
  ctx.closePath();
  ctx.moveTo(cx + cw, cy);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx, cy + ch);
  ctx.lineTo(cx + cw, cy + ch);
  ctx.closePath();
  ctx.fill("evenodd");
  ctx.restore();

  return { height: dH, width: dW, x: ox, y: oy };
};

/**
 * Encodes the rendered canvas at the requested size and format.
 *
 * The GL canvas is always the image's native resolution — downscaling has to
 * happen here, at encode time, or `maxDimension` would be a label that changes
 * nothing. Uses a 2D canvas so the browser applies its own smoothing rather
 * than a nearest-neighbour GL blit.
 */
export const encodeCanvas = (
  source: HTMLCanvasElement,
  settings: ExportSettings,
  transform: CanvasTransform = NO_TRANSFORM
): Promise<Blob | null> => {
  const final =
    transform.crop || transform.rotation
      ? applyTransform(source, transform)
      : source;

  const { width, height } = fitWithin(
    final.width,
    final.height,
    settings.maxDimension
  );

  if (width === final.width && height === final.height) {
    return new Promise((resolve) =>
      final.toBlob(resolve, settings.format, settings.quality)
    );
  }

  const scaled = document.createElement("canvas");
  scaled.width = width;
  scaled.height = height;

  const ctx = scaled.getContext("2d");
  if (!ctx) {
    return Promise.resolve(null);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // JPEG has no alpha; without a matte, transparent edges encode as black.
  if (settings.format === "image/jpeg") {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
  }

  ctx.drawImage(final, 0, 0, width, height);
  return new Promise((resolve) =>
    scaled.toBlob(resolve, settings.format, settings.quality)
  );
};
