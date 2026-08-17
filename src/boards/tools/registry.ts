/**
 * Every tool, once.
 *
 * The bar, the right-click menu and a chat's slash commands all read this list.
 * They differ in how they present it and in nothing else, so a tool added here
 * appears in all three without any of them being edited — which is the only
 * reason a registry is worth having over three hand-written menus.
 *
 * Pure data plus lookups. It imports no executor, because the executors import
 * `fetch`, a canvas and the API client, and a registry that could not be read
 * without those would drag the whole app into a test that only wants to check
 * a search returns two things.
 */

import type { BoardItemKind } from "../../types.js";
import type { SettingDef, Tool, ToolGroup } from "./types.js";

/** Item kinds a tool can be pointed at. Written out so a `photo`-only tool is obvious. */
const IMAGE_KINDS: readonly BoardItemKind[] = [
  "photo",
  "reference",
  "op",
  "drawing",
];

/** Matches MAX_PROMPT in api/ai/generate.ts, which truncates past it silently. */
const PROMPT_MAX = 1200;

/**
 * The model an AI tool runs on, chosen rather than assumed.
 *
 * `/api/ai/generate` used a constant — nano-banana/edit for anything with a
 * picture — so there was no way to reach the four other endpoints in the models
 * table that also edit, and no sign one existed. "auto" keeps the old behaviour
 * as the default, so a tool run without touching this behaves exactly as it did.
 *
 * `video: false` because these edit pictures: the control offers the rows whose
 * output is an image, and a video endpoint handed an edit request fails after it
 * has been billed.
 */
const MODEL_SETTING: SettingDef = {
  default: "auto",
  key: "model",
  kind: "model",
  label: "Model",
  video: false,
};

const PROMPT_SETTING: SettingDef = {
  key: "prompt",
  kind: "text",
  label: "Prompt",
  maxLength: PROMPT_MAX,
  placeholder: "Describe the change…",
};

/**
 * Rotation is two tools rather than one with a direction setting.
 *
 * A bar wants two buttons, and a button that opens a dropdown to choose
 * "left" before doing the obvious thing is worse than two buttons. They share
 * an implementation; only the `degrees` default differs.
 */
const rotateTool = (id: string, label: string, degrees: number): Tool => ({
  appliesTo: IMAGE_KINDS,
  description: `Turn the image a quarter turn ${degrees > 0 ? "clockwise" : "anticlockwise"}.`,
  executor: "transform",
  group: "transform",
  id,
  keywords: ["rotate", "turn", "orientation", "sideways"],
  label,
  needsMask: false,
  needsPrompt: false,
  settings: [
    {
      default: degrees,
      key: "degrees",
      kind: "number",
      label: "Degrees",
      max: 360,
      min: -360,
    },
  ],
  status: "ready",
});

/**
 * The list.
 *
 * `status: "planned"` entries are registered deliberately. They are what the
 * panel shows as coming, they reserve their ids before anything stores one,
 * and moving one to "ready" is a change in this file and its executor and
 * nowhere else. A planned tool still fails cleanly when run — see the
 * executors' `unsupported` branches.
 */
