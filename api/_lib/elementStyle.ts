import type { FalModelInput } from "../../config/falModels.js";
import { MAX_BATCH_COUNT } from "../../config/nodes/limits.js";
import type { NodeCapability } from "../../config/nodeTypes.js";
import type { BoardItemRow, BoardWireRow } from "./boards.js";

/**
 * What a wired Element contributes to a run, and how that shapes the jobs.
 *
 * An element is a style: a handful of references that share a look plus the
 * words for what they share. Wired into a Generate node it is not another thing
 * to draw — it is *how* to draw whatever else is wired in. That distinction is
 * the whole of this file.
 *
 * It used to be lost. An element's cover arrived on the image port looking like
 * any other picture, and every wired image became its own job, so an element
 * plus your photograph was two unrelated generations rather than one restyling
 * — and you paid for both. The rule now is that element-sourced pictures are
 * references attached to a job, never subjects of one.
 *
 * Kept out of api/boards/[id]/run.ts and free of anything that touches the
 * database or the network, so the rules below can be tested. They are the kind
 * that fail silently: a style reference that is quietly dropped bills in full
 * and looks exactly like a style that did not take.
 */

export interface ElementStyle {
  /** How the model reads each wired element's style, in wire order, deduped. */
  briefs: string[];
  /**
   * Each wired element's cover.
   *
   * Not sent at all. It arrives on the image port like any other picture and
   * has to be taken back out — an element is a style, and a style is never the
   * subject. Kept here so both the job builder and the refusal check can
   * subtract it from what was wired.
   */
  images: string[];
  /** Each wired element's description, in wire order, deduped. */
  words: string[];
}

const asObject = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * The pictures and words every element wired into this node carries.
 *
 * An element node's only output port is an image, so neither its description
 * nor the rest of its pictures arrive through `resolveInputs` — a second and
 * third port would mean three wires for one thing. They are read off the wires
 * instead, from what `withElements` folded onto the row, so everything the
 * library holds travels with the picture it hands over rather than being left
 * behind on the canvas.
 */
export const elementStyleOf = (
  itemId: string,
  rows: BoardItemRow[],
  wires: BoardWireRow[]
): ElementStyle => {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const briefs: string[] = [];
  const images: string[] = [];
  const words: string[] = [];
  // The element this node's prompt was already written from, set when the node
  // was pulled off that element's port. Its words are in the prompt field where
  // the author can see and edit them, so saying them again would state the
  // style twice — and because the words here come from the live library row
  // while the prompt was written from the copy on the node, an element edited
  // since would have the model told two different things.
  const alreadySaid = asObject(byId.get(itemId)?.config).styleFrom;

  for (const wire of wires) {
    if (wire.target_item_id !== itemId) {
      continue;
    }
    const source = byId.get(wire.source_item_id);
    if (source?.node_type !== "element") {
      continue;
    }
    const written =
      typeof alreadySaid === "string" &&
      asObject(source.config).elementId === alreadySaid;
    const said = written ? undefined : source.body?.trim();
    // The same element wired in twice says the same thing twice, which reads to
    // a model as emphasis nobody asked for.
    if (said && !words.includes(said)) {
      words.push(said);
    }
    // How the model reads this style, written by `withElements`. Never
    // suppressed by `styleFrom`: unlike the description it is not in the prompt
    // field, so there is no copy of it for the author to have already seen.
    const brief = textOf(asObject(source.config).styleBrief);
    if (brief && !briefs.includes(brief)) {
      briefs.push(brief);
    }
    // The cover alone: it is the picture the node shows and the one that stands
    // in as the subject when an element is wired in on its own.
    const cover = source.image_url;
    if (cover && !images.includes(cover)) {
      images.push(cover);
    }
  }

  return { briefs, images, words };
};

/** A trimmed string, or "" for anything that is not one. */
const textOf = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/** Case and spacing are not meaning, so neither decides whether words repeat. */
const flattened = (text: string): string =>
  text.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * A prompt with the wired elements' words after it, each said once.
 *
 * Appended rather than substituted: an element says how a picture should look,
 * while what to draw stays whatever was typed. Joined with the separator a Join
 * node defaults to, because a prompt is a list of phrases.
 *
 * Words already in the prompt are not appended again. The canvas pre-fills a
 * new node's prompt with the element's description — helpfully, so it can be
 * edited — and appending it a second time would send the whole style twice,
 * which a model reads as emphasis and which no one typed.
 */
export const withElementWords = (prompt: string, words: string[]): string => {
  const base = prompt.trim();
  const said = flattened(base);
  const extra = words.filter((part) => {
    const phrase = flattened(part);
    return phrase.length > 0 && !said.includes(phrase);
  });
  return [base, ...extra].filter((part) => part.length > 0).join(", ");
};

/** One run: which image it reworks, which mask confines it, which prompt. */
export interface Job {
  image: string | null;
  /** The rendered mask belonging to `image`, when that picture carries one. */
  mask: string | null;
  prompt: string;
}

