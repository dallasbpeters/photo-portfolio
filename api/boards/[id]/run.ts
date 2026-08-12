import type { VercelRequest, VercelResponse } from "@vercel/node";
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
import { parseJsonBody } from "../../_lib/parseBody.js";
import { getSite } from "../../_lib/site.js";

type Sql = ReturnType<typeof getSql>;

/** An explicit scheme, as api/ai/generate.ts requires for the same reason. */
const HTTP_SCHEME = /^https?:\/\//i;

const LINES = /\r?\n/;

/** A chain of Combine nodes longer than this is a mistake, not a design. */
const MAX_JOIN_DEPTH = 8;

/** Matches an SVG by extension, ignoring any query string. */
const SVG_URL = /\.svg(\?|$)/i;

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
   * send one colour at a time carries one per swatch), and running them all
   * together into a single field produced a suffix five colours long stuck on
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
  // sending one colour at a time carries a list, and the point of that list is
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
 * word {}" work with a list of colours and a list of words — replacing every
 * slot with the same value, which is what a naive replace does, produced "a
 * Brainstorm card with the word Brainstorm".
 *
 * Lists are read across rather than combined: four colours and five words give
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
 * and Ideogram v3 has the codes lifted back out into a real colour palette.
 */
/**
 * What a palette sends: one constraint, or one colour at a time.
 *
 * Sending them separately is what lets an Iterate node work through a palette —
 * a slot filled with each colour in turn, one image per colour — rather than
 * every colour being pressed into a single image.
 */
const paletteOutputsOf = (config: Record<string, unknown>): string[] => {
  if (config.output !== "one at a time") {
    const line = paletteTextOf(config);
    return line ? [line] : [];
  }
  const raw = typeof config.colors === "string" ? config.colors : "";
  const strict = config.strictness === "mostly" ? "predominantly" : "only";
  // Each colour as an instruction rather than as a bare code. "#5ccde9" on the
  // end of a prompt is a string a model has to guess the meaning of; "using
  // only this colour: #5ccde9" says what to do with it, and reads the same way
  // as the together form so switching between them changes the number of
  // prompts rather than their grammar.
  return (raw.match(HEX_COLOUR) ?? []).map(
    (hex) => `using ${strict} this colour: ${hex}`
  );
};