export const TOOLS: readonly Tool[] = [
  rotateTool("rotate-right", "Rotate right", 90),
  rotateTool("rotate-left", "Rotate left", -90),
  {
    appliesTo: IMAGE_KINDS,
    description: "Mirror the image left to right.",
    executor: "transform",
    group: "transform",
    id: "flip-horizontal",
    keywords: ["mirror", "reverse", "flop"],
    label: "Flip",
    needsMask: false,
    needsPrompt: false,
    settings: [],
    status: "planned",
  },
  {
    appliesTo: IMAGE_KINDS,
    description: "Trim the image to a rectangle or a fixed aspect ratio.",
    executor: "transform",
    group: "transform",
    id: "crop",
    keywords: ["trim", "square", "aspect", "frame", "cut"],
    label: "Crop",
    needsMask: false,
    needsPrompt: false,
    settings: [
      {
        default: "free",
        key: "aspect",
        kind: "select",
        label: "Aspect",
        options: ["free", "1:1", "4:5", "3:2", "16:9"],
      },
    ],
    status: "planned",
  },
  {
    appliesTo: IMAGE_KINDS,
    description:
      "Describe a change in words and make a new version of this image.",
    executor: "ai",
    group: "ai",
    id: "edit-image",
    keywords: ["edit", "change", "vary", "variation", "redo", "generate"],
    label: "Edit",
    needsMask: false,
    needsPrompt: true,
    settings: [PROMPT_SETTING, MODEL_SETTING],
    status: "ready",
  },
  {
    appliesTo: ["note", "text", "frame", ...IMAGE_KINDS],
    description: "Invent a new image from a description.",
    executor: "ai",
    group: "ai",
    id: "generate-image",
    keywords: ["make", "create", "imagine", "new", "generate"],
    label: "Generate",
    needsMask: false,
    needsPrompt: true,
    settings: [
      { ...PROMPT_SETTING, placeholder: "Describe the image…" },
      MODEL_SETTING,
    ],
    status: "ready",
  },
  {
    appliesTo: IMAGE_KINDS,
    /*
     * Planned, and blocked on the API rather than on the executor.
     *
     * api/_lib/fal.ts already routes a mask to FLUX_INPAINT_ENDPOINT, but
     * /api/ai/generate takes only { prompt, sourceImageUrl } and has no
     * maskUrl to forward. Sending one anyway would be silently dropped, the
     * whole picture repainted, and the bill paid — the exact failure
     * `maskRefusal` in the run endpoint exists to prevent.
     */
    description: "Paint over part of the image and describe what goes there.",
    executor: "ai",
    group: "ai",
    id: "replace-area",
    keywords: ["inpaint", "mask", "remove", "erase", "swap", "fill"],
    label: "Replace",
    needsMask: true,
    needsPrompt: true,
    settings: [
      { ...PROMPT_SETTING, placeholder: "What should be there instead?" },
    ],
    status: "planned",
  },
  {
    appliesTo: IMAGE_KINDS,
    description: "Re-render this image in a chosen style or model.",
    executor: "ai",
    group: "ai",
    id: "restyle",
    keywords: ["style", "lora", "look", "model", "filter"],
    label: "Restyle",
    needsMask: false,
    needsPrompt: false,
    settings: [
      // Where a LoRA is chosen: the table's style rows are models as far as fal
      // is concerned, and that is how they reach the endpoint now that it
      // forwards one. The prompt is optional, so a restyle can be the style
      // alone or the style plus a note about what to keep.
      { ...PROMPT_SETTING, placeholder: "Anything to keep or change…" },
      { default: "auto", key: "model", kind: "model", label: "Style" },
    ],
    status: "ready",
  },

  /*
   * Two tools that take a picture and nothing else.
   *
   * Their models' `input` is "image", which is why they could not exist until
   * /api/ai/generate stopped demanding a prompt: there was nothing to type, and
   * whatever was typed to get past the check was sent to a model that ignores
   * it. The model is fixed rather than chosen — asking which background remover
   * to use is a question about our plumbing, not about the picture.
   */
  {
    appliesTo: IMAGE_KINDS,
    description: "Cut the subject out, leaving a transparent background.",
    executor: "ai",
    group: "ai",
    id: "remove-background",
    keywords: ["cutout", "cut out", "transparent", "isolate", "rembg", "matte"],
    label: "Remove background",
    needsMask: false,
    needsPrompt: false,
    settings: [
      {
        default: "fal-ai/birefnet/v2",
        key: "model",
        kind: "model",
        label: "Model",
      },
    ],
    status: "ready",
  },
  {
    appliesTo: IMAGE_KINDS,
    description: "Trace this image into vector art.",
    executor: "ai",
    group: "ai",
    id: "vectorize",
    keywords: ["svg", "vector", "trace", "outline", "recraft"],
    label: "Vectorize",
    needsMask: false,
    needsPrompt: false,
    settings: [
      {
        default: "fal-ai/recraft/vectorize",
        key: "model",
        kind: "model",
        label: "Model",
      },
    ],
    status: "ready",
  },
  {
    appliesTo: IMAGE_KINDS,
    description: "Read the image back as words, for a prompt or for alt text.",
    executor: "ai",
    group: "ai",
    id: "describe",
    keywords: ["caption", "alt", "read", "analyse", "analyze", "words"],
    label: "Describe",
    needsMask: false,
    needsPrompt: false,
    settings: [],
    status: "planned",
  },
];

