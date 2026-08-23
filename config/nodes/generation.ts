/**
 * The generation parameters a node sets once and then leaves alone.
 *
 * Size, output format, quality, and how many passes to run. Declared here
 * rather than inline in generate.ts because the run endpoint has to read the
 * same vocabulary it offers: a value the panel can pick but api/_lib/fal.ts
 * does not recognise is a control that silently does nothing, which is worse
 * than no control.
 *
 * **Every one of these defaults to "auto", and auto means the parameter is not
 * sent at all.** That is the safety property the whole design rests on. These
 * endpoints do not agree on what they accept — fal validates strictly and
 * answers 422 for a field a model has never heard of — and a run that fails
 * after being billed is the worst outcome available. So an untouched node
 * behaves exactly as it did before any of this existed, and a parameter reaches
 * fal only when somebody has deliberately chosen it *and* the endpoint is known
 * to take it. See SIZE_CAPABLE and FORMAT_CAPABLE in api/_lib/fal.ts.
 */

/**
 * The shapes fal names.
 *
 * fal's own vocabulary, not ours: these strings go into `image_size` verbatim,
 * so they cannot be prettified here without a translation table on the way out.
 * "auto" is ours, and means the field is omitted so the endpoint keeps its own
 * default — which for an edit is usually "match the input", the behaviour
 * somebody reaching for this control most often wants to keep.
 */
export const IMAGE_SIZES = [
  "auto",
  "square_hd",
  "square",
  "portrait_4_3",
  "portrait_16_9",
  "landscape_4_3",
  "landscape_16_9",
] as const;

export type ImageSize = (typeof IMAGE_SIZES)[number];

/**
 * What each size is called on a control.
 *
 * The values are fal's and go into the request verbatim; these are only what a
 * panel says. "Auto" is spelled out rather than left as the bare word because
 * in this list it is a choice with a meaning — keep the endpoint's own default —
 * rather than the absence of one.
 */
export const IMAGE_SIZE_LABELS: Readonly<Record<ImageSize, string>> = {
  auto: "Auto (model default)",
  landscape_4_3: "Landscape 4:3",
  landscape_16_9: "Landscape 16:9",
  portrait_4_3: "Portrait 4:3",
  portrait_16_9: "Portrait 16:9",
  square: "Square",
  square_hd: "Square HD",
};

/**
 * The same shape, spelled as an aspect ratio.
 *
 * Half the endpoints on this board call this `image_size` and take a name;
 * the other half call it `aspect_ratio` and take a ratio. One control has to
 * work on both, so the panel stores the name and this is the translation.
 *
 * Every value here appears in the `aspect_ratio` enum of the endpoints that
 * have one — checked against fal's schemas, not chosen. "square_hd" collapses
 * to 1:1 because a ratio cannot carry a resolution; that is a real loss, and
 * the reason the resolution-bearing spelling is tried first.
 */
export const SIZE_AS_ASPECT: Readonly<Record<string, string>> = {
  landscape_4_3: "4:3",
  landscape_16_9: "16:9",
  portrait_4_3: "3:4",
  portrait_16_9: "9:16",
  square: "1:1",
  square_hd: "1:1",
};

/**
 * What the picture comes back as.
 *
 * JPEG loses the alpha channel, which matters more here than it looks: a node
 * whose whole job is removing a background is the one most likely to have its
 * format changed, and choosing JPEG there throws away the result's only useful
 * property. The panel says so next to the control.
 */
export const OUTPUT_FORMATS = ["auto", "png", "jpeg", "webp"] as const;

export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const OUTPUT_FORMAT_LABELS: Readonly<Record<OutputFormat, string>> = {
  auto: "Auto (model default)",
  jpeg: "JPEG",
  png: "PNG",
  webp: "WebP",
};

/**
 * How hard the model should work.
 *
 * Deliberately three coarse words rather than a step count, because the labs do
 * not agree on the underlying knob — OpenAI takes a `quality` of low/medium/high,
 * the FLUX family takes `num_inference_steps`, and Recraft takes neither. The
 * translation per family is in api/_lib/fal.ts, which is the only place that
 * knows which endpoint is actually being called.
 */
export const QUALITIES = ["auto", "draft", "standard", "high"] as const;

export type Quality = (typeof QUALITIES)[number];

export const QUALITY_LABELS: Readonly<Record<Quality, string>> = {
  auto: "Auto (model default)",
  draft: "Draft — fewer steps, faster",
  high: "High — more steps, slower",
  standard: "Standard",
};

/**
 * The step counts each quality means for endpoints that measure it that way.
 *
 * Chosen to straddle the FLUX default of 28: draft is visibly rougher and
 * roughly twice as fast, high is the point past which the picture stops
 * changing much for the time it costs.
 */
export const QUALITY_STEPS: Record<Exclude<Quality, "auto">, number> = {
  draft: 12,
  high: 40,
  standard: 28,
};

/** What OpenAI's image endpoints call the same three. They have no "draft". */
export const QUALITY_OPENAI: Record<Exclude<Quality, "auto">, string> = {
  draft: "low",
  high: "high",
  standard: "medium",
};

/**
 * The most passes a node may make over its own output.
 *
 * Each pass is a full billed generation, and the run is sequential because pass
 * two needs pass one's picture — so eight is already minutes of waiting and
 * eight times the cost of a single run. Low enough that a mis-set field is an
 * annoyance rather than an incident.
 */
export const MAX_LOOPS = 8;
