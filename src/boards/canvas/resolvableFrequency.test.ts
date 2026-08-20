import { describe, expect, it } from "vitest";
import { resolvableFrequency } from "./renderShaderNode";

/**
 * How fine a screen a frame can actually carry.
 *
 * The library measures frequency in cells across the *frame*, not in pixels, so
 * the same number means a different thing at every size: 148 across a large
 * export is a fine even screen, and 148 across a 300px node preview is two
 * pixels a cell. A dot needs room for an inside and an outside, and the library
 * antialiases in dot-space rather than pixel-space — SMOOTHNESS is a constant
 * fraction of a cell — so below a certain size no amount of setting can conjure
 * an edge.
 *
 * Ten pixels a cell, chosen by rendering the same picture at three, four, six,
 * eight, ten and twelve and looking at all six. Four is a muddy even texture
 * with no dots in it; eight still bands across a gradient; ten is round,
 * separate dots.
 */

/** The floor these all turn on, kept in one place so the sums read plainly. */
const CELL = 10;

describe("resolvableFrequency", () => {
  it("leaves a screen the frame can draw alone", () => {
    // 60 across 1200px is twenty pixels a cell. Nothing to fix.
    expect(resolvableFrequency(60, 1200)).toBe(60);
  });

  it("coarsens a screen the frame cannot draw", () => {
    // 148 across 300px is two pixels a cell, which is the muddy texture.
    expect(resolvableFrequency(148, 300)).toBe(300 / CELL);
  });

  it("gives a big frame the fine screen it asked for", () => {
    expect(resolvableFrequency(148, 2400)).toBe(148);
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
    const asked = 24;
    expect(resolvableFrequency(asked, asked * CELL)).toBe(asked);
    expect(resolvableFrequency(asked, 1200)).toBe(asked);
  });
});
