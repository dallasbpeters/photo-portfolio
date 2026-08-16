import type { FalModelInput, RunState } from "../config/nodeTypes.js";

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
  /** Address drawn in the frame's title bar. Display only — never linked. */
  chromeUrl: string | null;
  createdAt: string;
  exif: PhotoExifData | null;
  height: number | null;
  id: string;
  /** True includes this photo in the homepage hero slideshow. */
  isFeatured: boolean;
  /** False keeps it in the admin library but off the public gallery. */
  isPublished: boolean;
  /** Tiny inline preview shown blurred until the full image decodes. */
  lqip: string | null;
  order: number;
  /** The pre-edit image, kept so an edit can be undone. Null on untouched photos. */
  originalUrl: string | null;
  /**
   * Frames this image in a browser window in the lightbox.
   *
   * For full-page screenshots rather than photographs: the frame says what the
   * image is, and lets a tall capture scroll at full width instead of being
   * shrunk until nothing on it is readable.
   */
  showChrome: boolean;
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
  | "frame"
  | "shader"
  | "drawing";

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
  /**
   * Every image this node has ever produced, oldest first.
   *
   * Append-only and capped, so changing a prompt adds to the gallery rather
   * than replacing it. This is what the node's version strip shows, and what a
   * selection indexes into.
   */
  history?: BoardItemVariation[];
  /** False when an icon fell back to a raster because the vectoriser was down. */
  isVector: boolean | null;
  /**
   * What kind of result this is.
   *
   * Not every node makes a picture: the Analyse node reads one and writes
   * words. Absent on results stored before the distinction existed, which are
   * images by definition.
   */
  kind?: "image" | "text";
  ranAt: string;
  /** The words an Analyse node produced. Absent on every image result. */
  text?: string;
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

/**
 * A style already found, kept so it can be used again.
 *
 * Half a dozen references that share a look, the words for what they share, and
 * a name. Deliberately not a board: a board is a place you work, an element is
 * a conclusion you reached there, so it outlives the board that produced it.
 *
 * `description` is the substance rather than a note about it — it travels down
 * the wire into the prompt of whatever the element feeds.
 */
export interface Element {
  /** The key image: what the panel shows, and what a wired element hands over. */
  coverUrl: string | null;
  createdAt: string;
  description: string | null;
  id: string;
  imageUrls: string[];
  name: string;
  updatedAt: string;
}

/**
 * A fal.ai model a Generate node may ask for.
 *
 * The list is data, edited from /admin/models rather than in code, so the
 * picker, the run endpoint and the admin panel all read the same rows.
 */
export interface AiModel {
  createdAt: string;
  enabled: boolean;
  /** The exact fal.ai model id, or a namespaced "lora/..." one. */
  id: string;
  imageParam: "image_url" | "image_urls";
  input: FalModelInput;
  /** Shown on the node — model ids are too long and too alike to read. */
  label: string;
  lora: {
    endpoint: string | null;
    imageEndpoint: string | null;
    /** URL to the safetensors weights, ours or Hugging Face's. */
    path: string | null;
    scale: number | null;
    trigger: string | null;
  } | null;
  sortOrder: number;
  updatedAt: string;
  /** True when the model returns vector art rather than a raster. */
  vector: boolean;
}

/** The LoRA fields of a model, as stored and as sent. */
export interface AiModelLora {
  endpoint: string | null;
  imageEndpoint: string | null;
  /** URL to the safetensors weights, ours or Hugging Face's. */
  path: string | null;
  scale: number | null;
  trigger: string | null;
}

/**
 * The settable fields of a model. `id` is only read on create; `lora` is
 * `null` to clear a LoRA and absent to leave it alone.
 */
export interface AiModelInput {
  enabled?: boolean;
  id?: string;
  imageParam?: "image_url" | "image_urls";
  input?: FalModelInput;
  label?: string;
  lora?: AiModelLora | null;
  sortOrder?: number;
  vector?: boolean;
}
