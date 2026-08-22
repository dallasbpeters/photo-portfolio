import { containedBy, type GraphWire } from "../../../../config/graph.js";
import { DEFAULT_PLACEHOLDER } from "../../../../config/nodes/iterate.js";
import { HEX_COLOUR } from "../../../../config/nodes/palette.js";
import { isRunnableNodeType } from "../../../../config/nodeTypes.js";
import type { BoardItemRow } from "../../../_lib/boards.js";
import { columnsOf, expandTemplate, LINES, splitValues } from "./expand.js";
import { asObject, toBox } from "./rows.js";

/** One row per line, blanks dropped. Mirrors parseItems in src/boards. */
const LIST_LINES = /\r?\n/;
const listRowsOf = (stored: unknown): string[] =>
  typeof stored === "string"
    ? stored
        .split(LIST_LINES)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

/**
 * What every item on a board hands to whatever it feeds.
 *
 * The resolver, kept together in one file because it is genuinely one thing:
 * `outputsOf` and `singleOutputOf` call down into the per-node readers, and two
 * of those readers — batch and iterate — call straight back up. Splitting the
 * family along node lines would make that mutual recursion an import cycle,
 * which ES modules permit and then break on load order. The pure string half
 * has no such tie and lives in run/expand.ts.
 *
 * Nothing here spends money or touches the network. Resolving a graph is
 * reading, and it must stay cheap enough to do on every run to decide whether a
 * run is needed at all.
 */

/** A chain of Combine nodes longer than this is a mistake, not a design. */
export const MAX_JOIN_DEPTH = 8;

/**
 * Every prompt an Iterate node describes.
 *
 * The template with each value dropped into the placeholder. A value that would
 * produce the same prompt twice is still run twice — repeats in the list are
 * the author's business, not this function's.
 */
const iteratedOutputsOf = (
  row: BoardItemRow,
  rows: BoardItemRow[],
  wires: GraphWire[],
  depth: number
): string[] => {
  if (depth > MAX_JOIN_DEPTH) {
    return [];
  }
  /**
   * Each wire's text kept apart, because each wire fills its own slot.
   *
   * `single` is for the ports that hold one value — the template, and the line
   * appended to each prompt. A wire can carry several (a Palette node set to
   * send one color at a time carries one per swatch), and running them all
   * together into a single field produced a suffix five colors long stuck on
   * the end of every prompt.
   */
  const readPerWire = (port: string, single = false): string[] =>
    wires
      .filter(
        (wire) => wire.targetItemId === row.id && wire.targetPort === port
      )
      .map((wire) =>
        rows.find((candidate) => candidate.id === wire.sourceItemId)
      )
      .map((source) => {
        const sent = source ? outputsOf(source, rows, wires, depth + 1) : [];
        return single ? (sent[0] ?? "") : sent.join("\n");
      })
      .filter((text) => text.trim());

  const config = asObject(row.config);
  // A wire beats the typed field, as a Generate node's prompt does: wiring is
  // the more deliberate act.
  const typedTemplate =
    typeof config.template === "string" ? config.template.trim() : "";
  const template = readPerWire("template", true).at(-1) ?? typedTemplate;
  if (!template) {
    return [];
  }
  const placeholder =
    typeof config.placeholder === "string" && config.placeholder.trim()
      ? config.placeholder.trim()
      : DEFAULT_PLACEHOLDER;

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
          .map((raw) => splitValues(raw, config.split))
          .filter((list) => list.length > 0)
      : columnsOf(typedList[0] ?? "", slots, config.split);

  // Appended per prompt rather than once for all of them. A Palette node
  // sending one color at a time carries a list, and the point of that list is
  // that each prompt gets a different one — a single suffix repeated would be
  // the "together" mode with extra steps. A shorter list cycles, as everywhere
  // else here.
  const suffixes = readPerWire("suffix");
  const prompts = expandTemplate(template, placeholder, lists);
  if (suffixes.length === 0) {
    return prompts;
  }
  const parts = suffixes
    .flatMap((text) => text.split(LINES))
    .filter((t) => t.trim());
  return prompts.map(
    (prompt, index) => `${prompt}, ${parts[index % parts.length]?.trim() ?? ""}`
  );
};

/**
 * A palette node's line of text. Written as a sentence containing the hex
 * codes, the one shape that serves both mechanisms: a model that can only be
 * asked reads it as English, and Ideogram v3 has the codes lifted back out.
 */
