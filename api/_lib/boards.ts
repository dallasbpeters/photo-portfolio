/**
 * Shared shapes and validation for moodboards.
 *
 * Item geometry arrives from a canvas the user drags directly, so every number
 * is clamped rather than trusted: a NaN reaching the database would render an
 * item at an unreachable position with no way to select it and drag it back.
 */

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  MIN_ITEM_SIZE,
} from "../../config/canvas.js";
import {
  isNodeTypeId,
  isRunState,
  nodeTypeFor,
  type RunState,
} from "../../config/nodeTypes.js";

export type BoardItemKind =
  | "photo"
  | "reference"
  | "note"
  | "text"
  | "op"
  | "frame";

export interface BoardRow {
  cover_url: string | null;
  created_at: string | Date;
  id: string;
  is_public: boolean;
  item_count?: number | string;
  slug: string | null;
  title: string;
  updated_at: string | Date;
}

export interface BoardItemRow {
  body: string | null;
  config?: unknown;
  created_at: string | Date;
  credit_name: string | null;
  credit_url: string | null;
  font_size?: number | string | null;
  height: number | string;
  id: string;
  image_url: string | null;
  kind: BoardItemKind;
  node_type?: string | null;
  photo_id: string | null;
  /** Joined from photos so the canvas can render without a second request. */
  photo_url?: string | null;
  result?: unknown;
  run_error?: string | null;
  run_state?: string | null;
  thumb_url: string | null;
  width: number | string;
  x: number | string;
  y: number | string;
  z_index: number | string;
}

export interface BoardSourceRow {
  id: string;
  provider: string;
  title: string | null;
  url: string;
}

export interface BoardSourceDto {
  id: string;
  provider: string;
  title: string | null;
  url: string;
}

export interface BoardWireRow {
  id: string;
  source_item_id: string;
  source_port: string;
  target_item_id: string;
  target_port: string;
}

export interface BoardWireDto {
  id: string;
  sourceItemId: string;
  sourcePort: string;
  targetItemId: string;
  targetPort: string;
}

export interface BoardItemDto {
  body: string | null;
  /** An operation node's settings; null for every other kind. */
  config: Record<string, unknown> | null;
  creditName: string | null;
  creditUrl: string | null;
  /** Null means "use the default for this kind". */
  fontSize: number | null;
  height: number;
  id: string;
  imageUrl: string | null;
  kind: BoardItemKind;
  nodeType: string | null;
  photoId: string | null;
  result: Record<string, unknown> | null;
  runError: string | null;
  runState: RunState | null;
  thumbUrl: string | null;
  width: number;
  x: number;
  y: number;
  z: number;
}

export interface BoardDto {
  coverUrl: string | null;
  createdAt: string;
  id: string;
  isPublic: boolean;
  /** Present on list responses only. */
  itemCount?: number;
  items?: BoardItemDto[];
  slug: string | null;
  sources?: BoardSourceDto[];
  title: string;
  updatedAt: string;
  wires?: BoardWireDto[];
}

const toIso = (value: string | Date): string => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? new Date(0).toISOString()
    : d.toISOString();
};

/** Coerces anything to a finite number, falling back rather than yielding NaN. */
const num = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** Postgres hands JSONB back parsed; anything else is not a settings object. */
const jsonObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * How a stored run state reads back.
 *
 * `running` is deliberately normalised to `idle`. Orchestration happens in the
 * browser, so a run cannot outlive the tab that started it — a row still
 * marked running when a board is opened is stale by definition, and leaving it
 * would strand the node in a state it can never be run out of.
 */
const readRunState = (value: unknown): RunState | null => {
  if (!isRunState(value)) {
    return null;
  }
  return value === "running" ? "idle" : value;
};

export interface ItemDtoOptions {
  /**
   * Anonymous readers of a published board.
   *
   * run_error can carry raw text from fal.ai or Magnific, and a published board
   * should not relay a third party's error strings to the public. The prompt in
   * `config` stays visible: that is the content, and withholding it would leave
   * a board of labelled boxes.
   */
  isPublicReader?: boolean;
}

export const rowToItemDto = (
  row: BoardItemRow,
  options: ItemDtoOptions = {}
): BoardItemDto => ({
  body: row.body,
  config: jsonObject(row.config),
  creditName: row.credit_name,
  creditUrl: row.credit_url,
  fontSize:
    row.font_size === null || row.font_size === undefined
      ? null
      : num(row.font_size, 0) || null,
  height: num(row.height, 240),
  id: row.id,
  // A photo item resolves its URL through the join, so moving or re-uploading
  // the photograph keeps the board correct instead of pinning a stale copy.
  imageUrl: row.kind === "photo" ? (row.photo_url ?? null) : row.image_url,
  kind: row.kind,
  nodeType: row.node_type ?? null,
  photoId: row.photo_id,
  result: jsonObject(row.result),
  runError: options.isPublicReader ? null : (row.run_error ?? null),
  runState: readRunState(row.run_state),
  thumbUrl: row.thumb_url,
  width: num(row.width, 320),
  x: num(row.x, 0),
  y: num(row.y, 0),
  z: num(row.z_index, 0),
});

