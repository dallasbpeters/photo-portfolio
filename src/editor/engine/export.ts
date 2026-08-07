/**
 * Export settings for a graded photo.
 *
 * PNG is deliberately not the default. /api/upload rejects anything over 8MB,
 * and a full-resolution PNG of a modern camera file blows past that — which is
 * what the previous editor did on every save.
 */
export type ExportFormat = 'image/jpeg' | 'image/webp' | 'image/png';

export type ExportSettings = {
  format: ExportFormat;
  /** 0–1. Ignored for PNG. */
  quality: number;
  /** Longest edge in pixels. The image is never upscaled past its original. */
  maxDimension: number;
};

export const EXPORT_FORMATS: { value: ExportFormat; label: string; note: string }[] = [
  { value: 'image/jpeg', label: 'JPEG', note: 'Smallest — best for the portfolio' },
  { value: 'image/webp', label: 'WebP', note: 'Smaller again, slightly less universal' },
  { value: 'image/png', label: 'PNG', note: 'Lossless, very large files' },
];

export const MAX_DIMENSIONS = [1600, 2048, 2560, 3200, 4096];

export const DEFAULT_EXPORT: ExportSettings = {
  format: 'image/jpeg',
  quality: 0.9,
  maxDimension: 2560,
};

/** Upload ceiling in api/upload.ts. Kept here so the UI can warn before sending. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const fileExtension = (format: ExportFormat): string =>
  ({ 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' })[format];

/** Longest-edge fit, never enlarging beyond the source. */
export const fitWithin = (
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } => {
  const longest = Math.max(width, height);
  if (longest <= maxDimension) return { width, height };
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

export const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Encodes the rendered canvas at the requested size and format.
 *
 * The GL canvas is always the image's native resolution — downscaling has to
 * happen here, at encode time, or `maxDimension` would be a label that changes
 * nothing. Uses a 2D canvas so the browser applies its own smoothing rather
 * than a nearest-neighbour GL blit.
 */
export const encodeCanvas = async (
  source: HTMLCanvasElement,
  settings: ExportSettings,
): Promise<Blob | null> => {
  const { width, height } = fitWithin(source.width, source.height, settings.maxDimension);

  if (width === source.width && height === source.height) {
    return new Promise((resolve) => source.toBlob(resolve, settings.format, settings.quality));
  }

  const scaled = document.createElement('canvas');
  scaled.width = width;
  scaled.height = height;

  const ctx = scaled.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // JPEG has no alpha; without a matte, transparent edges encode as black.
  if (settings.format === 'image/jpeg') {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
  }

  ctx.drawImage(source, 0, 0, width, height);
  return new Promise((resolve) => scaled.toBlob(resolve, settings.format, settings.quality));
};