export const paletteTextOf = (
  config: Record<string, unknown>
): string | null => {
  const raw = typeof config.colors === "string" ? config.colors : "";
  const colors = raw.match(HEX_COLOUR);
  if (!colors || colors.length === 0) {
    return null;
  }
  const strict = config.strictness === "mostly" ? "predominantly" : "only";
  return `using ${strict} these colors: ${colors.join(", ")}`;
};

/**
 * What a palette sends: one constraint, or one color at a time. Separately is
 * what lets an Iterate node work through a palette —
 * a slot filled with each color in turn, one image per color — rather than
 * every color being pressed into a single image.
 */
const paletteOutputsOf = (config: Record<string, unknown>): string[] => {
  if (config.output !== "one at a time") {
    const line = paletteTextOf(config);
    return line ? [line] : [];
  }
  const raw = typeof config.colors === "string" ? config.colors : "";
  const strict = config.strictness === "mostly" ? "predominantly" : "only";
  // Each color as an instruction rather than as a bare code. "#5ccde9" on the
  // end of a prompt is a string a model has to guess the meaning of; "using
  // only this color: #5ccde9" says what to do with it, and reads the same way
  // as the together form so switching between them changes the number of
  // prompts rather than their grammar.
  return (raw.match(HEX_COLOUR) ?? []).map(
    (hex) => `using ${strict} this color: ${hex}`
  );
};

/**
 * Everything wired into a Batch node, flattened in wire order. Recurses through
 * outputsOf rather than singleOutputOf, so a frame contributes all its pictures
 * rather than only its first — the whole point of putting one there.
 */
const batchOutputsOf = (
  row: BoardItemRow,
  rows: BoardItemRow[],
  wires: GraphWire[],
  depth: number
): string[] => {
  if (depth > MAX_JOIN_DEPTH) {
    return [];
  }
  const all = wires
    .filter(
      (wire) => wire.targetItemId === row.id && wire.targetPort === "image"
    )
    .flatMap((wire) => {
      const source = rows.find(
        (candidate) => candidate.id === wire.sourceItemId
      );
      return source ? outputsOf(source, rows, wires, depth + 1) : [];
    });
  // Struck off by address rather than by position: a batch resolves fresh
  // every run, so an index would come to mean a different picture as soon as
  // anything upstream changed.
  const config = asObject(row.config);
  const excluded = new Set(
    Array.isArray(config.excluded)
      ? (config.excluded as unknown[]).filter(
          (url): url is string => typeof url === "string"
        )
      : []
  );
  const kept = all.filter((url) => !excluded.has(url));
  // "Only the first N", so a frame of forty can be tried three at a time
  // before committing to the rest. Zero means all of them.
  const raw = Number(config.limit);
  const limit = Number.isFinite(raw) ? Math.trunc(raw) : 0;
  return limit > 0 ? kept.slice(0, limit) : kept;
};

/**
 * A Combine node's value: whatever feeds it, joined. Its output is a function
 * of its inputs rather than of anything stored on it — unlike a Prompt node —
 * so it is computed on every read. The depth limit is a backstop only:
 * hasCycle already refuses a graph that loops.
 */
const joinedOutputOf = (
  row: BoardItemRow,
  rows: BoardItemRow[],
  wires: GraphWire[],
  depth: number
): string | null => {
  if (depth > MAX_JOIN_DEPTH) {
    return null;
  }
  const parts = wires
    .filter(
      (wire) => wire.targetItemId === row.id && wire.targetPort === "text"
    )
    .map((wire) => rows.find((candidate) => candidate.id === wire.sourceItemId))
    .map((source) =>
      source ? singleOutputOf(source, rows, wires, depth + 1) : null
    )
    .filter((part): part is string => Boolean(part?.trim()));
  if (parts.length === 0) {
    return null;
  }
  const { separator } = asObject(row.config);
  return parts.join(typeof separator === "string" ? separator : ", ");
};

/** The newest picture a run or an edit stored on a row, if there is one. */
const storedImageOf = (row: BoardItemRow): string | null => {
  const result = asObject(row.result);
  return typeof result.url === "string" && result.url ? result.url : null;
};

/**
 * What an item hands to whatever it feeds.
 *
 * A photograph resolves through its join rather than a stored copy, so
 * re-uploading it keeps the graph correct — the same reasoning rowToItemDto
 * already applies for display.
 */
