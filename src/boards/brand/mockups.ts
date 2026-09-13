/**
 * Flat surfaces to put a mark on, drawn rather than generated.
 *
 * The six remaining tiles were going to be generated — a billboard, a cap, a
 * lanyard — and that was the wrong instinct. A proof sheet exists to be
 * trusted, and asking "does my mark survive a real sign" while showing a sign
 * a model invented undermines the only thing the sheet is for. It also costs
 * money per run and answers differently each time.
 *
 * So they are drawn from config. Each is a ground, a surface with a little
 * shading on it, and a box the mark goes in — which means adding one is four
 * numbers and a colour rather than a code change, and swapping in a real
 * photograph later is changing `image` on the entry without touching anything
 * that draws.
 *
 * Only flat surfaces here. A cap or a lanyard needs the artwork warped to
 * follow fabric, which is a displacement map rather than a rectangle, and
 * pretending a flat paste is a cap would be its own kind of dishonest.
 */

export interface Mockup {
  /** The scene behind the surface. */
  backdrop: string;
  caption: string;
  /** The ink the mark is drawn in on this surface. */
  ink: string;
  label: string;
  /** Where the mark goes inside the surface, as a fraction of the surface. */
  mark: { h: number; w: number; x: number; y: number };
  /** A band of shade across the surface, for the ones that are lit. */
  shade?: number;
  /** What the mark sits on, as a fraction of the tile. */
  surface: { colour: string; h: number; w: number; x: number; y: number };
}

/**
 * The surfaces, smallest commitment first.
 *
 * Each asks something the flat tiles cannot. A sign is the mark at distance
 * with sky behind it. A screen is the mark surrounded by interface rather than
 * white space. Packaging is the mark on a colour it did not choose, with an
 * edge running near it.
 */
export const MOCKUPS: readonly Mockup[] = [
  {
    backdrop: "#b9cbd8",
    caption:
      "On a sign, at the size it is read from across a street. The first test a fine line fails.",
    ink: "#101a2b",
    label: "Signage",
    mark: { h: 0.5, w: 0.7, x: 0.15, y: 0.25 },
    shade: 0.12,
    surface: { colour: "#f4f4f2", h: 0.4, w: 0.76, x: 0.12, y: 0.22 },
  },
  {
    backdrop: "#1b1b1e",
    caption:
      "On a screen, surrounded by interface rather than by white space. Most marks are met here first.",
    ink: "#ffffff",
    label: "Screen",
    mark: { h: 0.22, w: 0.44, x: 0.28, y: 0.12 },
    surface: { colour: "#2b2f36", h: 0.66, w: 0.44, x: 0.28, y: 0.17 },
  },
  {
    backdrop: "#ded9d0",
    caption:
      "On packaging, in a colour the mark did not choose, with an edge running close to it.",
    ink: "#ffffff",
    label: "Packaging",
    mark: { h: 0.3, w: 0.6, x: 0.2, y: 0.2 },
    shade: 0.2,
    surface: { colour: "#7a4a3c", h: 0.58, w: 0.5, x: 0.25, y: 0.21 },
  },
  {
    backdrop: "#c8c8c4",
    caption:
      "On a document, at the size it prints. Small, near a fold, with words below it.",
    ink: "#101a2b",
    label: "Print",
    mark: { h: 0.12, w: 0.3, x: 0.08, y: 0.07 },
    surface: { colour: "#ffffff", h: 0.78, w: 0.56, x: 0.22, y: 0.11 },
  },
];
