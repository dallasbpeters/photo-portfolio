/**
 * Bounds that more than one node definition needs.
 *
 * A leaf module with no imports of its own, for the reason config/ports.ts
 * gives: once node definitions live in separate files, a constant shared
 * between two of them cannot sit in either without the pair importing each
 * other. ES modules allow that cycle but not the timing.
 *
 * A bound used by exactly one node stays in that node's file — ICON_PROMPT_MAX
 * is in icon.ts — because moving it here would put the number further from the
 * only thing that reads it.
 */

/**
 * Matches MAX_PROMPT in api/ai/generate.ts.
 *
 * Written down again rather than imported because that module pulls in the
 * Vercel runtime, and this one must stay importable from the browser.
 */
export const GENERATE_PROMPT_MAX = 1200;

/** How many variations one node may be asked for in a single run. */
export const MAX_BATCH_COUNT = 8;

/**
 * How many pictures one shader run will draw.
 *
 * Each is a WebGPU render plus an upload, done one at a time in the browser
 * that asked for it, so a batch of hundreds is a tab locked up for minutes
 * rather than a bill — but it is still a wait nobody chose. Well past a
 * contact sheet, short of a whole library.
 */
export const MAX_SHADER_RENDERS = 40;

/**
 * How far a trained style may repaint a wired picture, as a percentage.
 *
 * fal's image-to-image endpoints take `strength` from 0 to 1: 0 preserves the
 * original and 1 remakes it entirely. Expressed here as a percentage because
 * that is what it means and what reads on a node — "70%" rather than "0.7".
 *
 * There is no correct value. Below about 40% the style stops arriving; above
 * about 90% the source stops surviving; where in between depends on the LoRA
 * and on the picture. It was a constant in api/_lib/fal.ts for a while, which
 * meant "this restyle is too faithful" had no answer short of editing code —
 * and the one value chosen turned out to be too faithful for the first style
 * anyone trained.
 */
export const MIN_RESTYLE = 10;
export const MAX_RESTYLE = 100;

/**
 * fal's own default is 85. This sits just under it: high enough that a restyle
 * plainly restyles, low enough that the subject and composition survive.
 */
export const DEFAULT_RESTYLE = 80;

/**
 * How hard a freshly trained style presses, as fal's LoRA `scale`.
 *
 * Trained rows were written at 1, which is fal's own default and the one value
 * no hand-tuned style on this board uses: the six curated LoRAs sit between
 * 0.8 and 0.9. At 1 a style trained on a small, similar set of pictures — which
 * is what training from a single frame produces — presses hard enough to pull
 * an image-to-image run back to what it memorised. Wire one of the training
 * pictures into such a style and it is reproduced almost exactly, which reads
 * as the style ignoring the prompt and copying the input.
 *
 * The strength setting on the node cannot fix that, because it is the other
 * lever: it decides how much of the *picture* is repainted, not how hard the
 * weights press while it is. Repainting more of an image with a style that has
 * memorised it just arrives back at the same place.
 *
 * A per-style number rather than a per-node one, because it belongs to the
 * weights: how overfit a given LoRA is, is a fact about that LoRA. It is
 * editable per style in the Models panel.
 */
export const DEFAULT_TRAINED_SCALE = 0.85;
