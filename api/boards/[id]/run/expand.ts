/**
 * Turning one written template into the several prompts it describes.
 *
 * Pure string work, split out of run.ts so it can be read — and tested —
 * without a database row, a wire or a fal key anywhere near it. The functions
 * that *walk the graph* to find the values stayed behind in run/outputs.ts:
 * they recurse through `outputsOf`, and a module that called back into the
 * resolver would be half of an import cycle rather than a layer beneath it.
 *
 * So the rule here is the seam: this file knows about strings and lists. It
 * does not know what a node is.
 */

/** How a written list is broken into lines, whatever wrote it. */
export const LINES = /\r?\n/;

/**
 * The template filled in, once per row of the value lists.
 *
 * Each wire fills its own placeholder — first list, first slot — which makes
 * "a {} card with the word {}" work with a list of colors and a list of words.
 * A naive replace fills every slot alike: "a Brainstorm card with the word
 * Brainstorm".
 *
 * Lists are read across, not combined: four colors and five words give five
 * prompts, not twenty. A cross product is occasionally wanted, never expected,
 * and multiplies the cost. A short list repeats rather than truncating.
 */
export const expandTemplate = (
  template: string,
  placeholder: string,
  lists: string[][]
): string[] => {
  const parts = template.split(placeholder);
  const slots = parts.length - 1;
  if (slots === 0 || lists.length === 0) {
    return [template];
  }
  const rows = Math.max(...lists.map((list) => list.length));
  return Array.from({ length: rows }, (_, row) =>
    parts.reduce((text, part, index) => {
      if (index === 0) {
        return part;
      }
      // One list per slot; with a single list every slot draws from it, which
      // keeps the simple one-placeholder case working unchanged.
      const list = lists[Math.min(index - 1, lists.length - 1)] ?? [];
      const value = list[row % list.length] ?? "";
      return text + value + part;
    }, "")
  );
};

/** How one incoming text becomes one or several values. */
export const splitValues = (raw: string, mode: unknown): string[] => {
  if (mode === "whole") {
    return [raw.trim()].filter(Boolean);
  }
  const parts = mode === "commas" ? raw.split(",") : raw.split(LINES);
  return parts.map((part) => part.trim()).filter(Boolean);
};

/**
 * The typed Values field, read as one list per slot.
 *
 * With a single placeholder it is simply a list. With several, each line is one
 * row and the commas within it are its columns — "Orange, Brainstorm" on one
 * line fills both slots of that prompt. Typing pairs as pairs is how anyone would
 * write them down, and it is the only way the typed field can feed more than
 * one slot without growing a field per slot.
 */
export const columnsOf = (
  raw: string,
  slots: number,
  mode: unknown
): string[][] => {
  if (!raw.trim()) {
    return [];
  }
  if (slots <= 1) {
    const list = splitValues(raw, mode);
    return list.length > 0 ? [list] : [];
  }
  const rows = raw
    .split(LINES)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((cell) => cell.trim()));
  return Array.from({ length: slots }, (_, column) =>
    rows.map((cells) => cells[column] ?? cells.at(-1) ?? "").filter(Boolean)
  ).filter((list) => list.length > 0);
};
