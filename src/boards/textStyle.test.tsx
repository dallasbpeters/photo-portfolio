// The real stylesheet, because half of what is asserted here is "renders the
// same as it did before" — and before, the weight came from a Tailwind class.
import "../index.css";
import type { CSSProperties, ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LINE_HEIGHT,
  normalizeTextStyle,
  type TextStyle,
  type TextStyleTarget,
  textStyleCss,
  weightsFor,
} from "../../config/textStyle";

let host: HTMLDivElement | null = null;
let root: Root | null = null;

/** Lets React commit before the assertions look at the DOM. */
const flush = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

const render = async (ui: ReactElement): Promise<HTMLElement> => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  root.render(ui);
  await flush();
  return host.firstElementChild as HTMLElement;
};

/**
 * The nine properties the toolbar can set, as the browser resolved them.
 *
 * Read back from the real engine rather than from the object handed in: the
 * question is what the words are actually set in, and "0.1em" only becomes a
 * tracking of four pixels once something knows the size it applies to.
 */
const TYPESETTING = [
  "color",
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontWeight",
  "letterSpacing",
  "lineHeight",
  "textAlign",
  "textTransform",
] as const;

const painted = async (
  className: string,
  style: CSSProperties
): Promise<Record<string, string>> => {
  const el = await render(
    <textarea className={className} defaultValue="Hg" readOnly style={style} />
  );
  const resolved = getComputedStyle(el);
  return Object.fromEntries(
    TYPESETTING.map((property) => [property, resolved[property]])
  );
};

/** Exactly the classes BoardItemView puts on each kind of field. */
const TEXT_CLASS =
  "h-full w-full resize-none border-0 bg-transparent p-1 text-board-ink outline-none placeholder:text-board-ink/30";
const NOTE_CLASS =
  "h-full w-full resize-none bg-amber-100/95 p-3 text-neutral-900 outline-none";

const target = (
  kind: string,
  textStyle: TextStyle | null = null,
  fontSize: number | null = null
): TextStyleTarget => ({ fontSize, kind, textStyle });

const FULL: TextStyle = {
  align: "center",
  color: "#ff0000",
  family: "fraunces",
  italic: true,
  letterSpacing: 0.1,
  lineHeight: 2,
  transform: "uppercase",
  weight: 700,
};

afterEach(() => {
  root?.unmount();
  host?.remove();
  host = null;
  root = null;
});

describe("defaults — an item nobody has styled", () => {
  /**
   * The one that would break every existing board silently.
   *
   * Before this existed, a text item was set by two literals in the JSX
   * (`fontSize` and `lineHeight: 1.25`) and a `font-light` class. If a null
   * property resolved to a CSS default instead of to those, every unstyled item
   * on every board would quietly re-set itself — a null line-height in
   * particular collapsing the lines onto each other.
   */
  it("sets plain text exactly as the old literals did", async () => {
    const before = await painted(`${TEXT_CLASS} font-light`, {
      fontSize: 22,
      lineHeight: 1.25,
    });
    // Asserted so the comparison cannot pass vacuously: `font-light` really is
    // being applied, so 300 really is the weight that has to be reproduced.
    expect(before.fontWeight).toBe("300");
    expect(before.lineHeight).toBe("27.5px");
    const after = await painted(TEXT_CLASS, textStyleCss(target("text")));
    expect(after).toEqual(before);
  });

  it("sets a note exactly as the old literals did", async () => {
    const before = await painted(NOTE_CLASS, {
      fontSize: 15,
      lineHeight: 1.25,
    });
    const after = await painted(NOTE_CLASS, textStyleCss(target("note")));
    expect(after).toEqual(before);
  });

  it("keeps a note and plain text at their different weights", () => {
    expect(textStyleCss(target("note")).fontWeight).toBe(400);
    expect(textStyleCss(target("text")).fontWeight).toBe(300);
  });

  it("says nothing about colour, family or alignment", () => {
    // Omitted rather than defaulted: the ink inverts with the board's theme,
    // the family follows the site's, and `start` is not the same answer as
    // `left`. Naming any of them here would pin an unstyled board to whatever
    // the value happened to be today.
    const css = textStyleCss(target("text"));
    expect(css).not.toHaveProperty("color");
    expect(css).not.toHaveProperty("fontFamily");
    expect(css).not.toHaveProperty("textAlign");
  });

  it("does not read a null line-height as zero", () => {
    // Number(null) is 0, which clamps to the floor and stacks every line on
    // top of the last. The parser has to be strict about the type.
    const style = normalizeTextStyle({ family: "inter", lineHeight: null });
    expect(style?.lineHeight).toBeNull();
    expect(textStyleCss(target("text", style)).lineHeight).toBe(
      DEFAULT_LINE_HEIGHT
    );
  });

  it("falls back to the kind's size when the item has none", () => {
    expect(textStyleCss(target("note")).fontSize).toBe(15);
    expect(textStyleCss(target("text")).fontSize).toBe(22);
    expect(textStyleCss(target("text", null, 58)).fontSize).toBe(58);
  });
});

