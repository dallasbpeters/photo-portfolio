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
