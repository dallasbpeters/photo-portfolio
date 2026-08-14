import type { VercelRequest, VercelResponse } from "@vercel/node";
import sharp from "sharp";
import {
  containedBy,
  type GraphItem,
  type GraphWire,
  hasCycle,
  incomingByPort,
} from "../../../config/graph.js";
import { ICON_STYLES, isIconStyle } from "../../../config/iconStyles.js";
import {
  DEFAULT_PLACEHOLDER,
  type FalModelDef,
  type FalModelInput,
  falModelFor,
  falModelInput,
  falModelMasks,
  HEX_COLOUR,
  isFalModel,
  isRunnableNodeType,
  isVectorModel,
  MAX_BATCH_COUNT,
  type NodeCapability,
  nodeTypeFor,
} from "../../../config/nodeTypes.js";
import { getBearerUser } from "../../_lib/auth.js";
import type { BoardItemRow, BoardWireRow } from "../../_lib/boards.js";
import { handleCors } from "../../_lib/cors.js";
import { getSql } from "../../_lib/db.js";
import {
  describeImage,
  generateImage,
  isFalConfigured,
} from "../../_lib/fal.js";
import { inputFingerprint } from "../../_lib/fingerprint.js";
import { parsePublicHttpUrl } from "../../_lib/httpUrl.js";
import { generateIcon, isMagnificConfigured } from "../../_lib/magnific.js";
import { loadModelDefs } from "../../_lib/models.js";
import { parseJsonBody } from "../../_lib/parseBody.js";
import { persistBytes } from "../../_lib/persistGenerated.js";
import { getSite } from "../../_lib/site.js";

type Sql = ReturnType<typeof getSql>;

/** An explicit scheme, as api/ai/generate.ts requires for the same reason. */
const HTTP_SCHEME = /^https?:\/\//i;

const LINES = /\r?\n/;

/** A chain of Combine nodes longer than this is a mistake, not a design. */
const MAX_JOIN_DEPTH = 8;

/** Matches an SVG by extension, ignoring any query string. */
const SVG_URL = /\.svg(\?|$)/i;

/** Rasterized copies, keyed by the SVG URL they were made from. */
const RASTER_CACHE = new Map<string, string>();

/**
 * The PNG an SVG becomes, so an image model can read it.
 *
 * fal's image models read pixels, not vectors — and this app makes plenty of
 * vectors: Recraft's vector models, the icon generator, and every Affinity edit
 * synced back onto a board. Those used to be refused or dropped the moment one
 * reached an image model, which stranded any frame that contained a single
 * vector. Instead the SVG is rasterized here, at the moment it is consumed,
 * into a PNG stored like any generated file. The cache just spares a warm
 * function re-rendering the same SVG for every job of a batch.
 */