const paletteTextOf = (config: Record<string, unknown>): string | null => {
  const raw = typeof config.colors === "string" ? config.colors : "";
  const colours = raw.match(HEX_COLOUR);
  if (!colours || colours.length === 0) {
    return null;
  }
  const strict = config.strictness === "mostly" ? "predominantly" : "only";
  return `using ${strict} these colours: ${colours.join(", ")}`;
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
  // give five runs, each ending with the same colours.
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
 *
 * Both generators already copy their output into blob storage before returning,
 * so a result is durable by the time it reaches this function.
 */
const produce = async (
  capability: NodeCapability,
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

  const image = await generateImage(
    args.prompt,
    args.sourceImageUrl,
    args.model,
    args.sourceMaskUrl
  );
  return {
    description: image.description,
    height: image.height,
    // Taken from the model's own entry rather than guessed from the file: the
    // node shows a "came back as a raster" warning, and an SVG mislabelled as
    // raster would raise it for no reason.
    isVector: isVectorModel(args.model) ? true : null,
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
 * Why this model cannot run on this wiring, or null when it can.
 *
 * Checked here rather than left to fal, which only reports a mismatched body
 * after the call has been billed. Each model declares what it consumes, so an
 * unwired vectoriser or a promptless generation is refused for free.
 */
/**
 * Whether a wired image is vector art, which no fal image model can read.
 *
 * The trap is entirely of the app's own making: Recraft's two vector models and
 * the icon generator all *emit* SVG, so feeding one of those results into a
 * Generate node — the obvious next move — is a request that can only fail. It
 * fails differently for each model, too, from "Failed to load the image" to
 * "Could not generate images with the given prompts and images", neither of
 * which points at the actual problem.
 *
 * Refused here rather than at fal, because fal bills first.
 */
const vectorInputRefusal = (
  images: string[]
): Record<string, unknown> | null =>
  images.length > 0 && images.every((url) => SVG_URL.test(url))
    ? {
        error:
          "That is an SVG, and image models read pixels. Wire in a photo or a raster generation instead — or use Recraft · Vectorize if you meant to make vector art.",
        missingPort: "image",
      }
    : null;

/**
 * The wired images a raster model can actually read.
 *
 * Vectors are dropped from a batch rather than failing it. One wire out of a
 * frame carries everything on that frame, and a frame with twenty stickers and
 * one vectorised logo is a completely ordinary board — refusing the whole run
 * because one member cannot be read meant a frame could not be generated from
 * at all once anything had been vectorised into it.
 *
 * Never silent: the count comes back on the response as `skippedVectors` so the
 * canvas can say what did not run. A batch that quietly does nineteen of twenty
 * jobs is worse than one that fails.
 */
const rasterOnly = (images: string[]): string[] =>
  images.filter((url) => !SVG_URL.test(url));

/**
 * Removes the unreadable images from the resolved inputs, and says how many.
 *
 * Mutates `values` on purpose: every later step — the refusals, the job list,
 * the batch size — has to agree on what is actually runnable, and threading a
 * second copy through all of them would be a second thing to keep in step.
 *
 * Analyse is exempt. It reads pictures with a vision model rather than handing
 * them to an image model, and that reads an SVG perfectly well.
 */
const dropVectors = (
  values: Record<string, string[] | undefined>,
  capability: NodeCapability
): number => {
  const wired = values.image ?? [];
  if (capability === "fal.describe") {
    return 0;
  }
  const usable = rasterOnly(wired);
  values.image = usable;
  return wired.length - usable.length;
};

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
  masked: boolean
): Record<string, unknown> | null => {
  if (!masked || falModelMasks(model ?? "auto")) {
    return null;
  }
  const label = falModelFor(model)?.label ?? "This model";
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
  capability: NodeCapability
): Record<string, unknown> | null => {
  // A composite has no model and no prompt — its inputs are pictures, and the
  // required image port has already been checked by resolveInputs. Running it
  // through the model rules below would refuse it for lacking a prompt that it
  // has no field to type one into.
  if (capability === "board.composite") {
    return null;
  }
  // Every shape that consumes an image gets the same check, before any of the
  // per-shape rules below.
  const vector = vectorInputRefusal(values.image ?? []);
  if (vector && shape !== "prompt") {
    return vector;
  }
  const mask = maskRefusal(model, masked);
  if (mask) {
    return mask;
  }
  if (shape === "prompt-and-image") {
    // Both, so both are checked before anything is spent.
    if ((values.image?.length ?? 0) === 0) {
      const label = falModelFor(model)?.label ?? "This model";
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
      const label = falModelFor(model)?.label ?? "This model";
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
const validatedJobs = (raw: Job[]): Job[] | null => {
  const jobs: Job[] = [];
  for (const job of raw) {
    if (job.image === null) {
      jobs.push(job);
      continue;
    }
    const url = HTTP_SCHEME.test(job.image)
      ? parsePublicHttpUrl(job.image)
      : null;
    if (!url) {
      return null;
    }
    jobs.push({ ...job, image: url });
  }
  return jobs;
};

/** Either a response to send as-is, or everything the run needs. */
type Prepared =
  | { body: Record<string, unknown>; ready: null; status: number }
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
        /** Wired images a raster model could not read, and so did not run. */
        skippedVectors: number;
        /** Every wired image, for the capability that reads them together. */
        sourceImageUrls: string[];
      };
      status: null;
    };

const refuse = (status: number, body: Record<string, unknown>): Prepared => ({
  body,
  ready: null,
  status,
});

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
  force: boolean
): Promise<Prepared> => {
  const row = rows.find((candidate) => candidate.id === itemId);
  if (row?.kind !== "op" || !row.node_type) {
    return refuse(404, { error: "Node not found on this board" });
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

  // An explicit model is checked against the allowlist rather than forwarded:
  // the value reaches fal, and an unknown id is a request that fails after it
  // has been paid for. An unrecognised choice falls back to "auto".
  const model = isFalModel(item.config.model)
    ? (item.config.model as string)
    : null;
  const shape = falModelInput(model ?? "auto");

  const prompt = promptFor(item, values);

  // Vectors are dropped here, once, so everything downstream — the refusals,
  // the job list, the batch size — agrees on what is actually runnable.
  const skippedVectors = dropVectors(values, type.capability);

  const masks = maskByUrl(rows);
  const unmet = unmetRequirement(
    shape,
    model,
    prompt,
    values,
    (values.image ?? []).some((url) => masks.has(url)),
    type.capability
  );
  if (unmet) {
    return refuse(422, unmet);
  }

  // A composite is assembled in the browser and merely stored here, so neither
  // provider needs to be configured for one to run.
  const needsFal = type.capability === "fal.image";
  const needsMagnific = type.capability === "magnific.icon";
  if (needsFal && !isFalConfigured()) {
    return refuse(503, {
      error:
        "Image generation is not configured. Set FAL_API_KEY on the project.",
    });
  }
  if (needsMagnific && !isMagnificConfigured()) {
    return refuse(503, {
      error:
        "Icon generation is not configured. Set MAGNIFIC_API_KEY on the project.",
    });
  }

  // Every wired image becomes a job, each validated before being forwarded:
  // these URLs are handed to a third party to go and fetch.
  const jobs = validatedJobs(
    jobsFor(item, values, lists, shape, type.capability, prompt, masks)
  );
  if (jobs === null) {
    return refuse(422, {
      error: "A wired image is not a public http(s) URL",
    });
  }

  // Nothing has changed since the stored result, so producing it again would
  // cost money to arrive at the same images. A batch is only skipped once every
  // variation is present — a run cancelled halfway resumes rather than being
  // treated as finished.
  const fingerprint = await inputFingerprint({
    config: item.config,
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
    return refuse(200, {
      itemId,
      result: item.result,
      runError: null,
      runState: "succeeded",
      skipped: true,
      skippedVectors,
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
      skippedVectors,
      sourceImageUrls: values.image ?? [],
    },
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
    const [rows, wireRows] = await Promise.all([
      loadItems(sql, boardId),
      loadWires(sql, boardId),
    ]);

    const prepared = await prepare(rows, wireRows, itemId, force);
    if (prepared.ready === null) {
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
      return res
        .status(422)
        .json({ error: "That variation is past the end of this batch." });
    }

    await setRunning(sql, itemId);

    try {
      const produced = await produce(capability, {
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
      return res.status(502).json({ error: message });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not run this node" });
  }
}
