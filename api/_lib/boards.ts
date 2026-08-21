/**
 * Shared shapes and validation for moodboards.
 *
 * Item geometry arrives from a canvas the user drags directly, so every number
 * is clamped rather than trusted: a NaN reaching the database would render an
 * item at an unreachable position with no way to select it and drag it back.
 */

import type { RunState } from "../../config/nodeTypes.js";
import type { TextStyle } from "../../config/textStyle.js";

export type BoardItemKind =
  | "photo"
  | "reference"
  | "note"
  | "text"
  | "op"
  | "frame"
  | "shader"
  | "drawing";

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
  recipe_use_id?: string | null;
  result?: unknown;
  run_error?: string | null;
  run_state?: string | null;
  /** One JSONB blob of type settings; see config/textStyle.ts for why. */
  text_style?: unknown;
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

export interface BoardRecipeUseDto {
  id: string;
  /** Null once the recipe has been deleted — the board keeps working (FR-009). */
  latestVersion: number | null;
  pinnedVersion: number;
  recipeId: string | null;
  recipeName: string | null;
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
  /** Which recipe group this node belongs to; null for everything else. */
  recipeUseId: string | null;
  result: Record<string, unknown> | null;
  runError: string | null;
  runState: RunState | null;
  /** How a text or note item is set; null renders the defaults for its kind. */
  textStyle: TextStyle | null;
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
  /** Admin only: the recipe groups on this board and their versions. */
  recipeUses?: BoardRecipeUseDto[];
  slug: string | null;
  sources?: BoardSourceDto[];
  title: string;
  updatedAt: string;
  wires?: BoardWireDto[];
}

/**
 * Validates one wire from the client.
 *
 * Shape only — that both ends exist, that the ports are real and that the graph
 * stays acyclic is checked in config/graph.ts, which needs the whole item and
 * wire set to answer.
 */
