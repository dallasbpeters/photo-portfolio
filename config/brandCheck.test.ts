import { describe, expect, it } from "vitest";
import {
  colourDistance,
  DEFAULT_TOLERANCE,
  hexToRgb,
  isFindingKind,
  measureColours,
  nearestPaletteEntry,
  rgbToHex,
  scoreVerdict,
} from "./brandCheck.js";
import type { PaletteEntry } from "./brandKit.js";

const swatch = (name: string, value: string): PaletteEntry => ({
  name,
  role: "accent",
  value,
});

const PALETTE = [
  swatch("Ink", "#101014"),
  swatch("Rust", "#b8442a"),
  swatch("Paper", "#f5f0e8"),
];

describe("hexToRgb / rgbToHex", () => {
  it("round trips a six-digit hex", () => {
    const rgb = hexToRgb("#b8442a");
    expect(rgb).toEqual({ b: 0x2a, g: 0x44, r: 0xb8 });
    expect(rgbToHex(rgb as never)).toBe("#b8442a");
  });

  it("accepts a missing hash and mixed case", () => {
    expect(hexToRgb("B8442A")).toEqual({ b: 0x2a, g: 0x44, r: 0xb8 });
  });

  it("returns null rather than guessing at bad input", () => {
    expect(hexToRgb("#fff")).toBeNull();
    expect(hexToRgb("rust")).toBeNull();
    expect(hexToRgb("")).toBeNull();
  });
});

describe("colourDistance", () => {
  it("is zero for a colour against itself", () => {
    const rgb = hexToRgb("#b8442a") as never;
    expect(colourDistance(rgb, rgb)).toBe(0);
  });

  it("is symmetric", () => {
    const a = hexToRgb("#101014") as never;
    const b = hexToRgb("#f5f0e8") as never;
    expect(colourDistance(a, b)).toBeCloseTo(colourDistance(b, a), 10);
  });

  it("puts black and white at the far end of the scale", () => {
    const d = colourDistance(
      hexToRgb("#000000") as never,
      hexToRgb("#ffffff") as never
    );
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThanOrEqual(100);
  });

  it("rates two similar greens closer than navy and black", () => {
    // The regression that sent this to redmean: plain RGB distance called navy
    // and black further apart than two visibly different greens, which made the
    // tolerance control meaningless.
    const greens = colourDistance(
      hexToRgb("#2e7d32") as never,
      hexToRgb("#388e3c") as never
    );
    const navyBlack = colourDistance(
      hexToRgb("#000080") as never,
      hexToRgb("#000000") as never
    );
    expect(greens).toBeLessThan(navyBlack);
  });
});

describe("nearestPaletteEntry", () => {
  it("finds the closest swatch, not the first", () => {
    const { entry } = nearestPaletteEntry("#f6f1e9", PALETTE);
    expect(entry?.name).toBe("Paper");
  });

  it("reports no entry when the palette holds nothing usable", () => {
    const { entry } = nearestPaletteEntry("#b8442a", [
      swatch("Broken", "nope"),
    ]);
    expect(entry).toBeNull();
  });

  it("skips unparseable swatches but still matches the good ones", () => {
    const mixed = [swatch("Broken", "chartreuse"), swatch("Rust", "#b8442a")];
    const { distance, entry } = nearestPaletteEntry("#b8442a", mixed);
    expect(entry?.name).toBe("Rust");
    expect(distance).toBe(0);
  });
});

describe("measureColours", () => {
  it("passes a colour inside tolerance and names what it matched", () => {
    const [finding] = measureColours(["#b8442a"], PALETTE);
    expect(finding).toMatchObject({
      expected: "#b8442a",
      found: "#b8442a",
      kind: "palette",
      severity: "pass",
      source: "measured",
    });
  });

  it("fails a colour outside tolerance and names the nearest entry (acc. 2.4)", () => {
    const [finding] = measureColours(["#00ff00"], PALETTE);
    expect(finding?.severity).toBe("fail");
    expect(finding?.expected).toBeDefined();
    // The detail has to be actionable: the offending value and what it should
    // have been, both spelled out.
    expect(finding?.detail).toContain("#00ff00");
    expect(finding?.detail).toContain("nearest palette entry");
  });

  it("marks every colour finding as measured, never judged", () => {
    const findings = measureColours(["#00ff00", "#b8442a"], PALETTE);
    expect(findings.every((f) => f.source === "measured")).toBe(true);
  });

  it("warns rather than passing when the palette is empty", () => {
    // A kit that defines no colours cannot approve colours. Passing everything
    // silently is how a check becomes theatre.
    const findings = measureColours(["#00ff00"], []);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "palette", severity: "warn" });
    expect(findings[0]?.detail).toContain("No palette defined");
  });

  it("respects a widened tolerance", () => {
    const strict = measureColours(["#c04a30"], PALETTE, 1);
    const loose = measureColours(["#c04a30"], PALETTE, DEFAULT_TOLERANCE);
    expect(strict[0]?.severity).toBe("fail");
    expect(loose[0]?.severity).toBe("pass");
  });

  it("reports nothing when there are no dominant colours to weigh", () => {
    expect(measureColours([], PALETTE)).toEqual([]);
  });
});

describe("scoreVerdict", () => {
  it("fails on any fail", () => {
    const verdict = scoreVerdict([
      { detail: "", kind: "palette", severity: "pass", source: "measured" },
      { detail: "", kind: "mood", severity: "fail", source: "judged" },
    ]);
    expect(verdict.passed).toBe(false);
  });

  it("passes despite a warn — the check could not look, that is not the asset's fault", () => {
    const verdict = scoreVerdict([
      { detail: "", kind: "palette", severity: "warn", source: "measured" },
    ]);
    expect(verdict.passed).toBe(true);
  });

  it("passes an empty finding set", () => {
    expect(scoreVerdict([]).passed).toBe(true);
  });

  it("copies the findings rather than aliasing the caller's array", () => {
    const findings = [
      {
        detail: "",
        kind: "mood" as const,
        severity: "pass" as const,
        source: "judged" as const,
      },
    ];
    const verdict = scoreVerdict(findings);
    findings.length = 0;
    expect(verdict.findings).toHaveLength(1);
  });
});

describe("isFindingKind", () => {
  it("accepts every kind the report can contain", () => {
    for (const kind of [
      "palette",
      "typeface",
      "logo",
      "composition",
      "mood",
      "offBrandResemblance",
    ]) {
      expect(isFindingKind(kind)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(isFindingKind("vibes")).toBe(false);
    expect(isFindingKind(null)).toBe(false);
    expect(isFindingKind(7)).toBe(false);
  });
});
