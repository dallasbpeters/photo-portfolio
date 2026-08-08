export interface Category {
  id: string;
  slug: string;
  label: string;
  sortOrder: number;
  photoCount: number;
  createdAt: string;
}

export interface PhotoExifData {
  make?: string;
  model?: string;
  lens?: string;
  focalLength?: number;
  aperture?: number;
  exposureTime?: number;
  iso?: number;
  takenAt?: string;
}

export interface Photo {
  id: string;
  url: string;
  title: string;
  categoryId: string;
  /** URL-safe key; matches `Category.slug` */
  category: string;
  categoryLabel: string;
  order: number;
  createdAt: string;
  /** Falls back to the title server-side, so this is never empty. */
  alt: string;
  /** Intrinsic size, used to reserve layout space before the image loads. */
  width: number | null;
  height: number | null;
  /** Tiny inline preview shown blurred until the full image decodes. */
  lqip: string | null;
  exif: PhotoExifData | null;
}

export type ViewMode = 'all' | string;

export type DailyChallengeInfo = {
  challengeDate: string;
  imageUrl: string;
  imageThumbUrl: string | null;
  photographerName: string | null;
  photographerUsername: string | null;
  unsplashPhotoId: string | null;
  unsplashHtmlLink: string | null;
  altText: string | null;
};

export type DailyChallengeJournal = {
  body: string;
  updatedAt: string;
};

export type DailyChallengeResponse = {
  challenge: DailyChallengeInfo;
  journal: DailyChallengeJournal | null;
};

export type DailyChallengeHistoryEntry = {
  challenge: DailyChallengeInfo;
  journal: DailyChallengeJournal | null;
};
