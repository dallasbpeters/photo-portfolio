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