describe("every property, as the browser resolves it", () => {
  it("applies all eight, plus the size", async () => {
    const css = textStyleCss(target("text", FULL, 40));
    const got = await painted(TEXT_CLASS, css);

    expect(got.fontSize).toBe("40px");
    expect(got.fontWeight).toBe("700");
    expect(got.fontStyle).toBe("italic");
    expect(got.textAlign).toBe("center");
    expect(got.textTransform).toBe("uppercase");
    expect(got.color).toBe("rgb(255, 0, 0)");
    // Both are relative to the size, which is the point of storing them that
    // way: resizing the item keeps the setting rather than breaking it.
    expect(got.letterSpacing).toBe("4px");
    expect(got.lineHeight).toBe("80px");
    // The stack from config/theme.ts, not a fallback of our own invention.
    expect(got.fontFamily).toContain("Fraunces Variable");
  });

  it("turns tracking into em rather than pixels", () => {
    expect(textStyleCss(target("text", FULL, 40)).letterSpacing).toBe("0.1em");
    expect(textStyleCss(target("text")).letterSpacing).toBe("normal");
  });
});

describe("normalizeTextStyle — the save and load round trip", () => {
  it("returns a full style unchanged through JSON", () => {
    // Exactly the trip a save makes: object → JSONB → object.
    const stored = JSON.parse(JSON.stringify(normalizeTextStyle(FULL)));
    expect(normalizeTextStyle(stored)).toEqual(FULL);
  });

  it("stores nothing for an item with nothing set", () => {
    expect(normalizeTextStyle({})).toBeNull();
    expect(normalizeTextStyle(null)).toBeNull();
    expect(normalizeTextStyle([])).toBeNull();
    expect(normalizeTextStyle("bold")).toBeNull();
    expect(normalizeTextStyle({ italic: false })).toBeNull();
  });

  it("drops keys nobody declared", () => {
    const style = normalizeTextStyle({
      family: "inter",
      onerror: "alert(1)",
      script: "<script>",
    });
    expect(style).toEqual({
      align: null,
      color: null,
      family: "inter",
      italic: null,
      letterSpacing: null,
      lineHeight: null,
      transform: null,
      weight: null,
    });
  });

  it("refuses a family the app cannot actually render", () => {
    expect(normalizeTextStyle({ family: "Comic Sans MS" })).toBeNull();
    expect(normalizeTextStyle({ family: "biorhyme" })).toBeNull();
  });

  it("refuses anything that is not a hex colour", () => {
    expect(normalizeTextStyle({ color: "red" })).toBeNull();
    expect(normalizeTextStyle({ color: "url(evil)" })).toBeNull();
    expect(normalizeTextStyle({ color: "#FF00AA" })?.color).toBe("#ff00aa");
    expect(normalizeTextStyle({ color: "#ff00aa80" })?.color).toBe("#ff00aa80");
  });

  it("clamps a number rather than refusing the whole style", () => {
    expect(normalizeTextStyle({ lineHeight: 99 })?.lineHeight).toBe(3);
    expect(normalizeTextStyle({ lineHeight: 0 })?.lineHeight).toBe(0.7);
    expect(normalizeTextStyle({ letterSpacing: 40 })?.letterSpacing).toBe(1);
    expect(normalizeTextStyle({ lineHeight: Number.NaN })).toBeNull();
  });

  it("only ever stores italic as true", () => {
    expect(normalizeTextStyle({ italic: true })?.italic).toBe(true);
    expect(normalizeTextStyle({ family: "inter", italic: false })?.italic).toBe(
      null
    );
  });

  it("keeps an unknown alignment or transform out", () => {
    expect(normalizeTextStyle({ align: "justify" })).toBeNull();
    expect(normalizeTextStyle({ transform: "small-caps" })).toBeNull();
    expect(normalizeTextStyle({ align: "right" })?.align).toBe("right");
  });
});

describe("weights — only what the family can draw", () => {
  /**
   * A browser clamps a weight outside a variable font's axis instead of
   * failing, so a picker offering 300 for Playfair Display is offering a
   * control that does nothing visible.
   */
  it("cuts the list to the family's axis", () => {
    expect(weightsFor("playfair-display").at(0)?.value).toBe(400);
    expect(weightsFor("cormorant-garamond").at(-1)?.value).toBe(700);
    expect(weightsFor("inter").map((w) => w.value)).toEqual([
      100, 200, 300, 400, 500, 600, 700, 800, 900,
    ]);
  });

  it("offers what every family shares when none is chosen", () => {
    expect(weightsFor(null).map((w) => w.value)).toEqual([
      300, 400, 500, 600, 700,
    ]);
  });

  it("snaps a stored weight into the family it is now set in", () => {
    // Changing family with a weight already chosen: 200 is not a Playfair
    // weight, and storing it would show a control set to something the browser
    // is quietly drawing as 400.
    const style = normalizeTextStyle({
      family: "playfair-display",
      weight: 200,
    });
    expect(style?.weight).toBe(400);
    expect(normalizeTextStyle({ family: "inter", weight: 250 })?.weight).toBe(
      300
    );
  });
});
