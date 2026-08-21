import type { PaletteEntry } from "./brandKit.js";

/**
 * What a brand check reports, and the arithmetic half of how it decides.
 *
 * The check runs two passes and every finding says which one produced it.
 *
 * **Measured** findings are computed here: a candidate's dominant colours are
 * compared to the palette by perceptual distance, and the answer is a number
 * anybody can re-derive. Colour compliance is the most checkable thing about an
 * image, and answering it with a language model would make the one exactly
 * computable finding the least trustworthy one in the report.
 *
 * **Judged** findings come from a vision model — composition, mood, logo
 * treatment, and whether the candidate reads more like the off-brand set than
 * the on-brand one. Those are things a model is genuinely good at and arithmetic
 * is not.
 *
 * The split is not decoration. An override (FR-015) is a very different act
 * depending on which half you are overruling, and a report that does not
 * distinguish them trains people to dismiss all of it.
 *
 * Dependency-free, like every module here: the panel renders these, the server
 * writes them, and both need the same answer.
 */

export const FINDING_KINDS = [
  "palette",
  "typeface",
  "logo",
  "composition",
  "mood",
  "offBrandResemblance",
] as const;

export type FindingKind = (typeof FINDING_KINDS)[number];

/** An allowlist guard, the pattern isIconStyle sets for anything forwarded on. */
export const isFindingKind = (value: unknown): value is FindingKind =>
  typeof value === "string" &&
  (FINDING_KINDS as readonly string[]).includes(value);

export type FindingSource = "measured" | "judged";
export type Severity = "pass" | "warn" | "fail";

export interface Finding {
  detail: string;
  /** What it should have been — the nearest palette entry, say. */
  expected?: string;
  /** What was found, when there is a concrete value to name. */
  found?: string;
  kind: FindingKind;
  severity: Severity;
  source: FindingSource;
}

export interface Verdict {
  findings: Finding[];
  passed: boolean;
}

/**
 * How far a colour may sit from the palette before it is off-brand.
 *
 * In the same units as `colourDistance` below. Ten is about the point where two
 * swatches stop reading as the same colour side by side; the setting exists
 * because a photographic brand and a flat-vector brand genuinely disagree about
 * where that line is.
 */
export const DEFAULT_TOLERANCE = 10;
export const MIN_TOLERANCE = 2;
export const MAX_TOLERANCE = 30;

export interface Rgb {
  b: number;
  g: number;
  r: number;
}

const LEADING_HASH = /^#/;
const SIX_DIGIT_HEX = /^[0-9a-f]{6}$/i;

/** Six-digit hex to channels. Returns null rather than guessing at bad input. */
export const hexToRgb = (hex: string): Rgb | null => {
  const clean = hex.trim().replace(LEADING_HASH, "");
  if (!SIX_DIGIT_HEX.test(clean)) {
    return null;
  }
  return {
    b: Number.parseInt(clean.slice(4, 6), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    r: Number.parseInt(clean.slice(0, 2), 16),
  };
};

export const rgbToHex = ({ b, g, r }: Rgb): string =>
  `#${[r, g, b]
    .map((c) =>
      Math.max(0, Math.min(255, Math.round(c)))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;

/**
 * Perceptual distance between two colours.
 *
 * Redmean — a weighted Euclidean distance that tracks human perception far
 * better than raw RGB and costs a fraction of a full CIE conversion. Plain RGB
 * distance was tried first and reported navy and black as further apart than
 * two visibly different greens, which made the tolerance setting meaningless.
 *
 * Scaled so the numbers read like the 0–100 range people expect from a
 * "percent different" control rather than the 0–765 a raw sum produces.
 */
export const colourDistance = (a: Rgb, b: Rgb): number => {
  const rMean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  const weighted =
    (2 + rMean / 256) * dr * dr +
    4 * dg * dg +
    (2 + (255 - rMean) / 256) * db * db;
  // sqrt of the weighted sum maxes out near 765; /7.65 puts it on 0–100.
  return Math.sqrt(weighted) / 7.65;
};

export interface NearestMatch {
  distance: number;
  entry: PaletteEntry | null;
}

/**
 * The palette entry a colour is closest to, and how far off it is.
 *
 * A null entry means the palette held nothing usable — not that the colour
 * matched. The caller has to tell those apart, which is why this returns the
 * entry rather than a boolean.
 */
export const nearestPaletteEntry = (
  hex: string,
  palette: readonly PaletteEntry[]
): NearestMatch => {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return { distance: Number.POSITIVE_INFINITY, entry: null };
  }
  let best: PaletteEntry | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of palette) {
    const candidate = hexToRgb(entry.value);
    if (!candidate) {
      continue;
    }
    const distance = colourDistance(rgb, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }
  return { distance: bestDistance, entry: best };
};

/**
 * The measured pass: every dominant colour weighed against the palette.
 *
 * An empty palette produces one `warn` saying so, **not** a pass. A kit that
 * defines no colours cannot approve colours, and silently passing everything is
 * how a check becomes theatre — the exact failure this feature exists to end.
 */
export const measureColours = (
  dominant: readonly string[],
  palette: readonly PaletteEntry[],
  tolerance = DEFAULT_TOLERANCE
): Finding[] => {
  if (palette.length === 0) {
    return [
      {
        detail:
          "No palette defined on this brand kit, so colour was not checked.",
        kind: "palette",
        severity: "warn",
        source: "measured",
      },
    ];
  }
  const findings: Finding[] = [];
  for (const hex of dominant) {
    const { distance, entry } = nearestPaletteEntry(hex, palette);
    if (!entry) {
      continue;
    }
    if (distance <= tolerance) {
      findings.push({
        detail: `${hex} matches ${entry.name} ${entry.value}.`,
        expected: entry.value,
        found: hex,
        kind: "palette",
        severity: "pass",
        source: "measured",
      });
      continue;
    }
    findings.push({
      detail: `${hex} is ${distance.toFixed(1)} from the nearest palette entry ${entry.name} ${entry.value}.`,
      expected: entry.value,
      found: hex,
      kind: "palette",
      severity: "fail",
      source: "measured",
    });
  }
  return findings;
};

/**
 * Whether a set of findings amounts to a pass.
 *
 * Any `fail` fails. A `warn` does not — it is the check saying it could not
 * look, and refusing an asset because the kit was incomplete would punish the
 * wrong person.
 */
export const scoreVerdict = (findings: readonly Finding[]): Verdict => ({
  findings: [...findings],
  passed: !findings.some((finding) => finding.severity === "fail"),
});
