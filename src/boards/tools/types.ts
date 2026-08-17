/**
 * What a tool is, and what running one means.
 *
 * The contextual bar, the right-click menu and a chat's slash commands are
 * three ways of saying the same sentence: *run this tool on this item*. They
 * differ only in how the tool is picked and how its settings are filled in, so
 * the sentence is defined once, here, and each surface is a way of composing a
 * `ToolInvocation` and rendering a `ToolOutcome`.
 *
 * Deliberately dependency-free of React and of the canvas. A tool is data; an
 * executor is an async function. Neither knows a bar exists.
 *
 * ## Relationship to config/nodeTypes.ts
 *
 * `NODE_TYPES` is already a declarative registry of operations, and this is not
 * a rival to it. A node type describes an operation *wired into a graph*: it
 * has typed input ports, an arity per port, and a `capability` naming the
 * server-side generator a board run dispatches to. A tool describes the same
 * kind of operation *applied directly to a selected item*, where there are no
 * ports because the item itself is the input.
 *
 * What is genuinely shared is the settings shape, so `SettingDef` is imported
 * from there rather than restated. A tool's settings render with the same
 * controls the node inspector already draws, including `kind: "model"`, which
 * reads its options from the `models` table through ModelsProvider.
 */

import type { SettingDef } from "../../../config/nodeTypes.js";
import type {
  BoardItem,
  BoardItemKind,
  BoardItemResult,
  BoardItemVariation,
} from "../../types.js";

export type { SettingDef } from "../../../config/nodeTypes.js";

/**
 * The tool panel's tabs, exactly.
 *
 * "All / AI / Transform" is `group` filtering and nothing else, so a new tab
 * would be a new member here rather than a new predicate somewhere.
 */
export type ToolGroup = "transform" | "ai";

export const TOOL_GROUPS: readonly ToolGroup[] = ["transform", "ai"];

/**
 * Which executor runs a tool.
 *
 * An id rather than a function reference, so the registry stays pure data that
 * a test can import without dragging in `fetch`, a canvas, or the whole API
 * client. `resolveExecutor` in ./executors turns the id into the function at
 * the point of invocation. It also makes a tool serialisable, which is what a
 * chat transcript recording "you ran rotate-right" needs.
 */
export type ToolExecutorId = "transform" | "ai";

export const TOOL_EXECUTOR_IDS: readonly ToolExecutorId[] = ["transform", "ai"];

/**
 * Whether a tool actually does anything yet.
 *
 * Registered-but-unimplemented tools are listed on purpose: the panel shows
 * what is coming, and a tool that is merely declared can be moved to "ready"
 * without touching any invocation surface. A "planned" tool must still fail
 * cleanly when run — see the `unsupported` failure code.
 */
export type ToolStatus = "ready" | "planned";

export interface Tool {
  /**
   * Which item kinds this tool applies to.
   *
   * The bar shows only the tools whose `appliesTo` contains the selected
   * item's kind, which is why an empty bar is impossible rather than merely
   * unlikely: every kind has at least one tool.
   */
  appliesTo: readonly BoardItemKind[];
  /**
   * A sentence, not a tooltip. The tool panel searches label *and* description,
   * so this is where the words someone would actually type belong — "make it
   * bigger", "square", "get rid of".
   */
  description: string;
  executor: ToolExecutorId;
  /**
   * Which tab the tool appears under.
   *
   * Kept separate from `executor` even though the two happen to agree today.
   * `group` is what the tool *is* to whoever is picking it; `executor` is where
   * the work runs. A background-removal tool is an AI tool that may well run
   * locally in a worker, and a sharp-based resize is a transform that runs on
   * the server — collapsing the two fields would force one of those to lie.
   */
  group: ToolGroup;
  /**
   * Stable and permanent. It is written into history entries, typed as a slash
   * command in chat, and stored in a board's undo stack, so renaming one
   * orphans all three.
   */
  id: string;
  /**
   * Search terms that are not in the label or description.
   *
   * Only for genuine synonyms — "inpaint" for a tool labelled "Replace". Not a
   * dumping ground; a term that belongs in the description belongs there.
   */
  keywords: readonly string[];
  /** Shown on the bar and in the menu. Short enough to sit under an icon. */
  label: string;
  /**
   * The tool cannot run without a painted mask on the item.
   *
   * The bar disables rather than hides these, because "why can't I click it"
   * is answered by the disabled reason and unanswerable by an absence. See
   * `maskRefusal` in api/boards/[id]/run.ts for why a mask silently dropped is
   * the worst of the three options.
   */
  needsMask: boolean;
  /** The tool cannot run without words. Every generative tool needs them. */
  needsPrompt: boolean;
  /**
   * The tool's own configuration, in the shape the node inspector already
   * renders. Values are collected into `ToolInvocation.config`.
   */
  settings: readonly SettingDef[];
  status: ToolStatus;
}

/**
 * Running a tool on an item, from whichever surface picked it.
 *
 * One signature for the right-click menu, the contextual bar and anything
 * later, so a surface is a way of *composing* this call rather than a variant
 * of it. `prompt` is the words collected at the moment of picking — see
 * ToolPrompt — and takes precedence over whatever the item already carries,
 * which is what makes "type something else here" mean anything.
 */
export type RunTool = (
  item: BoardItem,
  tool: Tool,
  prompt?: string,
  /**
   * Settings the surface collected — a model, so far.
   *
   * Merged over the registry's defaults by the runner, so a surface that offers
   * none behaves exactly as it did before there was anything to offer.
   */
  config?: Readonly<Record<string, unknown>>
) => void;

// ── Invocation ───────────────────────────────────────────────────────────────

