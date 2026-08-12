import { DEFAULT_PLACEHOLDER, HEX_COLOUR } from "../../config/nodeTypes.js";
import type { BoardItem, BoardItemVariation, BoardWire } from "../types";

/**
 * Drag-and-drop type for an image pulled off a node.
 *
 * Board-specific so the canvas can tell it apart from a file dropped in from
 * the desktop, which is a different act with a different cost — one uploads,
 * the other already lives in our own storage and only needs pinning.
 */
export const BOARD_IMAGE_TYPE = "application/x-board-image";

/**
 * What an item shows, and what it hands down a wire.
 *
 * Shared rather than kept inside the node view, because two places now need it
 * — the node draws its gallery, and the canvas resolves what a wire is carrying
 * — and the fallback chain below is exactly the sort of thing that goes wrong
 * when it is written twice. It already did once: a node that read only the
 * newest shape stranded every result saved before that shape existed.
 */

/**
 * Every image a node has to show, newest shape first.
 *
 * `history` is everything it has made. `variations` covers a run that finished
 * before history existed, and the bare `url` covers results saved before either
 * did — an image already paid for should never be stranded in the database
 * because the shape around it moved on.
 */
export const pickImages = (
  stored: BoardItem["result"]
): BoardItemVariation[] => {
  if (stored?.history?.length) {
    return stored.history;
  }
  if (stored?.variations?.length) {
    return stored.variations;
  }
  return stored?.url ? [stored as BoardItemVariation] : [];
};

/** Which stored version the node is showing; the first until one is picked. */
export const selectedIndex = (config: Record<string, unknown>): number =>
  typeof config.selectedVersion === "number" ? config.selectedVersion : 0;

/**
 * The words this item sends downstream, or null if it sends none.
 *
 * Mirrors singleOutputOf on the server, which is the authority — this exists so
 * a node can *show* what is arriving on its prompt rather than merely saying
 * that something is. A wire you cannot read is a wire you have to trust.
 */
/** A chain of Combine nodes longer than this is a mistake, not a design. */
const MAX_JOIN_DEPTH = 8;

/**
 * Every prompt an Iterate node describes.
 *
 * Mirrors iteratedOutputsOf on the server, which is the authority. This exists
 * so the node can show what it will send before anything is run.
 */
export const iteratedTextOf = (
  item: BoardItem,
  graph: { items: BoardItem[]; wires: BoardWire[] },
  depth = 0
): string[] => {
  if (depth > MAX_JOIN_DEPTH) {
    return [];
  }
  /** Each wire kept apart, because each wire fills its own slot. */
  const readPerWire = (port: string): string[] =>
    graph.wires
      .filter((w) => w.targetItemId === item.id && w.targetPort === port)
      .map((w) => graph.items.find((i) => i.id === w.sourceItemId))
      .map((source) =>
        source ? (outputTextOf(source, graph, depth + 1) ?? "") : ""
      )
      .filter((text) => text.trim());

  const config = item.config ?? {};
  const typedTemplate =
    typeof config.template === "string" ? config.template.trim() : "";
  const template = readPerWire("template").at(-1) ?? typedTemplate;
  if (!template) {
    return [];
  }
  const raw = config.placeholder;
  const placeholder =
    typeof raw === "string" && raw.trim() ? raw.trim() : DEFAULT_PLACEHOLDER;

  const wiredLists = readPerWire("values");
  const typedList =
    typeof config.values === "string" && config.values.trim()
      ? [config.values]
      : [];
  const slots = template.split(placeholder).length - 1;
  const lists =
    wiredLists.length > 0
      ? // One wire per slot: the list on the first wire fills the first {}.
        wiredLists
          .map((wired) => splitValues(wired, config.split))
          .filter((list) => list.length > 0)
      : columnsOf(typedList[0] ?? "", slots, config.split);

  return expandTemplate(template, placeholder, lists);
};