export const singleOutputOf = (
  row: BoardItemRow,
  rows: BoardItemRow[],
  wires: GraphWire[],
  depth = 0
): string | null => {
  if (row.node_type === "join") {
    return joinedOutputOf(row, rows, wires, depth);
  }
  if (row.node_type === "palette") {
    return paletteTextOf(asObject(row.config));
  }
  /*
   * A picture that has been worked on hands over the work, not the original.
   *
   * An edit — by hand, by a tool, or through Affinity — is written back as a
   * new version on `result`, exactly as a generation is. Reading `photo_url`
   * first meant a photograph that had been rotated, retouched or masked sent
   * its untouched original down every wire, while the canvas beside it drew the
   * edit. The same precedence ItemMedia uses, and it has to be the same.
   */
  if (row.kind === "photo") {
    return storedImageOf(row) ?? row.photo_url ?? null;
  }
  if (row.kind === "reference") {
    return storedImageOf(row) ?? row.image_url;
  }
  if (row.kind === "note" || row.kind === "text") {
    return row.body;
  }
  // An element hands over its key image — one wire, one job. Resolved onto the
  // row by withElements. Its words travel too, but not through here: see
  // elementTextOf, which reads them off the same wire.
  if (row.node_type === "element") {
    return row.image_url;
  }
  /*
   * A Brand node hands over the kit as prompt material.
   *
   * Read from `brandText`, which withBrandKits resolved from the library before
   * the walk began — never from the node's own config, which holds only an id.
   * Empty means no kit chosen, or a kit since deleted; both contribute nothing
   * rather than a stale brand, and returning null keeps the wire silent instead
   * of joining an empty string into somebody's prompt.
   */
  if (row.node_type === "brand") {
    const text = asObject(row.config).brandText;
    return typeof text === "string" && text.trim() ? text : null;
  }
  // A source node produces its value without ever running, so it is read from
  // its settings rather than from a result it will never have.
  if (!isRunnableNodeType(row.node_type)) {
    const config = asObject(row.config);
    const text = config.text ?? config.prompt;
    return typeof text === "string" && text.trim() ? text : null;
  }
  const result = asObject(row.result);
  // A node that produced words hands the words along. The port type decides
  // what a string means, so text and a URL travel the same way.
  if (typeof result.text === "string" && result.text.trim()) {
    return result.text;
  }
  // A node that has had a version picked hands that one downstream: choosing a
  // version is choosing the node's output, not merely what it displays.
  const history = Array.isArray(result.history)
    ? (result.history as { url?: string }[])
    : [];
  const { selectedVersion } = asObject(row.config);
  const selected = Number(selectedVersion);
  const chosen = Number.isFinite(selected) ? history[selected]?.url : undefined;
  if (typeof chosen === "string") {
    return chosen;
  }
  return typeof result.url === "string" ? result.url : null;
};

/**
 * Everything an item hands downstream.
 *
 * A list rather than one value, because a frame emits every image sitting on
 * it — one wire out of a frame is a dozen jobs. Everything else contributes at
 * most one, so the list is how both fit the same wire.
 */
export const outputsOf = (
  row: BoardItemRow,
  rows: BoardItemRow[],
  wires: GraphWire[],
  depth = 0
): string[] => {
  // A Batch node is a window onto its inputs: everything wired into it, in
  // wire order, passed straight through. Plural like a frame, and for the same
  // reason — one wire out of it is many runs.
  if (row.node_type === "batch") {
    return batchOutputsOf(row, rows, wires, depth);
  }
  // The two nodes whose output is plural by design.
  if (row.node_type === "iterate") {
    return iteratedOutputsOf(row, rows, wires, depth);
  }
  // A List hands over exactly what is written on it, one row at a time. The
  // rows are the node's whole value, so nothing is computed and nothing is
  // read from upstream — filling it from a wire is an edit, made once, not a
  // resolution performed on every read.
  if (row.node_type === "list") {
    return listRowsOf(asObject(row.config).items);
  }
  if (row.node_type === "palette") {
    return paletteOutputsOf(asObject(row.config));
  }
  if (row.kind !== "frame") {
    const single = singleOutputOf(row, rows, wires);
    return single ? [single] : [];
  }
  // Resolved from geometry, exactly as the canvas resolves it — see
  // containedBy for why membership is computed rather than stored.
  return containedBy(toBox(row), rows.map(toBox))
    .map((box) => rows.find((candidate) => candidate.id === box.id))
    .map((contained) =>
      contained ? singleOutputOf(contained, rows, wires) : null
    )
    .filter((url): url is string => url !== null);
};