/**
 * What a tool is being run against.
 *
 * `item` is read-only and stays that way: an executor returns a description of
 * what to add, never a mutated item. That is the whole non-destructive
 * guarantee, and making the input `Readonly` is what stops it being lost by
 * accident.
 */
export interface ToolTarget {
  /**
   * The board the item sits on, or null when the tool is running somewhere
   * that has no board (a preview, a test). The AI executor does not need it —
   * /api/ai/generate is a one-shot call, not a graph run — but a future
   * executor that persists straight to the server does.
   */
  boardId: string | null;
  item: Readonly<BoardItem>;
}

/**
 * How far along a run is.
 *
 * A generation is tens of seconds and a local transform on a 40-megapixel file
 * is not instant either, so every executor reports progress rather than only
 * some. `fraction` is null when the step genuinely has no measurable extent —
 * waiting on a model is not a progress bar, and a fake one that creeps to 90%
 * and stops is worse than a spinner.
 */
export interface ToolProgress {
  fraction: number | null;
  /** One short clause, shown under the bar. "Rotating…", "Waiting on the model…" */
  message: string;
  phase: ToolPhase;
}

/**
 * The three phases every tool has, whether it is local or remote.
 *
 * "storing" is not an implementation detail worth hiding: a local rotate is
 * instant and then spends a second uploading, and without the phase that reads
 * as the rotate itself being slow.
 */
export type ToolPhase = "preparing" | "running" | "storing";

/**
 * Why a run did not produce anything.
 *
 * Coded as well as worded because the surfaces act on them differently: the
 * bar re-enables itself and says nothing on "cancelled", offers a retry on
 * "network", and points at the missing input on "missing-input".
 */
export type ToolFailureCode =
  /** The caller aborted, or the user pressed escape. Not an error to report. */
  | "cancelled"
  /** The request never reached the service, or the connection died. Retryable. */
  | "network"
  /** A required input is absent: no prompt, no mask, no image on the item. */
  | "missing-input"
  /** The service was reached and refused, or produced nothing. */
  | "service"
  /** This tool cannot run on this target at all, and retrying will not help. */
  | "unsupported"
  /** A bug on our side. The one code that is not the user's problem. */
  | "internal";

export interface ToolFailure {
  /** The original error, kept for the console. Never shown. */
  cause?: unknown;
  code: ToolFailureCode;
  /**
   * What to do next, when there is something to do. "Paint a mask first."
   * Omitted rather than padded — an empty suggestion is noise on a red banner.
   */
  hint?: string;
  /**
   * One sentence, in the second person, naming what went wrong in terms the
   * person reading it can act on. Not "Error 502". Not a stack.
   */
  message: string;
}

export interface ToolInvocation {
  /**
   * Settings by key, with the registry's defaults already applied — an
   * executor reads `config.degrees` and never has to know what the default
   * was. See `withDefaults` in ./registry.
   */
  config: Readonly<Record<string, unknown>>;
  /**
   * The rendered mask bitmap's URL, when the item carries a mask.
   *
   * A URL rather than a `MaskConfig`, because rasterising and uploading is
   * already done elsewhere (see flushBeforeRun in BoardEditor) and a run is the
   * first moment the mask has to exist as a picture. Null when there is none.
   */
  maskUrl: string | null;
  onProgress?: (progress: ToolProgress) => void;
  /** The words, already trimmed. Null when the tool does not take any. */
  prompt: string | null;
  /** Aborts the run. Executors report `cancelled` rather than throwing. */
  signal?: AbortSignal;
  target: ToolTarget;
  tool: Tool;
}

// ── Outcome ──────────────────────────────────────────────────────────────────

/**
 * What a successful run produced.
 *
 * Note what is *not* here: a mutated `BoardItem`. An executor produces a new
 * variation and a new `BoardItemResult` with that variation appended, and the
 * caller decides where to put it. The item it was handed is untouched, so the
 * original is recoverable by definition rather than by convention — see
 * ./history.
 */
export interface ToolSuccess {
  /** Wall-clock, for "took 34s" and for spotting a tool that has got slow. */
  durationMs: number;
  ok: true;
  ranAt: string;
  /**
   * The item's result with `variation` appended to `history`.
   *
   * The previous result is not modified: this is a new object, and the old
   * one's `history` array is copied rather than pushed onto.
   */
  result: BoardItemResult;
  /** Which tool made this, so the history strip can label the entry. */
  toolId: string;
  /** The single new image. `result.history` ends with it. */
  variation: BoardItemVariation;
}

export interface ToolFailed {
  failure: ToolFailure;
  ok: false;
}

export type ToolOutcome = ToolSuccess | ToolFailed;

/**
 * The one interface every tool runs through.
 *
 * **An executor never throws and never rejects.** Every failure comes back as
 * `{ ok: false, failure }` with a code and a sentence. Three surfaces will call
 * this, and a contract where some errors are return values and others are
 * exceptions means each of them grows its own try/catch that eventually
 * disagrees with the others about what a caught thing looks like.
 */
export type ToolExecutor = (invocation: ToolInvocation) => Promise<ToolOutcome>;

/** Narrowing helper, so surfaces do not test `"ok" in outcome`. */
export const succeeded = (outcome: ToolOutcome): outcome is ToolSuccess =>
  outcome.ok;

/** Builds a failure outcome. Executors use it instead of constructing objects. */
export const failed = (
  code: ToolFailureCode,
  message: string,
  extra: { cause?: unknown; hint?: string } = {}
): ToolFailed => ({
  failure: {
    code,
    message,
    ...(extra.hint === undefined ? {} : { hint: extra.hint }),
    ...(extra.cause === undefined ? {} : { cause: extra.cause }),
  },
  ok: false,
});
