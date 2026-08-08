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
