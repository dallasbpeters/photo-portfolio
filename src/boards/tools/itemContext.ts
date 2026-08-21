import type { BoardItem } from "../../types.js";
import { maskOf } from "../drawing/mask.js";
import { currentImageUrl } from "../itemOutput";

/**
 * What a board item can offer a tool, in the three terms `blockedReason` asks in.
 *
 * One derivation, shared by the picker and the runner on purpose. They ask the
 * same question a moment apart — the picker to decide whether a row is
 * disabled, the runner to decide whether to spend — and two derivations that
 * disagreed would show an enabled row that refuses when clicked, or a disabled
 * row for a tool that would have worked. Either reads as the picker being
 * broken, and neither would raise an error anywhere.
 */
export interface ToolContext {
  hasImage: boolean;
  hasMask: boolean;
  hasPrompt: boolean;
}

/**
 * The words this item already carries, if any.
 *
 * An op node's typed prompt lives in `config.prompt`; a note or a text item is
 * words by definition, and "the note says what I want, make it" is the whole
 * reason `generate-image` lists `note` in its `appliesTo`. Everything else has
 * none, and a tool that needs words says so rather than inventing them.
 *
 * Nothing here reaches down a wire. A prompt arriving from an upstream node is
 * resolved server-side at run time (see `singleOutputOf`), and guessing at it
 * here would enable a tool on the strength of words this item cannot see.
 */
export const promptOf = (item: Readonly<BoardItem>): string | null => {
  const typed = item.config?.prompt;
  if (typeof typed === "string" && typed.trim()) {
    return typed.trim();
  }
  if ((item.kind === "note" || item.kind === "text") && item.body?.trim()) {
    return item.body.trim();
  }
  return null;
};

/**
 * The picture a tool would work from: the newest run's output, else the placed
 * image. The same order the executors resolve in — see `sourceUrlOf` in both.
 */
/**
 * The picture an item currently is.
 *
 * Re-exported rather than restated. This was a fourth copy of the same rule, and
 * copies of it disagreeing is the shape of most of what has gone wrong here: the
 * canvas drew the edit while the wires sent the original, twice over. One
 * definition, in itemOutput.
 */
export const imageOf = currentImageUrl;

export const toolContextOf = (item: Readonly<BoardItem>): ToolContext => ({
  hasImage: imageOf(item) !== null,
  // A painted mask, not a rendered one. Rasterising and uploading happens at
  // run time; what matters here is whether there is anything to rasterise.
  hasMask: maskOf(item.config) !== null,
  hasPrompt: promptOf(item) !== null,
});
