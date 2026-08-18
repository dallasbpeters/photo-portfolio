import { isRunState, type RunState } from "../../config/nodeTypes.js";
import { normalizeTextStyle } from "../../config/textStyle.js";
import type {
  BoardDto,
  BoardItemDto,
  BoardItemRow,
  BoardRecipeUseDto,
  BoardRow,
  BoardSourceDto,
  BoardSourceRow,
  BoardWireDto,
  BoardWireRow,
} from "./boards.js";
import { num } from "./values.js";

/**
 * A stored row, as the client is allowed to see it.
 *
 * Split from the validator it used to share a file with, because they answer
 * opposite questions — this one decides what leaves, that one decides what may
 * come in — and only this one has to reason about who is asking. The
 * `isPublicReader` branches below are access control, not presentation: a field
 * hidden in the browser is still in the network response, so it is dropped
 * here or not at all.
 */

export const toIso = (value: string | Date): string => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? new Date(0).toISOString()
    : d.toISOString();
};

/** Postgres hands JSONB back parsed; anything else is not a settings object. */
export const jsonObject = (value: unknown): Record<string, unknown> | null =>
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
export const readRunState = (value: unknown): RunState | null => {
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
  // An operation node's settings are its prompt and its model — the working
  // notes behind a picture rather than the picture. A published board shows
  // what was made, not how, so they do not travel to an anonymous reader.
  // A shader's settings are the artwork itself and must stay.
  config:
    options.isPublicReader && row.kind === "op" ? null : jsonObject(row.config),
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
  recipeUseId: row.recipe_use_id ?? null,
  result: jsonObject(row.result),
  runError: options.isPublicReader ? null : (row.run_error ?? null),
  runState: readRunState(row.run_state),
  // Filtered on the way out as well as on the way in: a row written by an
  // older build, or by hand, must not be able to name a font that is not one
  // of ours or a line-height that collapses the board.
  textStyle: normalizeTextStyle(row.text_style),
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
  sources?: BoardSourceRow[],
  recipeUses?: BoardRecipeUseDto[]
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
  // Admin only, for the same reason as sources: which library entry a group came
  // from, and whether a newer version exists, is the owner's working state. A
  // visitor sees the nodes themselves, which are ordinary items.
  ...(recipeUses === undefined || options.isPublicReader ? {} : { recipeUses }),
});