const rasterizeSvgUrl = async (url: string): Promise<string> => {
  const cached = RASTER_CACHE.get(url);
  if (cached) {
    return cached;
  }
  const fetched = await fetch(url);
  if (!fetched.ok) {
    throw new Error(
      `Could not download the SVG to rasterize (${fetched.status})`
    );
  }
  const svg = Buffer.from(await fetched.arrayBuffer());
  const png = await sharp(svg, { density: 96 })
    // Bounded for fal's sake, never enlarged: a poster-sized vector should not
    // arrive as a four-thousand-pixel raster.
    .resize({
      fit: "inside",
      height: 2048,
      width: 2048,
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  const stored = await persistBytes(png, "boards/ai", "image/png");
  RASTER_CACHE.set(url, stored);
  return stored;
};

/**
 * Runs exactly one node on a board.
 *
 * One node per request, and no run state kept between requests, because a
 * single generation already budgets close to two minutes — 120s in
 * api/_lib/fal.ts, 110s in api/_lib/magnific.ts — against a serverless ceiling.
 * A three-node chain could not fit in one call under any timeout the platform
 * allows, so the browser walks the graph in dependency order and calls this
 * once per node. That keeps every run an individually authorised request.
 *
 * Admin-only, and deliberately so: every call spends money on the project's
 * accounts. Publishing a board does not open this — an anonymous caller gets a
 * 401 whether or not the board is public.
 */

interface RunnableItem {
  config: Record<string, unknown>;
  id: string;
  nodeType: string;
  result: { fingerprint?: string; url?: string } | null;
  runState: string | null;
}

const asObject = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const loadItems = async (sql: Sql, boardId: string) =>
  (await sql`
    SELECT i.id, i.kind, i.body, i.image_url, i.node_type, i.config,
           i.result, i.run_state, i.photo_id,
           p.url AS photo_url
    FROM board_items i
    LEFT JOIN photos p ON p.id = i.photo_id
    WHERE i.board_id = ${boardId}
  `) as BoardItemRow[];

const loadWires = async (sql: Sql, boardId: string) =>
  (await sql`
    SELECT id, source_item_id, source_port, target_item_id, target_port
    FROM board_wires
    WHERE board_id = ${boardId}
  `) as BoardWireRow[];

/** Anything else in `elementId` would make `::uuid[]` throw for the whole board. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ElementFields {
  cover_url: string | null;
  description: string | null;
  id: string;
}

/**
 * The library rows every element node points at, folded into the board's rows.
 *
 * An element node stores only an id. The picture it hands over and the words it
 * carries belong to the library, so that a style can be corrected in one place
 * and every board using it follows — which is the difference between a library
 * and a stamp.
 *
 * Resolved here, once, before anything walks the graph: `singleOutputOf` then
 * finds a plain image on the row and the prompt finds plain words, so nothing
 * downstream has to know an element was involved.
 *
 * The copy stored on the node is the fallback. An element deleted from the
 * library leaves the boards built with it still showing, and still able to run,
 * the picture they were built with — a tidy-up in a side panel must not quietly
 * break work.
 */
const withElements = async (
  sql: Sql,
  rows: BoardItemRow[]
): Promise<BoardItemRow[]> => {
  const wanted = new Set<string>();
  for (const row of rows) {
    const id = asObject(row.config).elementId;
    if (
      row.node_type === "element" &&
      typeof id === "string" &&
      UUID.test(id)
    ) {
      wanted.add(id);
    }
  }
  if (wanted.size === 0) {
    return rows;
  }

  const found = (await sql`
    SELECT id, cover_url, description
    FROM elements
    WHERE id = ANY(${[...wanted]}::uuid[])
  `) as ElementFields[];
  const byId = new Map(found.map((element) => [element.id, element]));

  return rows.map((row) => {
    if (row.node_type !== "element") {
      return row;
    }
    const config = asObject(row.config);
    const element =
      typeof config.elementId === "string"
        ? byId.get(config.elementId)
        : undefined;
    const storedImage =
      typeof config.imageUrl === "string" ? config.imageUrl : null;
    const storedWords =
      typeof config.description === "string" ? config.description : null;
    return {
      ...row,
      body: element?.description ?? storedWords,
      image_url: element?.cover_url ?? storedImage,
    };
  });
};

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
  /** Each wire's text kept apart, because each wire fills its own slot. */
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
  // A wire beats the typed field, the same rule a Generate node's prompt
  // follows: wiring is the more deliberate act.
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
 * The template filled in, once per row of the value lists.
 *
 * Each wire fills its own placeholder: the first list goes into the first slot,
 * the second into the second, and so on. That is what makes "a {} card with the
 * word {}" work with a list of colors and a list of words — replacing every
 * slot with the same value, which is what a naive replace does, produced "a
 * Brainstorm card with the word Brainstorm".
 *
 * Lists are read across rather than combined: four colors and five words give
 * five prompts, not twenty. A cross product is occasionally what someone wants
 * and is never what they expect, and it multiplies what a run costs.
 *
 * A list shorter than the longest repeats. Truncating to the shortest would
 * silently drop values that were deliberately typed in.
 */
const expandTemplate = (
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

/** How one incoming text becomes one or several values. */
const splitValues = (raw: string, mode: unknown): string[] => {
  if (mode === "whole") {
    return [raw.trim()].filter(Boolean);
  }
  const parts = mode === "commas" ? raw.split(",") : raw.split(LINES);
  return parts.map((part) => part.trim()).filter(Boolean);
};

/**
 * A palette node's line of text.
 *
 * Written as a sentence containing the hex codes, which is the one shape that
 * serves both mechanisms: a model that can only be asked reads it as English,
 * and Ideogram v3 has the codes lifted back out into a real color palette.
 */
/**
 * What a palette sends: one constraint, or one color at a time.
 *
 * Sending them separately is what lets an Iterate node work through a palette —
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

const paletteTextOf = (config: Record<string, unknown>): string | null => {
  const raw = typeof config.colors === "string" ? config.colors : "";
  const colors = raw.match(HEX_COLOUR);
  if (!colors || colors.length === 0) {
    return null;
  }
  const strict = config.strictness === "mostly" ? "predominantly" : "only";
  return `using ${strict} these colors: ${colors.join(", ")}`;
};

/**
 * A Combine node's value: whatever feeds it, joined.
 *
 * Its output is a function of its inputs rather than of anything stored on it,
 * which is what makes it different from a Prompt node — so it is computed here
 * on every read instead of being saved anywhere.
 *
 * The depth limit is a backstop only. hasCycle already refuses a graph that
 * loops, and this recursion is bounded by that same acyclic structure.
 */
/**
 * Everything wired into a Batch node, flattened in wire order.
 *
 * Recurses through outputsOf rather than singleOutputOf, so a frame wired into
 * a batch contributes all of its pictures rather than only its first — which
 * is the whole point of putting one there.
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

/**
 * What an item hands to whatever it feeds.
 *
 * A photograph resolves through its join rather than a stored copy, so
 * re-uploading it keeps the graph correct — the same reasoning rowToItemDto
 * already applies for display.
 */
const singleOutputOf = (
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
  if (row.kind === "photo") {
    return row.photo_url ?? null;
  }
  if (row.kind === "reference") {
    return row.image_url;
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
const outputsOf = (
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

const toBox = (row: BoardItemRow) => ({
  height: num(row.height),
  id: row.id,
  kind: row.kind,
  width: num(row.width),
  x: num(row.x),
  y: num(row.y),
});

/** Geometry arrives from the driver as strings often enough to coerce here. */
const num = (value: number | string): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const toGraphItems = (rows: BoardItemRow[]): GraphItem[] =>
  rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    nodeType: row.node_type ?? null,
  }));

const toGraphWires = (rows: BoardWireRow[]): GraphWire[] =>
  rows.map((row) => ({
    id: row.id,
    sourceItemId: row.source_item_id,
    sourcePort: row.source_port,
    targetItemId: row.target_item_id,
    targetPort: row.target_port,
  }));

interface ResolvedInputs {
  /**
   * Each port's values grouped by the wire they arrived on.
   *
   * Kept alongside the flattened form because who sent what matters for the
   * prompt: one wire's five prompts are five runs, while two wires are two
   * parts of each run. Flattening loses the difference.
   */
  lists: Record<string, string[][] | undefined>;
  /** Missing required port, if any — reported without spending anything. */
  missingPort: string | null;
  /**
   * Every value wired to each port, in wire order.
   *
   * Undefined for a port nothing feeds — not an empty array. A total index
   * signature would claim every port key is present and make the callers'
   * guards look redundant when they are not.
   */
  values: Record<string, string[] | undefined>;
}

/**
 * Reads each input port's value out of the stored graph.
 *
 * Deliberately not taken from the request. This resolves a URL that is then
 * handed to a third party to go and fetch, and trusting the caller for it would
 * reopen exactly the hole api/ai/generate.ts closes by insisting on an explicit
 * scheme before forwarding anything.
 */
const resolveInputs = (
  item: RunnableItem,
  rows: BoardItemRow[],
  wires: BoardWireRow[]
): ResolvedInputs => {
  const type = nodeTypeFor(item.nodeType);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const graphWires = toGraphWires(wires);
  const incoming = incomingByPort(graphWires, item.id);

  const values: Record<string, string[] | undefined> = {};
  const lists: Record<string, string[][] | undefined> = {};
  let missingPort: string | null = null;

  for (const port of type?.inputs ?? []) {
    // Grouped by wire, because arity counts wires rather than values. One wire
    // can legitimately carry several — a frame hands over every image on it,
    // and an Iterate node hands over every prompt it wrote — and slicing those
    // down to one would silently discard most of a batch.
    const perWire: string[][] = [];
    for (const wire of incoming.get(port.key) ?? []) {
      const source = byId.get(wire.sourceItemId);
      // A wire from a node that has not run yet resolves to nothing. Those are
      // dropped rather than treated as jobs, so a half-built graph runs the
      // part that is ready instead of failing whole.
      perWire.push(source ? outputsOf(source, rows, graphWires) : []);
    }
    // A single-value input keeps only the last wire, matching what the canvas
    // does when a new wire is dropped on an occupied port.
    const kept = port.arity === "many" ? perWire : perWire.slice(-1);
    const resolved = kept.flat();
    values[port.key] = resolved;
    lists[port.key] = kept.filter((list) => list.length > 0);
    if (port.required && resolved.length === 0 && !missingPort) {
      missingPort = port.key;
    }
  }

  return { lists, missingPort, values };
};

/**
 * A wired prompt beats a typed one.
 *
 * Wiring is the more deliberate act — you went and connected something — and
 * the node says on its face that the typed field is unused while a wire is
 * attached, so the precedence is visible rather than surprising.
 */
const promptFor = (
  item: RunnableItem,
  values: Record<string, string[] | undefined>
): string => {
  const wired = values.prompt?.[0]?.trim();
  if (wired) {
    return wired;
  }
  // A Prompt node keeps its text under `text`; Generate and Icon under
  // `prompt`. Both are read so either can be the typed fallback.
  const typed = item.config.prompt ?? item.config.text;
  return typeof typed === "string" ? typed.trim() : "";
};

/**
 * The words every element wired into this node carries, in wire order.
 *
 * An element's only output port is an image, so its description never arrives
 * through `resolveInputs` — a second, text port would mean two wires for one
 * thing. It is read off the wires instead, from the body `withElements` folded
 * onto the row, so the words the library holds travel with the picture it hands
 * over rather than being left behind on the canvas.
 */
const elementTextOf = (
  itemId: string,
  rows: BoardItemRow[],
  wires: BoardWireRow[]
): string[] => {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return (
    wires
      .filter((wire) => wire.target_item_id === itemId)
      .map((wire) => byId.get(wire.source_item_id))
      .filter((source) => source?.node_type === "element")
      .map((source) => source?.body?.trim())
      .filter((words): words is string => Boolean(words))
      // The same element wired in twice says the same thing twice, which reads to
      // a model as emphasis nobody asked for.
      .filter((words, index, all) => all.indexOf(words) === index)
  );
};

/**
 * A prompt with the wired elements' words after it.
 *
 * Appended rather than substituted: an element says how a picture should look,
 * while what to draw stays whatever was typed. Joined with the separator a Join
 * node defaults to, because a prompt is a list of phrases.
 */
const withElementWords = (prompt: string, words: string[]): string =>
  [prompt.trim(), ...words].filter((part) => part.length > 0).join(", ");

/**
 * How many runs this node's settings and wiring describe.
 *
 * One per wired image, times the variation count — so three references at two
 * variations is six. With no image wired at all it is still `count` runs, each
 * invented from the prompt alone.
 */
const jobsFor = (
  item: RunnableItem,
  values: Record<string, string[] | undefined>,
  lists: Record<string, string[][] | undefined>,
  shape: FalModelInput,
  capability: NodeCapability,
  typedPrompt: string,
  /** Rendered mask for each masked picture, keyed by its image URL. */
  masks: Map<string, string>
): Job[] => {
  // Analyse reads every wired image in one call and answers once, so its
  // wiring describes a single run no matter how many references feed it.
  // Fanning out here would bill one description per image and then throw all
  // but the last away.
  if (capability === "board.composite") {
    // One run however many pictures feed it: the images are its material, not
    // a batch to iterate over. Fanning out here would store the same rendered
    // composite once per source.
    return [{ image: null, mask: null, prompt: "" }];
  }
  if (capability === "fal.describe") {
    // Reading a picture back as words is not affected by a mask.
    return [
      { image: values.image?.[0] ?? null, mask: null, prompt: typedPrompt },
    ];
  }
  const raw = Number(item.config.count);
  const count = Number.isFinite(raw)
    ? Math.min(Math.max(Math.trunc(raw), 1), MAX_BATCH_COUNT)
    : 1;
  // A prompt-only model has no use for wired images, so fanning out over them
  // would bill the same prompt several times for identical results.
  const wiredImages = shape === "prompt" ? [] : (values.image ?? []);
  const images: (string | null)[] =
    wiredImages.length > 0 ? wiredImages : [null];
  // One wire carrying several prompts is an Iterate node: each is its own run.
  // Several wires are several *parts* of each run — a subject and a palette,
  // say — so they are joined. Both at once: five subjects and one palette line
  // give five runs, each ending with the same colors.
  const promptWires =
    (values.prompt ?? []).length > 0 ? (lists.prompt ?? []) : [];
  const rows = promptWires.length
    ? Math.max(...promptWires.map((list) => list.length))
    : 0;
  const prompts =
    rows > 0
      ? Array.from({ length: rows }, (_, row) =>
          promptWires
            .map((list) => list[row % list.length] ?? "")
            .filter((part) => part.trim())
            .join(", ")
        )
      : [typedPrompt];

  // The mask belongs to the picture, so it is looked up per image rather than
  // carried on the node: two references wired into one Generate may each be
  // masked differently, or only one of them at all.
  // Prompt outermost, then image, then the repeat count — the order the
  // variations index into, so it must not be rearranged for tidiness.
  return prompts.flatMap((prompt) =>
    images.flatMap((image) =>
      Array.from({ length: count }, () => ({
        image,
        mask: image ? (masks.get(image) ?? null) : null,
        prompt,
      }))
    )
  );
};

/**
 * Every masked picture on the board, as image URL to rendered-mask URL.
 *
 * Keyed by URL because that is all a resolved image input carries: outputsOf
 * hands back addresses, not the items they came from. The alternative was to
 * thread the source item through every port resolution, which would change a
 * great deal to answer one question.
 *
 * A mask without a rendered bitmap is skipped rather than guessed at — the
 * canvas renders it before the run, and one that has not been rendered is one
 * that has changed since, so the old bitmap would mask the wrong region.
 */
const maskByUrl = (rows: BoardItemRow[]): Map<string, string> => {
  const masks = new Map<string, string>();
  for (const row of rows) {
    const config = asObject(row.config);
    const url = row.image_url;
    if (url && typeof config.maskUrl === "string" && config.maskUrl) {
      masks.set(url, config.maskUrl);
    }
  }
  return masks;
};

/**
 * How many past images a node keeps.
 *
 * Every one is a paid generation and worth keeping, but a node that has been
 * iterated on for months should not carry an unbounded list into every board
 * load. The blobs outlive this — only the reference is trimmed.
 */
const MAX_HISTORY = 40;

/**
 * What a node has made before this run.
 *
 * Appended to rather than replaced, so altering a prompt adds to the gallery
 * instead of discarding the images the previous prompt produced — they are
 * still in blob storage and still worth looking at. Seeded from whatever shape
 * the node already had, so switching history on does not strand the results
 * that predate it.
 */
const priorHistoryOf = (previous: Record<string, unknown>): Variation[] => {
  if (Array.isArray(previous.history)) {
    return previous.history as Variation[];
  }
  if (Array.isArray(previous.variations)) {
    return (previous.variations as Variation[]).filter(Boolean);
  }
  return typeof previous.url === "string"
    ? [previous as unknown as Variation]
    : [];
};

/** One image in a node's result. Mirrors BoardItemVariation in src/types.ts. */
/** One run: which image it reworks, which mask confines it, which prompt. */
interface Job {
  image: string | null;
  /** The rendered mask belonging to `image`, when that picture carries one. */
  mask: string | null;
  prompt: string;
}

interface Variation {
  description: string | null;
  height: number | null;
  isVector: boolean | null;
  url: string;
  width: number | null;
}

/**
 * What a run produced.
 *
 * Two shapes, because not every node makes a picture. The Analyse node reads an
 * image and writes words, and those words are the thing that travels down its
 * wire — so a result is either an image or a piece of text, and everything
 * downstream reads whichever it has.
 */
type Produced =
  | {
      description: string | null;
      height: number | null;
      /** Null when the concept does not apply — every raster generator. */
      isVector: boolean | null;
      kind: "image";
      url: string;
      width: number | null;
    }
  | { kind: "text"; text: string };

/**
 * Dispatches to the generator a node type declares.
 *
 * The only place a node type turns into a third-party call. Adding a node type
 * is therefore an entry in config/nodeTypes.ts plus one branch here — no schema
 * change, no change to the wire model, and nothing at all in the canvas.
 * `models` is the same list the picker was built from, so the vector claim and
 * the fal call agree with what the board was showing.
 *
 * Both generators already copy their output into blob storage before returning,
 * so a result is durable by the time it reaches this function.
 */
const produce = async (
  capability: NodeCapability,
  models: readonly FalModelDef[],
  args: {
    item: RunnableItem;
    /** "auto" (or absent) keeps fal.ts's own image-present switch. */
    model: string | null;
    prompt: string;
    /** Confines the repaint to part of the picture. See maskByUrl. */
    sourceMaskUrl: string | null;
    sourceImageUrl: string | null;
    /** Every wired image, for the one capability that reads them together. */
    sourceImageUrls: string[];
  }
): Promise<Produced> => {
  if (capability === "fal.describe") {
    if (args.sourceImageUrls.length === 0) {
      throw new Error("Analyse needs an image wired into it");
    }
    const focus =
      typeof args.item.config.focus === "string"
        ? args.item.config.focus
        : "style";
    return {
      kind: "text",
      text: await describeImage(args.sourceImageUrls, focus, args.prompt),
    };
  }

  if (capability === "board.composite") {
    // Rendered in the browser, which is the only place that knows where the
    // pictures sit — this stores what it produced so the node gets a result,
    // a history and a thumbnail like every other node. The canvas clears the
    // URL on any edit, so one that survived to here is current.
    const raw = args.item.config.compositeUrl;
    // Checked like any other URL that leaves here, even though the canvas only
    // ever writes our own blob storage into it: this value arrives through a
    // board save, and a saved board is caller-supplied data.
    const url =
      typeof raw === "string" && HTTP_SCHEME.test(raw)
        ? parsePublicHttpUrl(raw)
        : null;
    if (!url) {
      throw new Error("The composite has not been rendered yet");
    }
    return {
      description: null,
      height: null,
      isVector: null,
      kind: "image",
      url,
      width: null,
    };
  }

  if (capability === "magnific.icon") {
    const style = isIconStyle(args.item.config.style)
      ? args.item.config.style
      : ICON_STYLES[0];
    // Required by every Magnific endpoint even though this polls for the
    // result, so it points at our own sink — exactly as api/ai/icon.ts does.
    const site = getSite();
    const icon = await generateIcon(
      args.prompt,
      style,
      `https://${site.domain}/api/ai/icon-webhook`
    );
    return {
      description: null,
      height: null,
      isVector: icon.isVector,
      kind: "image",
      url: icon.url,
      width: null,
    };
  }

  // An image model reads pixels, and a wired SVG is not pixels — rasterize it
  // first. Raster sources pass through untouched, and Analyse above never gets
  // here (its vision model reads SVG fine, so it needs no conversion).
  const sourceImageUrl =
    args.sourceImageUrl && SVG_URL.test(args.sourceImageUrl)
      ? await rasterizeSvgUrl(args.sourceImageUrl)
      : args.sourceImageUrl;

  const image = await generateImage(
    args.prompt,
    sourceImageUrl,
    args.model,
    args.sourceMaskUrl
  );
  return {
    description: image.description,
    height: image.height,
    // Taken from the model's own entry rather than guessed from the file: the
    // node shows a "came back as a raster" warning, and an SVG mislabelled as
    // raster would raise it for no reason.
    isVector: isVectorModel(models, args.model) ? true : null,
    kind: "image",
    url: image.url,
    width: image.width,
  };
};

/**
 * The stored shape of an image run, with its history folded in.
 *
 * Pulled out of the handler when results stopped always being images: the two
 * shapes are genuinely different and a single object with half its fields null
 * would have been worse than two.
 */
const buildImageResult = (
  produced: Extract<Produced, { kind: "image" }>,
  variations: (Variation | undefined)[],
  previous: Record<string, unknown>,
  fingerprint: string
) => {
  // The first filled slot, found by hand: the array is sparse, and the
  // narrowing on find() reads as though the result could never be missing.
  let primaryUrl = produced.url;
  for (const filled of variations) {
    // The first image is what a wire carries downstream: a wire moves one
    // image, so the rest of a batch is for looking at, not for feeding on.
    if (filled) {
      primaryUrl = filled.url;
      break;
    }
  }
  return {
    description: produced.description,
    fingerprint,
    height: produced.height,
    history: [...priorHistoryOf(previous), produced].slice(-MAX_HISTORY),
    isVector: produced.isVector,
    kind: "image" as const,
    ranAt: new Date().toISOString(),
    url: primaryUrl,
    variations,
    width: produced.width,
  };
};

const setRunning = (sql: Sql, itemId: string) =>
  sql`
    UPDATE board_items
    SET run_state = 'running', run_error = NULL
    WHERE id = ${itemId}
  `;

const saveFailure = (sql: Sql, itemId: string, message: string) =>
  sql`
    UPDATE board_items
    SET run_state = 'failed', run_error = ${message}
    WHERE id = ${itemId}
  `;

/**
 * A refused run: why, in the words the node will show, plus whatever else the
 * canvas can act on — `missingPort` lights up the input that is wanting.
 *
 * `error` is required rather than merely likely, because it is the sentence
 * written to `run_error`. A refusal with no reason to record would be exactly
 * the silence this type exists to end.
 */
type Refusal = { error: string } & Record<string, unknown>;

/**
 * Why this model cannot run on this wiring, or null when it can.
 *
 * Checked here rather than left to fal, which only reports a mismatched body
 * after the call has been billed. Each model declares what it consumes, so an
 * unwired vectoriser or a promptless generation is refused for free.
 */

/**
 * A mask wired into a model that cannot honour one.
 *
 * Refused rather than dropped. fal would accept the request, ignore the mask,
 * repaint the entire picture and bill for it — and the result looks like a
 * generation that simply did not respect the mask, which is indistinguishable
 * from the mask having been painted wrong.
 */
const maskRefusal = (
  model: string | null,
  masked: boolean,
  models: readonly FalModelDef[]
): Refusal | null => {
  if (!masked || falModelMasks(models, model ?? "auto")) {
    return null;
  }
  const label = falModelFor(models, model)?.label ?? "This model";
  return {
    error: `${label} cannot paint into part of an image. Choose Auto or a Flux style, or clear the mask.`,
    missingPort: "image",
  };
};

const unmetRequirement = (
  shape: FalModelInput,
  model: string | null,
  prompt: string,
  values: Record<string, string[] | undefined>,
  masked: boolean,
  capability: NodeCapability,
  models: readonly FalModelDef[]
): Refusal | null => {
  // A composite has no model and no prompt — its inputs are pictures, and the
  // required image port has already been checked by resolveInputs. Running it
  // through the model rules below would refuse it for lacking a prompt that it
  // has no field to type one into.
  if (capability === "board.composite") {
    return null;
  }
  const mask = maskRefusal(model, masked, models);
  if (mask) {
    return mask;
  }
  if (shape === "prompt-and-image") {
    // Both, so both are checked before anything is spent.
    if ((values.image?.length ?? 0) === 0) {
      const label = falModelFor(models, model)?.label ?? "This model";
      return {
        error: `${label} reworks an existing image; wire one into it.`,
        missingPort: "image",
      };
    }
    if (!prompt) {
      return {
        error: "This node needs a prompt, wired in or typed on the node.",
        missingPort: "prompt",
      };
    }
    return null;
  }
  if (shape === "image") {
    const images = values.image ?? [];
    if (images.length === 0) {
      const label = falModelFor(models, model)?.label ?? "This model";
      return {
        error: `${label} traces an existing image; wire one into it.`,
        missingPort: "image",
      };
    }
    // A vectoriser has no prompt to want.
    return null;
  }
  if (!prompt) {
    return {
      error: "This node needs a prompt, wired in or typed on the node.",
      missingPort: "prompt",
    };
  }
  return null;
};

/**
 * The job list with every URL checked, or null if one is not forwardable.
 *
 * Validated even though these are usually our own blob URLs: they are handed to
 * a third party to go and fetch, which is the same reason api/ai/generate.ts
 * insists on an explicit scheme rather than helpfully adding one.
 */
const validatedJobs = (raw: Job[]): { dropped: number; jobs: Job[] } => {
  const jobs: Job[] = [];
  let dropped = 0;
  for (const job of raw) {
    if (job.image === null) {
      jobs.push(job);
      continue;
    }
    // Trimmed before the scheme is tested: the test is anchored, so a stored
    // URL carrying a stray leading space failed it and took the whole batch
    // down with it.
    const trimmed = job.image.trim();
    const url = HTTP_SCHEME.test(trimmed) ? parsePublicHttpUrl(trimmed) : null;
    if (url) {
      jobs.push({ ...job, image: url });
      continue;
    }
    // Dropped rather than fatal, for the same reason a vector is: one wire out
    // of a frame carries everything on it, and a single unusable address among
    // twenty pictures should not mean none of them run.
    dropped += 1;
  }
  return { dropped, jobs };
};

/** Either a response to send as-is, or everything the run needs. */
type Prepared =
  | {
      body: Record<string, unknown>;
      ready: null;
      /** The reason to write to `run_error`, or null to leave the node alone. */
      record: string | null;
      status: number;
    }
  | {
      body: null;
      ready: {
        capability: NodeCapability;
        fingerprint: string;
        item: RunnableItem;
        /** One entry per variation: the image it reworks and the prompt used. */
        jobs: Job[];
        model: string | null;
        prompt: string;
        /** Wired images that could not be read (unfetchable addresses), so did not run. */
        skippedVectors: number;
        /** Every wired image, for the capability that reads them together. */
        sourceImageUrls: string[];
      };
      record: null;
      status: null;
    };

/**
 * A refusal the node keeps: the reason is written to `run_error` before the
 * response is sent.
 *
 * Pre-flight refusals used to return 422 and touch nothing, so a node that
 * could never run looked — to anything reading `board_items` — exactly like one
 * that had simply never been asked to. Diagnosis went: query for errors, find
 * none, conclude the board is healthy, be wrong. The reason now outlives the
 * toast, survives a reload, and answers the one query worth asking.
 */
const refuse = (status: number, body: Refusal): Prepared => ({
  body,
  ready: null,
  record: body.error,
  status,
});

/**
 * A response the node does not keep: sent as-is, with nothing written to
 * `run_error`.
 *
 * A run that is skipped because its stored result is still current has
 * succeeded, and recording a reason against a node that is perfectly well would
 * be the opposite of what `record` is for.
 */
const reply = (status: number, body: Record<string, unknown>): Prepared => ({
  body,
  ready: null,
  record: null,
  status,
});

/**
 * What this node's settings and inputs come to, as the single value the stored
 * fingerprint is compared against.
 */
const fingerprintFor = (
  item: RunnableItem,
  values: Record<string, string[] | undefined>,
  elementWords: string[]
): Promise<string> =>
  inputFingerprint({
    // The wired elements' words count as settings for this purpose: they decide
    // what is sent, so a style corrected in the library has to make the nodes
    // using it stale or the correction would never reach a picture. Folded in
    // only when there is one, so no existing node's fingerprint moves and a
    // board full of finished work is not quietly offered up for re-running.
    config:
      elementWords.length > 0
        ? { ...item.config, element: elementWords }
        : item.config,
    // Joined per port: the fingerprint only has to change when the inputs do,
    // and a stable string does that as well as an array while keeping the
    // canonical form simple.
    inputs: Object.fromEntries(
      Object.entries(values).map(([key, list]) => [
        key,
        (list ?? []).join("\u0000"),
      ])
    ),
    nodeType: item.nodeType,
  });

/**
 * The refusal for a capability whose provider has no key, or null when there is
 * nothing in the way.
 *
 * A composite is assembled in the browser and merely stored here, so neither
 * provider needs to be configured for one to run — which is why this asks per
 * capability rather than checking both up front.
 */
const unconfiguredProvider = (capability: NodeCapability): Prepared | null => {
  if (capability === "fal.image" && !isFalConfigured()) {
    return refuse(503, {
      error:
        "Image generation is not configured. Set FAL_API_KEY on the project.",
    });
  }
  if (capability === "magnific.icon" && !isMagnificConfigured()) {
    return refuse(503, {
      error:
        "Icon generation is not configured. Set MAGNIFIC_API_KEY on the project.",
    });
  }
  return null;
};

/**
 * Everything that can refuse a run, in the order that costs least.
 *
 * Separated from the handler so each is one flat check rather than another
 * level of nesting, and so the order — cheapest and most certain first, the
 * expensive third-party call last — is visible at a glance.
 */
const prepare = async (
  rows: BoardItemRow[],
  wireRows: BoardWireRow[],
  itemId: string,
  force: boolean,
  models: readonly FalModelDef[]
): Promise<Prepared> => {
  const row = rows.find((candidate) => candidate.id === itemId);
  if (row?.kind !== "op" || !row.node_type) {
    // Not recorded: there is either no such row, or one that is not a node of
    // ours, and writing a run failure onto a photograph would be a worse lie
    // than the silence.
    return reply(404, { error: "Node not found on this board" });
  }

  const type = nodeTypeFor(row.node_type);
  if (!type) {
    return refuse(404, { error: "Unknown node type" });
  }
  // A Prompt node holds a value rather than producing one. Asking to run it is
  // a client bug, not a user error, so it is refused rather than quietly
  // succeeding as a no-op.
  if (!type.capability) {
    return refuse(422, {
      error: `A ${type.label} node holds its value; there is nothing to run.`,
    });
  }

  // Checked again here, not only on save: a graph that cannot be ordered cannot
  // be run, and finding that out before spending anything is free.
  if (hasCycle(toGraphItems(rows), toGraphWires(wireRows))) {
    return refuse(400, { error: "This board's connections form a loop." });
  }

  const item: RunnableItem = {
    config: asObject(row.config),
    id: row.id,
    nodeType: row.node_type,
    result: asObject(row.result),
    runState: row.run_state ?? null,
  };

  const { lists, missingPort, values } = resolveInputs(item, rows, wireRows);
  if (missingPort) {
    return refuse(422, {
      error: `This node needs its ${missingPort} input before it can run.`,
      missingPort,
    });
  }

  // An explicit model is checked against the loaded list rather than
  // forwarded: the value reaches fal, and an unknown id is a request that fails
  // after it has been paid for. An unrecognised choice falls back to "auto".
  const model = isFalModel(models, item.config.model)
    ? (item.config.model as string)
    : null;
  const shape = falModelInput(models, model ?? "auto");

  const prompt = promptFor(item, values);
  const elementWords = elementTextOf(item.id, rows, wireRows);

  const masks = maskByUrl(rows);
  const unmet = unmetRequirement(
    shape,
    model,
    // The composed prompt, so a node whose only words come from a wired element
    // is not refused for having none.
    withElementWords(prompt, elementWords),
    values,
    (values.image ?? []).some((url) => masks.has(url)),
    type.capability,
    models
  );
  if (unmet) {
    return refuse(422, unmet);
  }

  const unconfigured = unconfiguredProvider(type.capability);
  if (unconfigured) {
    return unconfigured;
  }

  // Every wired image becomes a job, each validated before being forwarded:
  // these URLs are handed to a third party to go and fetch.
  // Analyse is the exception. Its job is to look at a picture and write down
  // what it sees, so handing it words describing a style would be handing it
  // the answer to the question it was asked.
  const wordsForJobs = type.capability === "fal.describe" ? [] : elementWords;
  const { dropped, jobs } = validatedJobs(
    // Every job carries the wired elements' words, whether its prompt was typed
    // on the node or arrived down a wire. Applied here rather than inside
    // jobsFor because it is true of every prompt that function can produce, and
    // a Prompt node wired in alongside an element is the ordinary arrangement —
    // appending only to the typed fallback would drop the style in exactly the
    // case elements exist for.
    jobsFor(item, values, lists, shape, type.capability, prompt, masks).map(
      (job) => ({
        ...job,
        prompt: withElementWords(job.prompt, wordsForJobs),
      })
    )
  );
  // Refused only when nothing survived. A batch reduced to nothing has no work
  // left to do, whereas one that lost a single unusable address still has
  // nineteen pictures to get on with.
  if (jobs.length === 0) {
    return refuse(422, {
      error: "A wired image is not a public http(s) URL",
    });
  }

  // Nothing has changed since the stored result, so producing it again would
  // cost money to arrive at the same images. A batch is only skipped once every
  // variation is present — a run cancelled halfway resumes rather than being
  // treated as finished.
  const fingerprint = await fingerprintFor(item, values, elementWords);
  const stored = asObject(item.result);
  const done = Array.isArray(stored.variations)
    ? (stored.variations as unknown[]).filter(Boolean).length
    : 0;
  if (
    !force &&
    item.runState === "succeeded" &&
    stored.fingerprint === fingerprint &&
    done >= jobs.length
  ) {
    return reply(200, {
      itemId,
      result: item.result,
      runError: null,
      runState: "succeeded",
      skipped: true,
      skippedVectors: dropped,
      variationCount: jobs.length,
    });
  }

  return {
    body: null,
    ready: {
      capability: type.capability,
      fingerprint,
      item,
      jobs,
      model,
      prompt,
      skippedVectors: dropped,
      sourceImageUrls: values.image ?? [],
    },
    record: null,
    status: null,
  };
};

/**
 * What the request is asking for, or a reason it cannot be read.
 *
 * Pulled out of the handler because validating a request and performing one are
 * different jobs, and doing both in one function had grown past what a reader
 * can hold — the batching added a third thing to check.
 */
const readRequest = (
  req: VercelRequest
):
  | { boardId: string; force: boolean; itemId: string; variation: number }
  | string => {
  const raw = req.query.id;
  const boardId = Array.isArray(raw) ? raw[0] : raw;
  if (!boardId) {
    return "A board id is required";
  }
  const body = parseJsonBody(req.body);
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  if (!itemId) {
    return "An item id is required";
  }
  // Which variation of a batch to produce. One per request, because four
  // variations at two minutes each could no more fit in one function call than
  // a four-node chain could — the same ceiling, the same answer.
  const variation = Number.isFinite(Number(body.variation))
    ? Math.max(0, Math.trunc(Number(body.variation)))
    : 0;
  return { boardId, force: body.force === true, itemId, variation };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!getBearerUser(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const asked = readRequest(req);
  if (typeof asked === "string") {
    return res.status(400).json({ error: asked });
  }
  const { boardId, force, itemId, variation } = asked;

  const sql = getSql();

  try {
    const [rows, wireRows, models] = await Promise.all([
      loadItems(sql, boardId).then((items) => withElements(sql, items)),
      loadWires(sql, boardId),
      loadModelDefs(sql),
    ]);

    const prepared = await prepare(rows, wireRows, itemId, force, models);
    if (prepared.ready === null) {
      // Written before the response, so the node explains itself on reload and
      // a mis-wired board can be found by querying rather than by clicking.
      if (prepared.record) {
        await saveFailure(sql, itemId, prepared.record);
      }
      return res.status(prepared.status).json(prepared.body);
    }
    const {
      capability,
      fingerprint,
      item,
      jobs,
      model,
      prompt,
      skippedVectors,
      sourceImageUrls,
    } = prepared.ready;

    if (variation >= jobs.length) {
      const error = "That variation is past the end of this batch.";
      await saveFailure(sql, itemId, error);
      return res.status(422).json({ error });
    }

    await setRunning(sql, itemId);

    try {
      const produced = await produce(capability, models, {
        item,
        model,
        // Per variation, because an Iterate node upstream gives each run its
        // own prompt — the node's own text is only the fallback.
        prompt: jobs[variation]?.prompt ?? prompt,
        sourceImageUrl: jobs[variation]?.image ?? null,
        sourceImageUrls,
        sourceMaskUrl: jobs[variation]?.mask ?? null,
      });

      const previous = asObject(item.result);

      // Words rather than a picture: an Analyse node's whole output is its
      // text, so there is no batch, no history and nothing to pick between —
      // the variation machinery below simply does not apply to it.
      let result: Record<string, unknown>;
      if (produced.kind === "text") {
        result = {
          fingerprint,
          kind: "text",
          ranAt: new Date().toISOString(),
          text: produced.text,
        };
      } else {
        // Variations accumulate into one result rather than replacing it, so a
        // batch fills in as it goes and a part-finished run still shows what it
        // has. A stale array from an earlier, differently-shaped run is
        // discarded — the fingerprint moving is what says the old images no
        // longer belong.
        //
        // Sparse on purpose: a cancelled and resumed run can fill variation 3
        // before 1, so the gaps are real and the type says so.
        const kept: (Variation | undefined)[] =
          previous.fingerprint === fingerprint &&
          Array.isArray(previous.variations)
            ? (previous.variations as (Variation | undefined)[]).slice(
                0,
                jobs.length
              )
            : [];
        const variations: (Variation | undefined)[] = [...kept];
        variations[variation] = {
          description: produced.description,
          height: produced.height,
          isVector: produced.isVector,
          url: produced.url,
          width: produced.width,
        };
        result = buildImageResult(produced, variations, previous, fingerprint);
      }

      await sql`
        UPDATE board_items
        SET result = ${JSON.stringify(result)}::jsonb,
            run_state = 'succeeded',
            run_error = NULL
        WHERE id = ${itemId}
      `;

      return res.status(200).json({
        itemId,
        result,
        runError: null,
        runState: "succeeded",
        skipped: false,
        skippedVectors,
        variationCount: jobs.length,
      });
    } catch (e) {
      console.error(e);
      const message =
        e instanceof Error ? e.message : "Could not run this node";
      // Recorded, so the failure survives a reload and the node explains itself
      // rather than merely looking un-run.
      await saveFailure(sql, itemId, message);
      // The batch size travels with the error: a client whose *first* job just
      // failed still has to know how many jobs the run describes, or it cannot
      // continue with the rest of them.
      return res
        .status(502)
        .json({ error: message, variationCount: jobs.length });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not run this node" });
  }
}