/** Mirrors expandTemplate on the server, which is the authority. */
const expandTemplate = (
  template: string,
  placeholder: string,
  lists: string[][]
): string[] => {
  const parts = template.split(placeholder);
  if (parts.length - 1 === 0 || lists.length === 0) {
    return [template];
  }
  const rows = Math.max(...lists.map((list) => list.length));
  return Array.from({ length: rows }, (_, row) =>
    parts.reduce((text, part, index) => {
      if (index === 0) {
        return part;
      }
      const list = lists[Math.min(index - 1, lists.length - 1)] ?? [];
      return text + (list[row % list.length] ?? "") + part;
    }, "")
  );
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
const columnsOf = (raw: string, slots: number, mode: unknown): string[][] => {
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

const LINES = /\r?\n/;

const splitValues = (raw: string, mode: unknown): string[] => {
  if (mode === "whole") {
    return [raw.trim()].filter(Boolean);
  }
  const parts = mode === "commas" ? raw.split(",") : raw.split(LINES);
  return parts.map((part) => part.trim()).filter(Boolean);
};

/**
 * A palette node's line, mirroring paletteTextOf on the server.
 *
 * The hex codes are written into the sentence deliberately: it reads as English
 * for the models that can only be asked, and Ideogram v3 has the codes lifted
 * back out into a real palette parameter.
 */
export const paletteTextOf = (
  config: Record<string, unknown>
): string | null => {
  const raw = typeof config.colors === "string" ? config.colors : "";
  const colours = raw.match(HEX_COLOUR);
  if (!colours || colours.length === 0) {
    return null;
  }
  const strict = config.strictness === "mostly" ? "predominantly" : "only";
  return `using ${strict} these colours: ${colours.join(", ")}`;
};

export const outputTextOf = (
  item: BoardItem,
  /** Needed only to resolve a Combine node, whose value is its inputs. */
  graph?: { items: BoardItem[]; wires: BoardWire[] },
  depth = 0
): string | null => {
  // Mirrors singleOutputOf on the server. Duplicated deliberately: the server
  // is the authority on what actually runs, and this exists so the canvas can
  // *show* the same answer without asking it.
  if (item.nodeType === "join" && graph && depth <= MAX_JOIN_DEPTH) {
    const parts = graph.wires
      .filter((w) => w.targetItemId === item.id && w.targetPort === "text")
      .map((w) => graph.items.find((i) => i.id === w.sourceItemId))
      .map((source) => (source ? outputTextOf(source, graph, depth + 1) : null))
      .filter((part): part is string => Boolean(part?.trim()));
    if (parts.length === 0) {
      return null;
    }
    const separator = item.config?.separator;
    return parts.join(typeof separator === "string" ? separator : ", ");
  }
  if (item.nodeType === "palette") {
    return paletteTextOf(item.config ?? {});
  }
  if (item.kind === "note" || item.kind === "text") {
    return item.body?.trim() || null;
  }
  if (item.kind !== "op") {
    return null;
  }
  // A produced description, when the node ran and made words.
  const produced = item.result?.text;
  if (typeof produced === "string" && produced.trim()) {
    return produced;
  }
  // A source node holds its value in settings and never runs, so there is no
  // result to read — a Prompt node keeps it under `text`, the others `prompt`.
  const config = item.config ?? {};
  const typed = config.text ?? config.prompt;
  return typeof typed === "string" && typed.trim() ? typed : null;
};

/**
 * The single image this item sends downstream, or null if it has none yet.
 *
 * A generated node offers the version currently chosen on it, so picking a
 * different one in the gallery re-styles whatever it feeds without any further
 * action — the selection is the answer to "which of these did you mean", and it
 * should mean the same thing everywhere. Mirrors what the run endpoint does
 * server-side when it resolves an upstream node's output.
 */
export const outputImageOf = (item: BoardItem): string | null => {
  if (item.kind === "photo" || item.kind === "reference") {
    return item.imageUrl ?? null;
  }
  if (item.kind !== "op") {
    return null;
  }
  const images = pickImages(item.result).filter((image) => Boolean(image?.url));
  if (images.length === 0) {
    return null;
  }
  const chosen = images[selectedIndex(item.config ?? {})] ?? images[0];
  return chosen?.url ?? null;
};
