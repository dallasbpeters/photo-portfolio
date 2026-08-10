import type { RunState } from "../config/nodeTypes.js";

export type { RunState } from "../config/nodeTypes.js";

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
  /** False keeps it in the admin library but off the public gallery. */
  isPublished: boolean;
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

export type BoardItemKind =
  | "photo"
  | "reference"
  | "note"
  | "text"
  | "op"
  | "frame";

/** One image a run produced. A batch produces several. */
export interface BoardItemVariation {
  description: string | null;
  height: number | null;
  /** False when an icon fell back to a raster because the vectoriser was down. */
  isVector: boolean | null;
  url: string;
  width: number | null;
}

/** What a node's last run produced, stored with the item that produced it. */
export interface BoardItemResult {
  /** Alt text, when the model described what it made. */
  description: string | null;
  /**
   * Hash of the inputs that produced this.
   *
   * A board run compares it against the node's current inputs and skips the
   * node when they match — the mechanism that keeps a re-run from spending
   * money to arrive at the same image.
   */
  fingerprint: string;
  height: number | null;
  /** False when an icon fell back to a raster because the vectoriser was down. */
  isVector: boolean | null;
  kind: "image";
  ranAt: string;
  /** Already on our own blob host, never the generator's expiring link. */
  url: string;
  /**
   * Every image this node produced, in the order they were run.
   *
   * A batch fills several; an ordinary run fills one. `url` above mirrors the
   * first, because that is the single value the graph passes downstream — a
   * wire carries one image, so a batch's later variations are for looking at
   * rather than for feeding onward.
   */
  variations: BoardItemVariation[];
  width: number | null;
}

/**
 * One thing pinned to a board.
 *
 * Geometry is in canvas units against the fixed logical canvas, never pixels —
 * see CANVAS_WIDTH. `id` is null for an item added on the canvas but not yet
 * saved, which is how the server tells an insert from an update.
 */
export interface BoardItem {
  body: string | null;
  /**
   * An operation node's own settings — its typed prompt, its style.
   *
   * Null for every other kind. The shape belongs to the node type, which is
   * defined in config/nodeTypes.ts.
   */
  config: Record<string, unknown> | null;
  /** Required wherever an Unsplash reference is displayed. */
  creditName: string | null;
  creditUrl: string | null;
  /** Text size in canvas units; null uses the default for the kind. */
  fontSize: number | null;
  height: number;
  /**
   * Generated on the client the moment an item is placed.
   *
   * The client owning identity is what lets a save be fire-and-forget: there is
   * no server-assigned id to adopt afterwards, so a response landing mid-edit
   * cannot overwrite what has just been typed.
   */
  id: string;
  imageUrl: string | null;
  kind: BoardItemKind;
  /** Which operation an `op` item performs; null for every other kind. */
  nodeType: string | null;

  photoId: string | null;
  /**
   * The last successful run's output.
   *
   * Written only by the run endpoint, never by the board save — a debounced
   * save already in flight when a two-minute generation lands would otherwise
   * write back the pre-run copy and erase it.
   */
  result: BoardItemResult | null;
  /** Why the last run failed, in terms the owner can act on. */
  runError: string | null;
  runState: RunState | null;
  thumbUrl: string | null;
  width: number;
  x: number;
  y: number;
  z: number;
}

/**
 * A directed connection between two items on a board.
 *
 * Like an item, its id is generated on the client the moment it is drawn, for
 * the same reason: the save can then be fire-and-forget.
 */
export interface BoardWire {
  id: string;
  sourceItemId: string;
  sourcePort: string;
  targetItemId: string;
  targetPort: string;
}

/**
 * Somewhere a board's references were pulled from.
 *
 * Kept so an attached Pinterest board can be reopened and pulled from again a
 * week later, rather than the address vanishing when the panel closes.
 */
export interface BoardSource {
  id: string;
  provider: string;
  title: string | null;
  url: string;
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
  /** Admin detail responses only — never sent to a published board's reader. */
  sources?: BoardSource[];
  title: string;
  updatedAt: string;
  /** On detail responses only; empty for a board with no graph. */
  wires?: BoardWire[];
}