export const rowToSourceDto = (row: BoardSourceRow): BoardSourceDto => ({
  id: row.id,
  provider: row.provider,
  title: row.title,
  url: row.url,
});

export const rowToWireDto = (row: BoardWireRow): BoardWireDto => ({
  id: row.id,
  sourceItemId: row.source_item_id,
  sourcePort: row.source_port,
  targetItemId: row.target_item_id,
  targetPort: row.target_port,
});

export const rowToBoardDto = (
  row: BoardRow,
  items?: BoardItemRow[],
  wires?: BoardWireRow[],
  options: ItemDtoOptions = {},
  sources?: BoardSourceRow[]
): BoardDto => ({
  coverUrl: row.cover_url,
  createdAt: toIso(row.created_at),
  id: row.id,
  isPublic: row.is_public,
  ...(row.item_count === undefined
    ? {}
    : { itemCount: num(row.item_count, 0) }),
  ...(items === undefined
    ? {}
    : { items: items.map((item) => rowToItemDto(item, options)) }),
  slug: row.slug,
  title: row.title,
  updatedAt: toIso(row.updated_at),
  ...(wires === undefined ? {} : { wires: wires.map(rowToWireDto) }),
  // Admin only: where a board's references came from is planning material, not
  // something a published board owes a visitor.
  ...(sources === undefined || options.isPublicReader
    ? {}
    : { sources: sources.map(rowToSourceDto) }),
});

export const isBoardItemKind = (value: unknown): value is BoardItemKind =>
  value === "photo" ||
  value === "reference" ||
  value === "note" ||
  value === "text" ||
  value === "op" ||
  value === "frame";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One item as accepted from the client, already validated and clamped. */
export interface IncomingItem {
  body: string | null;
  config: Record<string, unknown> | null;
  creditName: string | null;
  creditUrl: string | null;
  fontSize: number | null;
  height: number;
  id: string;
  imageUrl: string | null;
  kind: BoardItemKind;
  nodeType: string | null;
  photoId: string | null;
  thumbUrl: string | null;
  width: number;
  x: number;
  y: number;
  z: number;
}

export interface IncomingSource {
  id: string;
  provider: string;
  title: string | null;
  url: string;
}

export interface IncomingWire {
  id: string;
  sourceItemId: string;
  sourcePort: string;
  targetItemId: string;
  targetPort: string;
}

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

/**
 * A node's settings, filtered to what its type actually declares.
 *
 * Unknown keys are dropped rather than stored: `config` reaches a third-party
 * generator, and a payload that can smuggle arbitrary fields into it is a
 * payload that can change what we ask the model for. Text is capped at the
 * length the corresponding endpoint already enforces, and a select falls back
 * to its default rather than failing — the same allowlist-then-fall-back
 * treatment api/ai/icon.ts gives an unknown style.
 */
const parseNodeConfig = (
  nodeType: string,
  raw: unknown
): Record<string, unknown> | null => {
  const type = nodeTypeFor(nodeType);
  if (!type) {
    return null;
  }
  const source = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;

  const config: Record<string, unknown> = {};
  for (const setting of type.settings) {
    const value = source[setting.key];
    if (setting.kind === "text") {
      // Not `text()`: a prompt may legitimately be cleared back to empty, and
      // treating that as absent would silently keep the previous one.
      if (typeof value === "string") {
        config[setting.key] = value.slice(0, setting.maxLength);
      }
      continue;
    }
    if (setting.kind === "number") {
      // Clamped rather than rejected, like every other number the canvas sends.
      // This one bounds *spending* — it is how many paid generations a single
      // run will make — so an absurd value must not survive the trip.
      const n = Number(value);
      config[setting.key] = Number.isFinite(n)
        ? clamp(Math.trunc(n), setting.min, setting.max)
        : setting.default;
      continue;
    }
    config[setting.key] =
      typeof value === "string" && setting.options.includes(value)
        ? value
        : setting.default;
  }
  return config;
};

/**
 * Validates one wire from the client.
 *
 * Shape only — that both ends exist, that the ports are real and that the graph
 * stays acyclic is checked in config/graph.ts, which needs the whole item and
 * wire set to answer.
 */
/** One attached source from the client. Only known providers are stored. */
export const parseIncomingSource = (raw: unknown): IncomingSource | null => {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && UUID_RE.test(o.id) ? o.id : null;
  const url = text(o.url, 2000);
  // An allowlist, like every other value that names an external system.
  const provider = o.provider === "pinterest" ? o.provider : null;
  if (!(id && url && provider)) {
    return null;
  }
  return { id, provider, title: text(o.title, 200), url };
};