const BY_ID: ReadonlyMap<string, Tool> = new Map(
  TOOLS.map((tool) => [tool.id, tool])
);

/** The tool with this id, or null. Null rather than throwing: a stored id can
 * outlive the tool it named, and a chat can be typed at with anything. */
export const toolById = (id: string): Tool | null => BY_ID.get(id) ?? null;

export const listTools = (): readonly Tool[] => TOOLS;

/** The All / AI / Transform tabs. Pass null for All. */
export const toolsInGroup = (group: ToolGroup | null): readonly Tool[] =>
  group === null ? TOOLS : TOOLS.filter((tool) => tool.group === group);

/** Only the tools that can be pointed at this kind of item. */
export const toolsForKind = (kind: BoardItemKind): readonly Tool[] =>
  TOOLS.filter((tool) => tool.appliesTo.includes(kind));

const normalize = (value: string): string => value.trim().toLowerCase();

/** Splits a query into terms on any run of whitespace. */
const WHITESPACE = /\s+/;

/**
 * Free-text search over label, description and keywords.
 *
 * Every whitespace-separated term must match somewhere, so typing more words
 * narrows rather than widens — "rotate left" finds one tool, not both rotates
 * plus everything else with "left" in it. Substring rather than prefix,
 * because "paint" should find "inpaint".
 *
 * An empty query returns everything, so a panel can render `search(input)`
 * unconditionally instead of branching on whether anything has been typed.
 */
export const searchTools = (
  query: string,
  group: ToolGroup | null = null
): readonly Tool[] => {
  const pool = toolsInGroup(group);
  const terms = normalize(query).split(WHITESPACE).filter(Boolean);
  if (terms.length === 0) {
    return pool;
  }
  return pool.filter((tool) => {
    const haystack = normalize(
      `${tool.label} ${tool.description} ${tool.keywords.join(" ")}`
    );
    return terms.every((term) => haystack.includes(term));
  });
};

/**
 * The settings a tool would run with, given whatever the surface collected.
 *
 * Defaults are applied here rather than in each executor, so a tool invoked
 * from a slash command with no settings at all behaves identically to one
 * invoked from a fully-filled panel. Text settings have no declared default —
 * their absence is meaningful — so they are left out rather than defaulted to
 * an empty string that would read as "the user cleared this".
 */
export const withDefaults = (
  tool: Tool,
  provided: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> => {
  const config: Record<string, unknown> = {};
  for (const setting of tool.settings) {
    if (setting.kind !== "text") {
      config[setting.key] = setting.default;
    }
  }
  return { ...config, ...provided };
};

/**
 * Why this tool cannot run right now, or null when it can.
 *
 * Checked before invoking, so the bar can disable a button *and say why*, and
 * so an executor is never handed an invocation it will only reject. The
 * executors check again anyway — a chat can call one directly — but this is
 * where the answer is phrased for a person.
 */
export const blockedReason = (
  tool: Tool,
  context: { hasImage: boolean; hasMask: boolean; hasPrompt: boolean }
): string | null => {
  if (tool.status === "planned") {
    return `${tool.label} is not built yet.`;
  }
  if (tool.needsMask && !context.hasMask) {
    return `${tool.label} needs a mask. Paint over the part you want changed.`;
  }
  if (tool.needsPrompt && !context.hasPrompt) {
    return `${tool.label} needs a description of what you want.`;
  }
  if (tool.executor === "transform" && !context.hasImage) {
    return `${tool.label} needs an image, and this item has none.`;
  }
  return null;
};
