import "../index.css";
import { afterEach, describe, expect, it } from "vitest";

/**
 * What the stylesheet actually resolves to, in both themes.
 *
 * Read from a real browser rather than by eye, because the cascade in
 * index.css is doing work that is not visible in the source: theme variables
 * are emitted by Tailwind into `:root`, then overridden by later `:root` and
 * `.dark` blocks, and one token is redefined four times across two `@theme`
 * blocks. Which definition wins is a question about ordering and specificity,
 * and reading it off the file is exactly how it came to be wrong.
 *
 * This exists to make restructuring that file safe. Any change that moves a
 * declaration without meaning to change what is painted shows up here as a
 * failing assertion rather than as a screen someone notices next week.
 *
 * The values are deliberately the *resolved* ones. A test that asserted the
 * variables refer to each other would pass for a chain that resolves to
 * nothing, which is the failure mode this file is about — `bg-background`
 * resolving to nothing is how light mode had no background at all.
 */

const root = document.documentElement;

const value = (name: string): string =>
  getComputedStyle(root).getPropertyValue(name).trim();

afterEach(() => {
  root.classList.remove("dark");
});

describe("the light palette", () => {
  it("paints on white with near-black writing", () => {
    expect(value("--background")).toBe("oklch(1 0 0)");
    expect(value("--foreground")).toBe("oklch(0.145 0 0)");
  });

  it("does not paint the writing the same colour as the ground", () => {
    // It did. Two `@theme` blocks set --color-background and --color-foreground
    // both to #ffffff, and only source order downstream saved it.
    expect(value("--background")).not.toBe(value("--foreground"));
  });

  it("gives the board light paper", () => {
    expect(value("--board-ink")).toBe("oklch(0.145 0 0)");
    expect(value("--board-surface")).toBe("oklch(1 0 0)");
  });
});

describe("the dark palette", () => {
  it("inverts the ground and the writing", () => {
    root.classList.add("dark");
    expect(value("--background")).toBe("oklch(0.145 0 0)");
    expect(value("--foreground")).toBe("oklch(0.985 0 0)");
  });

  it("inverts the board with it", () => {
    root.classList.add("dark");
    expect(value("--board-ink")).toBe("oklch(1 0 0)");
    expect(value("--board-surface")).toBe("oklch(0 0 0)");
  });
});

describe("what Tailwind supplies rather than this file", () => {
  it("still tracks uppercase type at the same spacing", () => {
    // The old file redefined --tracking-widest as `calc(--tracking-normal +
    // 0.1em)`, which with a normal of 0em is exactly Tailwind's own default.
    // Dropping the redefinition is only safe because of that, and this says so
    // — the app is full of letterspaced uppercase labels, and losing the
    // tracking would be visible on every one of them.
    expect(value("--tracking-widest")).toBe("0.1em");
  });

  it("keeps the custom type scale, which is not Tailwind's", () => {
    // A perfect fourth, and much smaller than the default at the bottom end.
    // This one has to stay declared or every size in the app changes.
    expect(value("--text-xs")).toBe("0.528rem");
    expect(value("--text-6xl")).toBe("6.011rem");
  });
});

describe("every semantic token resolves to something", () => {
  // The list is what the app actually uses; see the utility counts in the
  // commit that trimmed this file. A token that resolves to "" is a class
  // somewhere painting nothing, which looks like a missing element.
  const TOKENS = [
    "--background",
    "--foreground",
    "--card",
    "--card-foreground",
    "--popover",
    "--popover-foreground",
    "--primary",
    "--primary-foreground",
    "--muted",
    "--muted-foreground",
    "--accent",
    "--accent-foreground",
    "--destructive",
    "--destructive-foreground",
    "--border",
    "--input",
    "--ring",
    "--board-ink",
    "--board-surface",
    "--board-panel",
    "--board-ground",
    "--dot-bg",
    "--dot-color",
    "--btn-fg",
    "--btn-border",
    "--btn-hover-bg",
    "--btn-solid-bg",
    "--btn-danger-fg",
  ];

  it.each(TOKENS)("%s is set in light", (token) => {
    expect(value(token)).not.toBe("");
  });

  it.each(TOKENS)("%s is set in dark", (token) => {
    root.classList.add("dark");
    expect(value(token)).not.toBe("");
  });
});