export const parseIncomingWire = (raw: unknown): IncomingWire | null => {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const o = raw as Record<string, unknown>;

  const id = typeof o.id === "string" && UUID_RE.test(o.id) ? o.id : null;
  const sourceItemId =
    typeof o.sourceItemId === "string" && UUID_RE.test(o.sourceItemId)
      ? o.sourceItemId
      : null;
  const targetItemId =
    typeof o.targetItemId === "string" && UUID_RE.test(o.targetItemId)
      ? o.targetItemId
      : null;
  const sourcePort = text(o.sourcePort, 60);
  const targetPort = text(o.targetPort, 60);

  if (!(id && sourceItemId && targetItemId && sourcePort && targetPort)) {
    return null;
  }
  return { id, sourceItemId, sourcePort, targetItemId, targetPort };
};

/**
 * Mirrors the CHECK constraint: each kind carries its content in a different
 * column, and an item missing it is refused by the caller with the rest of the
 * save intact rather than aborting the whole transaction.
 */
const hasRequiredContent = (
  kind: BoardItemKind,
  content: {
    body: string | null;
    imageUrl: string | null;
    nodeType: string | null;
    photoId: string | null;
  }
): boolean => {
  switch (kind) {
    case "photo":
      return Boolean(content.photoId);
    case "reference":
      return Boolean(content.imageUrl);
    // A note, a plain text item and a frame all carry their content in `body`,
    // which may legitimately be empty — a frame is usually drawn before it is
    // named. Mirrors board_items_shape.
    case "note":
    case "text":
    case "frame":
      return content.body !== null;
    case "op":
      return Boolean(content.nodeType);
    default:
      return true;
  }
};

/**
 * Validates one item from the client.
 *
 * Returns null for anything malformed rather than throwing: a single bad item
 * in a bulk save should be dropped, not cost the user every other edit they
 * made in the same session.
 */
export const parseIncomingItem = (raw: unknown): IncomingItem | null => {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  if (!isBoardItemKind(o.kind)) {
    return null;
  }

  // The client generates ids, so an item arrives already identified. Anything
  // that is not a uuid is refused rather than coerced.
  const id = typeof o.id === "string" && UUID_RE.test(o.id) ? o.id : null;
  if (!id) {
    return null;
  }

  const photoId = typeof o.photoId === "string" ? o.photoId : null;
  const imageUrl = text(o.imageUrl, 2000);
  // Notes and text keep an empty body. One is placed before it is written in,
  // and dropping it as malformed made a freshly placed note vanish on the next
  // save. Only a non-string is missing.
  const body = typeof o.body === "string" ? o.body.slice(0, 2000) : null;

  // An operation node is identified by what it does. Validated against the
  // registry rather than a database enum, so an unknown type is refused here
  // instead of reaching a dispatch that has no branch for it.
  const nodeType = isNodeTypeId(o.nodeType) ? o.nodeType : null;

  if (!hasRequiredContent(o.kind, { body, imageUrl, nodeType, photoId })) {
    return null;
  }

  const width = clamp(num(o.width, 320), MIN_ITEM_SIZE, CANVAS_WIDTH);
  const height = clamp(num(o.height, 240), MIN_ITEM_SIZE, CANVAS_HEIGHT);

  // Clamped rather than trusted: the size is dragged from a control, and a NaN
  // or an absurd value would render text that cannot be read or selected.
  const fontSize =
    o.fontSize === null || o.fontSize === undefined
      ? null
      : clamp(num(o.fontSize, MIN_FONT_SIZE), MIN_FONT_SIZE, MAX_FONT_SIZE);

  return {
    body,
    config: nodeType ? parseNodeConfig(nodeType, o.config) : null,
    creditName: text(o.creditName, 200),
    creditUrl: text(o.creditUrl, 2000),
    fontSize,
    height,
    id,
    imageUrl,
    kind: o.kind,
    nodeType,
    // `result`, `runState` and `runError` are deliberately absent. They arrive
    // in the payload — the canvas holds a copy for display — and are never
    // written from here. The board save replaces the whole arrangement on a
    // debounce, so a save in flight when a generation lands would otherwise
    // write back the pre-run copy and destroy a result that cost money.
    photoId,
    thumbUrl: text(o.thumbUrl, 2000),
    width,
    // Keeping the top-left inside the canvas is enough: an item may hang off
    // the right edge, but it can always be grabbed and pulled back.
    x: clamp(num(o.x, 0), 0, CANVAS_WIDTH),
    y: clamp(num(o.y, 0), 0, CANVAS_HEIGHT),
    z: Math.trunc(clamp(num(o.z, 0), -9999, 9999)),
  };
};
