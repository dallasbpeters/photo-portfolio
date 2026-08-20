import { describe, expect, it } from "vitest";
import { resolvableFrequency } from "./renderShaderNode";

/**
 * How fine a screen a frame can actually carry.
 *
 * The library measures frequency in cells across the *frame*, not in pixels, so
 * the same number means a different thing at every size. 148 across an export
 * is a fine even screen; 148 across a 300px node preview is two pixels a cell,
 * which aliases into a smeared, crooked mess and reads as a broken shader
 * rather than as a screen too fine to draw. Rendered side by side at 300px and
 * 1200px from identical settings, which is how this was found.
 */

describe("resolvableFrequency", () => {
  it("leaves a screen the frame can draw alone", () => {
    // 148 across 1200px is eight pixels a cell. Nothing to fix.
    expect(resolvableFrequency(148, 1200)).toBe(148);
  });

  it("coarsens a screen the frame cannot draw", () => {
    // 300px at four pixels a cell is seventy-five, not a hundred and forty-eight.
    expect(resolvableFrequency(148, 300)).toBe(75);
  });

  it("never goes finer than asked for", () => {
    // A big frame does not turn a coarse screen into a fine one.
    expect(resolvableFrequency(20, 2400)).toBe(20);
  });

  it("keeps a floor, so a tiny node still shows a screen", () => {
    expect(resolvableFrequency(148, 4)).toBe(4);
  });

  it("leaves it alone when the size is not known", () => {
    // Better the asked-for screen than a guess: the caller that knows the size
    // passes it, and the one that does not should not be second-guessed.
    expect(resolvableFrequency(148)).toBe(148);
    expect(resolvableFrequency(148, 0)).toBe(148);
  });

  it("agrees with itself either side of the threshold", () => {
    // The clamp only ever bites where the alternative is unreadable, so a
    // preview and an export that can both draw the screen draw the same one.
    const asked = 60;
    expect(resolvableFrequency(asked, 240)).toBe(asked);
    expect(resolvableFrequency(asked, 1200)).toBe(asked);
  });
});
