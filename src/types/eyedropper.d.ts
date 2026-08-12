/**
 * The browser's own colour sampler.
 *
 * Not in TypeScript's DOM library yet, and not in every browser — Chrome and
 * Edge have it, Safari and Firefox do not — so every use is feature-detected
 * and the control simply does not appear where it is missing. react-color
 * ships fifteen pickers and none of them can sample from the screen, which is
 * the one thing wanted when the colour being matched is already on the board.
 */
interface EyeDropperResult {
  sRGBHex: string;
}

declare class EyeDropper {
  open(options?: { signal?: AbortSignal }): Promise<EyeDropperResult>;
}

interface Window {
  EyeDropper?: typeof EyeDropper;
}
