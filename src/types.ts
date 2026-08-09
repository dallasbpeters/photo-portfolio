export interface Category {
  createdAt: string;
  id: string;
  label: string;
  photoCount: number;
  slug: string;
  sortOrder: number;
}

export interface PhotoExifData {
  aperture?: number;
  exposureTime?: number;
  focalLength?: number;
  iso?: number;
  lens?: string;
  make?: string;
  model?: string;
  takenAt?: string;
}

export interface Photo {
  /** Falls back to the title server-side, so this is never empty. */
  alt: string;
  /** URL-safe key; matches `Category.slug` */
  category: string;
  categoryId: string;
  categoryLabel: string;
  createdAt: string;
  exif: PhotoExifData | null;
  height: number | null;
  id: string;
  /** Tiny inline preview shown blurred until the full image decodes. */
  lqip: string | null;
  order: number;
  title: string;
  url: string;
  /** Intrinsic size, used to reserve layout space before the image loads. */
  width: number | null;
}

export type ViewMode = "all" | string;

export interface DailyChallengeInfo {
  altText: string | null;
  challengeDate: string;
  imageThumbUrl: string | null;
  imageUrl: string;
  photographerName: string | null;
  photographerUsername: string | null;
  unsplashHtmlLink: string | null;
  unsplashPhotoId: string | null;
}

export interface DailyChallengeJournal {
  body: string;
  updatedAt: string;
}

export interface DailyChallengeResponse {
  challenge: DailyChallengeInfo;
  journal: DailyChallengeJournal | null;
}

export interface DailyChallengeHistoryEntry {
  challenge: DailyChallengeInfo;
  journal: DailyChallengeJournal | null;
}

export type BoardItemKind = "photo" | "reference" | "note" | "text";

/**
 * One thing pinned to a board.
 *
 * Geometry is in canvas units against the fixed logical canvas, never pixels —
 * see CANVAS_WIDTH. `id` is null for an item added on the canvas but not yet
 * saved, which is how the server tells an insert from an update.
 */
export interface BoardItem {
  body: string | null;
  /** Required wherever an Unsplash reference is displayed. */
  creditName: string | null;
  creditUrl: string | null;
  height: number;
  id: string | null;
  imageUrl: string | null;
  kind: BoardItemKind;
  /**
   * Client-only identity for an item that has not been saved yet.
   *
   * Every edit produces a new item object, so React keys cannot be derived from
   * object identity — doing that remounts the field on each keystroke and drops
   * focus after one character. The server never sees this; it decides insert
   * versus update from `id`.
   */
  localKey?: string;
  photoId: string | null;
  thumbUrl: string | null;
  width: number;
  x: number;
  y: number;
  z: number;
}

export interface Board {
  coverUrl: string | null;
  createdAt: string;
  id: string;
  isPublic: boolean;
  /** On list responses only. */
  itemCount?: number;
  /** On detail responses only. */
  items?: BoardItem[];
  slug: string | null;
  title: string;
  updatedAt: string;
}