export interface JobShape {
  /** How the vision model read each wired element. See elementStyleOf. */
  briefs: string[];
  capability: NodeCapability;
  /** The node's own settings — `count` is the only one read here. */
  config: Record<string, unknown>;
  /** Every wired element's cover, to be taken back out. See elementStyleOf. */
  elementImages: string[];
  /** Each prompt-port value grouped by the wire it arrived on. */
  lists: Record<string, string[][] | undefined>;
  /** Rendered mask for each masked picture, keyed by its image URL. */
  masks: Map<string, string>;
  /** What the chosen model consumes. A prompt-only model takes no pictures. */
  shape: FalModelInput;
  typedPrompt: string;
  /** Every value wired to each port, in wire order. */
  values: Record<string, string[] | undefined>;
}

/**
 * How many runs this node's settings and wiring describe, and what each sends.
 *
 * One per wired *subject*, times the variation count — so three subjects at two
 * variations is six. An element's pictures are deliberately not subjects: they
 * ride along with every job as references, so wiring a style in costs nothing
 * extra and changes what comes back rather than how much of it does.
 *
 * With nothing but an element wired in there is no subject, and none is
 * invented: the run generates from the prompt with the style read into it. Its
 * cover used to stand in as the subject, which meant an element on its own
 * produced a copy of its own cover — the style applied to itself. An element is
 * a look to work in, not a picture to rework.
 */
/**
 * The prompt text a node holds itself.
 *
 * A Prompt node keeps it under `text`, Generate and Icon under `prompt` — both
 * are read so either can contribute, the same pair promptFor looks at.
 */
const typedTextOf = (config: Record<string, unknown>): string => {
  const held = config.prompt ?? config.text;
  return typeof held === "string" ? held.trim() : "";
};

export const jobsFor = ({
  capability,
  config,
  lists,
  briefs,
  elementImages,
  masks,
  shape,
  typedPrompt,
  values,
}: JobShape): Job[] => {
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
    // Reading a picture back as words is not affected by a mask, and an element
    // wired into Analyse is a picture to read rather than a style to apply.
    return [
      {
        image: values.image?.[0] ?? null,
        mask: null,
        prompt: typedPrompt,
      },
    ];
  }
  const raw = Number(config.count);
  const count = Number.isFinite(raw)
    ? Math.min(Math.max(Math.trunc(raw), 1), MAX_BATCH_COUNT)
    : 1;
  // A prompt-only model has no use for wired images, so fanning out over them
  // would bill the same prompt several times for identical results — and it has
  // nowhere to put a style reference either.
  const wiredImages = shape === "prompt" ? [] : (values.image ?? []);
  const covers = shape === "prompt" ? [] : elementImages;
  // An element's cover arrives on the image port like any other picture. It is
  // taken back out here: what remains is what the user wired in themselves, and
  // that is what a job is *of*. The style travels as words now, so the cover
  // has no reason to be sent — and sending it was what made a restyle come back
  // looking like the element instead of like the subject.
  const fromElements = new Set(covers);
  const subjects = wiredImages.filter((url) => !fromElements.has(url));
  // No subject means no picture, not the cover standing in for one. Handed the
  // cover, an edit model does the only thing it can with a single image and
  // reproduces it — which is what "the model just recreates the cover" was.
  // With nothing to rework, a model that can generate from words does that, and
  // one that cannot is refused before it is billed.
  const images: (string | null)[] =
    subjects.length === 0 ? [null] : [...subjects];
  // One wire carrying several prompts is an Iterate node: each is its own run.
  // Several wires are several *parts* of each run — a subject and a palette,
  // say — so they are joined. Both at once: five subjects and one palette line
  // give five runs, each ending with the same colors.
  const promptWires =
    (values.prompt ?? []).length > 0 ? (lists.prompt ?? []) : [];
  const rows = promptWires.length
    ? Math.max(...promptWires.map((list) => list.length))
    : 0;
  /*
   * The text typed on the node is a part too, not a fallback.
   *
   * It used to be dropped the moment anything was wired to the prompt port, on
   * the reasoning that wiring is the more deliberate act. A Brand node broke
   * that: a brand is a *modifier* — "using only these colors: …" — so wiring one
   * in left the node unable to say what the picture was of, and the field on its
   * face was disabled to match. The port is `arity: "many"` precisely so parts
   * combine; the typed text is simply the first of them.
   *
   * Read from the config rather than from `typedPrompt`, which is promptFor's
   * answer and is already the wired value whenever there is one.
   */
  const typed = typedTextOf(config);
  const prompts =
    rows > 0
      ? Array.from({ length: rows }, (_, row) =>
          [typed, ...promptWires.map((list) => list[row % list.length] ?? "")]
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
        // The style is said, not shown. `briefs` is how the vision model read
        // the element's pictures, so this is the one place the look actually
        // reaches an endpoint that has room for a single image.
        prompt: withElementWords(prompt, shape === "prompt" ? [] : briefs),
      }))
    )
  );
};

/**
 * What a brief was derived from.
 *
 * The inputs themselves rather than a digest of them: it is compared, never
 * parsed, and a hash here would trade a column a few hundred bytes wider for
 * the chance of two different styles agreeing that neither has changed.
 *
 * Order matters — re-ordering an element's pictures changes which one leads,
 * and the cover is what the brief is anchored on.
 */
export const styleBriefKey = (
  description: string,
  imageUrls: string[]
): string => JSON.stringify([description.trim(), imageUrls]);
