/**
 * Reads everything useful out of an image file before it is uploaded.
 *
 * All of it happens in the browser: the bytes are already there, and doing it
 * server-side would mean shipping the file twice. Every field is optional — a
 * screenshot with no EXIF, or a decode failure, must never block an upload.
 */

export interface PhotoExif {
  /** f-number, e.g. 1.8. */
  aperture?: number;
  /** Seconds, e.g. 0.004 for 1/250. */
  exposureTime?: number;
  /** Millimetres. */
  focalLength?: number;
  iso?: number;
  lens?: string;
  make?: string;
  model?: string;
  takenAt?: string;
}

export interface PhotoMetadata {
  exif?: PhotoExif;
  height?: number;
  /** Data URI of a tiny blurred preview. */
  lqip?: string;
  width?: number;
}

/** Longest edge of the placeholder. Small enough to inline, big enough to read as the image. */
const LQIP_SIZE = 24;

const round = (value: unknown, places = 2): number | undefined => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return;
  }
  const factor = 10 ** places;
  return Math.round(n * factor) / factor;
};

const text = (value: unknown): string | undefined => {
  const s = typeof value === "string" ? value.trim() : "";
  return s === "" ? undefined : s.slice(0, 120);
};

/** Formats a shutter speed the way a camera displays it. */
export const formatShutter = (
  seconds: number | undefined
): string | undefined => {
  if (!(seconds && Number.isFinite(seconds))) {
    return;
  }
  if (seconds >= 1) {
    return `${round(seconds, 1)}s`;
  }
  return `1/${Math.round(1 / seconds)}`;
};

export const formatExif = (exif: PhotoExif | null | undefined): string[] => {
  if (!exif) {
    return [];
  }
  const parts: string[] = [];

  const body = [exif.make, exif.model].filter(Boolean).join(" ");
  if (body) {
    parts.push(body);
  }
  if (exif.lens) {
    parts.push(exif.lens);
  }
  if (exif.focalLength) {
    parts.push(`${Math.round(exif.focalLength)}mm`);
  }
  if (exif.aperture) {
    parts.push(`f/${exif.aperture}`);
  }

  const shutter = formatShutter(exif.exposureTime);
  if (shutter) {
    parts.push(shutter);
  }
  if (exif.iso) {
    parts.push(`ISO ${exif.iso}`);
  }

  return parts;
};

/** Intrinsic pixel size, used to reserve layout space before the image loads. */
const readDimensions = async (
  file: File
): Promise<{ width: number; height: number } | null> => {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { height: bitmap.height, width: bitmap.width };
    // Bitmaps hold decoded pixels; release rather than waiting for GC.
    bitmap.close();
    return size;
  } catch {
    return null;
  }
};

/** Downscales to a handful of pixels and encodes as a data URI. */
const buildLqip = async (file: File): Promise<string | undefined> => {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = LQIP_SIZE / Math.max(bitmap.width, bitmap.height);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    // WebP where available; browsers that decline fall back to JPEG.
    const uri = canvas.toDataURL("image/webp", 0.6);
    const usable = uri.startsWith("data:image/webp")
      ? uri
      : canvas.toDataURL("image/jpeg", 0.5);
    // A placeholder large enough to bloat the photo list defeats the purpose.
    return usable.length > 4000 ? undefined : usable;
  } catch {}
};

const readExif = async (file: File): Promise<PhotoExif | undefined> => {
  try {
    // Loaded on demand so the parser never reaches a gallery visitor.
    const exifr = (await import("exifr")).default;
    const raw = (await exifr.parse(file, {
      pick: [
        "Make",
        "Model",
        "LensModel",
        "FocalLength",
        "FNumber",
        "ExposureTime",
        "ISO",
        "ISOSpeedRatings",
        "DateTimeOriginal",
      ],
    })) as Record<string, unknown> | undefined;

    if (!raw) {
      return;
    }

    const takenAtRaw = raw.DateTimeOriginal;
    const takenAt =
      takenAtRaw instanceof Date && !Number.isNaN(takenAtRaw.getTime())
        ? takenAtRaw.toISOString()
        : undefined;

    const exif: PhotoExif = {
      aperture: round(raw.FNumber, 1),
      exposureTime: round(raw.ExposureTime, 6),
      focalLength: round(raw.FocalLength, 1),
      iso: round(raw.ISO ?? raw.ISOSpeedRatings, 0),
      lens: text(raw.LensModel),
      make: text(raw.Make),
      model: text(raw.Model),
      takenAt,
    };

    // Drop the object entirely when the file carried nothing useful.
    return Object.values(exif).some((v) => v !== undefined) ? exif : undefined;
  } catch {}
};

/**
 * Everything at once. Runs the three readers in parallel and tolerates any of
 * them failing — metadata is a bonus, never a precondition for uploading.
 */
export const extractPhotoMetadata = async (
  file: File
): Promise<PhotoMetadata> => {
  const [dimensions, lqip, exif] = await Promise.all([
    readDimensions(file),
    buildLqip(file),
    readExif(file),
  ]);

  return {
    exif,
    height: dimensions?.height,
    lqip,
    width: dimensions?.width,
  };
};
