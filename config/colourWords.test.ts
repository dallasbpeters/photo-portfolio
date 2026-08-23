import { describe, expect, it } from "vitest";
import {
  describeColour,
  describePalette,
  MAX_DESCRIBED,
} from "./colourWords.js";

/**
 * The bug this fixes was visible in the output: `using only these colors:
 * #2e84f5, #ffcd75` went into prompts verbatim and the models that letter well
 * drew the hex codes across the picture. A prompt is a description, and a hex
 * triplet is a string of characters before it is a colour.
 */

describe("describeColour", () => {
  it("names the hues a brand actually uses", () => {
    // The palette from the tokens file that produced the lettered pictures.
    expect(describeColour("#2e84f5")).toBe("vivid blue");
    expect(describeColour("#ffcd75")).toBe("pale amber");
    expect(describeColour("#fe8585")).toBe("pale red");
    expect(describeColour("#96e9f8")).toBe("pale cyan");
    expect(describeColour("#86c874")).toBe("green");
    expect(describeColour("#3b1948")).toBe("very dark violet");
    expect(describeColour("#fcf397")).toBe("pale yellow");
  });

  it("calls a neutral a neutral instead of inventing a hue", () => {
    /*
     * The failure worth guarding. Near-black rounds to *some* hue, and "very
     * dark blue" for #1a1a1c would have a model produce something visibly
     * blue — wrong in a way nobody would trace back to here.
     */
    expect(describeColour("#000000")).toBe("black");
    expect(describeColour("#1a1a1c")).toBe("near-black");
    expect(describeColour("#cccccc")).toBe("light grey");
    expect(describeColour("#ffffff")).toBe("white");
    expect(describeColour("#7f7f7f")).toBe("mid grey");
  });

  it("says vivid and muted only where the word earns its place", () => {
    // A mid-saturation colour called "somewhat saturated" costs a word and
    // carries no information.
    expect(describeColour("#ff0000")).toBe("vivid red");
    expect(describeColour("#6b5f66")).toBe("mid grey");
  });

  it("never contradicts itself with 'pale vivid'", () => {
    /*
     * HSL reports a high saturation for light pastels, so #ffcd75 first came out
     * as "pale vivid amber" — two words that cancel each other and describe
     * nothing a model can act on.
     */
    for (const hex of ["#ffcd75", "#fe8585", "#96e9f8", "#fcf397", "#ffe4b5"]) {
      const said = describeColour(hex) ?? "";
      expect(said, hex).not.toMatch(/pale vivid|very pale vivid/);
    }
  });

  it("refuses anything that is not a six-digit hex", () => {
    expect(describeColour("not a colour")).toBeNull();
    expect(describeColour("#fff")).toBeNull();
    expect(describeColour("")).toBeNull();
  });

  it("never emits a hex code, whatever it is given", () => {
    // The whole point: no output of this function may contain a '#'.
    for (const hex of ["#2e84f5", "#000000", "#ffffff", "#3b1948", "#86d4e9"]) {
      expect(describeColour(hex)).not.toContain("#");
    }
  });
});

describe("describePalette", () => {
  it("drops near-duplicates a tokens file is full of", () => {
    // Three shades of one blue is one instruction, not three.
    const said = describePalette(["#2e84f5", "#2f85f6", "#3086f7", "#ffcd75"]);
    expect(said).toBe("vivid blue, pale amber");
  });

  it("keeps the brand's own order, so the primary leads", () => {
    expect(describePalette(["#ffcd75", "#2e84f5"])).toBe(
      "pale amber, vivid blue"
    );
  });

  it("keeps a brand's genuinely different hues", () => {
    /*
     * The regression this guards. A distance threshold of 40 measured half this
     * palette as duplicates and reduced nine hues to three — the word is the
     * right primary test for "would a model be told anything new", not the
     * distance.
     */
    const said = describePalette([
      "#2e84f5",
      "#ffcd75",
      "#fe8585",
      "#96e9f8",
      "#86c874",
      "#3b1948",
    ]);
    expect(said.split(", ")).toHaveLength(6);
  });

  it("caps the list, because a wall of colours crowds out the subject", () => {
    const many = [
      "#ff0000",
      "#00ff00",
      "#0000ff",
      "#ffff00",
      "#ff00ff",
      "#00ffff",
      "#ff8800",
      "#8800ff",
      "#88ff00",
    ];
    expect(describePalette(many).split(", ")).toHaveLength(MAX_DESCRIBED);
  });

  it("skips values it cannot read rather than failing the palette", () => {
    expect(describePalette(["nonsense", "#2e84f5"])).toBe("vivid blue");
  });

  it("is empty for an empty palette", () => {
    expect(describePalette([])).toBe("");
    expect(describePalette(["nope"])).toBe("");
  });

  it("never emits a hex code", () => {
    expect(describePalette(["#2e84f5", "#ffcd75", "#cccccc"])).not.toContain(
      "#"
    );
  });
});
