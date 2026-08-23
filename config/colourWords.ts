import { colourDistance, hexToRgb, type Rgb } from "./brandCheck.js";

/**
 * Colours as words, because a hex code in a prompt gets drawn.
 *
 * `using only these colors: #2e84f5, #ffcd75` was going into prompts verbatim,
 * and the models that are good at text obliged: pictures came back with the hex
 * strings lettered across them. It is an obvious failure in hindsight — a prompt
 * is a description, and `#2e84f5` is a string of characters before it is a
 * colour.
 *
 * Naming them is also simply better instruction. Diffusion models have no
 * reliable notion of a hex triplet; "bright blue" is a concept they have seen a
 * million times and `#2e84f5` is not. The exact value still reaches the one
 * place it can be honoured exactly — `color_palette` on the endpoints that take
 * it, and the compositor for a logo — so nothing is lost by describing it here.
 *
 * Dependency-free, in config/, so the panel can show what a kit will say and the
 * run path can send it.
 */

/** HSL, with hue in degrees and the rest as fractions. */
interface Hsl {
  h: number;
  l: number;
  s: number;
}

const toHsl = ({ b, g, r }: Rgb): Hsl => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const span = max - min;
  if (span === 0) {
    return { h: 0, l, s: 0 };
  }
  const s = l > 0.5 ? span / (2 - max - min) : span / (max + min);
  let h: number;
  if (max === rn) {
    h = ((gn - bn) / span + (gn < bn ? 6 : 0)) * 60;
  } else if (max === gn) {
    h = ((bn - rn) / span + 2) * 60;
  } else {
    h = ((rn - gn) / span + 4) * 60;
  }
  return { h, l, s };
};

/**
 * Hue names, as bands.
 *
 * Common words rather than precise ones: "vermilion" is more accurate than
 * "orange" and much less useful to a model. Each entry is the upper bound of its
 * band, walked in order, so the table reads as the colour wheel does.
 */
const HUES: readonly { name: string; upTo: number }[] = [
  { name: "red", upTo: 12 },
  { name: "orange", upTo: 38 },
  { name: "amber", upTo: 52 },
  { name: "yellow", upTo: 66 },
  { name: "lime", upTo: 90 },
  { name: "green", upTo: 150 },
  { name: "teal", upTo: 175 },
  { name: "cyan", upTo: 195 },
  { name: "blue", upTo: 250 },
  { name: "indigo", upTo: 275 },
  { name: "violet", upTo: 290 },
  { name: "purple", upTo: 320 },
  { name: "magenta", upTo: 340 },
  { name: "pink", upTo: 352 },
  // Wraps back to red.
  { name: "red", upTo: 361 },
];

const hueName = (h: number): string => {
  const wrapped = ((h % 360) + 360) % 360;
  return HUES.find((band) => wrapped < band.upTo)?.name ?? "red";
};

/**
 * A colour with almost no saturation is a neutral, and naming its hue is a lie.
 *
 * "very dark blue" for #1a1a1c is both wrong and misleading — a model will
 * produce something visibly blue. The greys get their own vocabulary.
 */
const NEUTRAL_SATURATION = 0.12;

const neutralName = (l: number): string => {
  if (l < 0.06) {
    return "black";
  }
  if (l < 0.2) {
    return "near-black";
  }
  if (l < 0.38) {
    return "charcoal";
  }
  if (l < 0.62) {
    return "mid grey";
  }
  if (l < 0.82) {
    return "light grey";
  }
  if (l < 0.96) {
    return "off-white";
  }
  return "white";
};

/**
 * One colour, described.
 *
 * Lightness first, then saturation, then hue — "pale muted blue" — which is the
 * order English puts them in and so the order a model has seen them in.
 */
export const describeColour = (hex: string): string | null => {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return null;
  }
  const { h, l, s } = toHsl(rgb);

  if (s < NEUTRAL_SATURATION) {
    return neutralName(l);
  }

  const parts: string[] = [];
  const pale = l > 0.72;
  if (l < 0.22) {
    parts.push("very dark");
  } else if (l < 0.4) {
    parts.push("dark");
  } else if (l > 0.88) {
    parts.push("very pale");
  } else if (pale) {
    parts.push("pale");
  }

  /*
   * Saturation, only where it is worth a word — and never alongside "pale".
   *
   * HSL reports a high saturation for light pastels, so #ffcd75 came out as
   * "pale vivid amber": two words that contradict each other and describe
   * nothing a model can act on. Lightness has already said the useful half for
   * those, so saturation is left to the mid range where it distinguishes a
   * muted olive from a bright green.
   */
  if (!pale && l >= 0.22) {
    if (s < 0.3) {
      parts.push("muted");
    } else if (s > 0.85) {
      parts.push("vivid");
    }
  }

  parts.push(hueName(h));
  return parts.join(" ");
};

/**
 * How different two colours must be to be worth naming separately.
 *
 * On the same redmean scale `brandCheck` uses, and deliberately small: the
 * choice of *word* does most of the collapsing, since two colours that describe
 * the same way are the same instruction however far apart they measure. This
 * only catches the near-identical pairs a tokens file is full of — three steps
 * of one blue, a hairline apart — that happen to land on different words.
 *
 * It started at 40, which measured half a brand's palette as duplicates: nine
 * genuinely different hues came out as three. Distance is the wrong primary
 * test for "would a model be told anything new".
 */
const DISTINCT_ENOUGH = 12;

/**
 * The most a described palette will list.
 *
 * Six is already more than a model will hold. A tokens file can easily produce
 * twenty-four, and a prompt ending in a wall of colour names crowds out the
 * subject — which is the other half of why pictures were coming back wrong.
 */
export const MAX_DESCRIBED = 6;

/**
 * A palette as a phrase, keeping the colours that differ from each other.
 *
 * Order is preserved rather than sorted: a brand lists its primary first, and
 * that is the one a model should weigh most.
 */
export const describePalette = (hexes: readonly string[]): string => {
  const kept: { rgb: Rgb; word: string }[] = [];
  for (const hex of hexes) {
    if (kept.length >= MAX_DESCRIBED) {
      break;
    }
    const rgb = hexToRgb(hex);
    const word = describeColour(hex);
    if (!(rgb && word)) {
      continue;
    }
    // The word first, because two colours described alike are one instruction
    // however far apart they measure — "blue, blue" reads as emphasis nobody
    // asked for. Then distance, for near-identical values that name differently.
    const alreadySaid = kept.some((seen) => seen.word === word);
    const tooClose = kept.some(
      (seen) => colourDistance(seen.rgb, rgb) < DISTINCT_ENOUGH
    );
    if (alreadySaid || tooClose) {
      continue;
    }
    kept.push({ rgb, word });
  }
  return kept.map((entry) => entry.word).join(", ");
};
