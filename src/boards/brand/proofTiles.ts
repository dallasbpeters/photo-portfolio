import type { BrandKitDoc } from "../../../config/brandKit.js";

/**
 * What a proof board is made of.
 *
 * The plan only — what to draw, at what size, on what ground, and what each
 * tile is for. Drawing is somebody else's job, and keeping the two apart is
 * what makes the interesting half testable: whether a kit with no palette
 * still produces a useful sheet, whether the scale ramp actually straddles
 * the declared floor, whether a fault has somewhere to be reported.
 *
 * Every tile here draws from the mark and the kit alone. Nothing is generated,
 * nothing is billed, and nothing can be hallucinated — which is the point. A
 * proof sheet exists to be trusted, and the cheapest way to be trusted is to
 * only ever state what was measured.
 *
 * The mockups — on a photograph, a billboard, a cap, a lanyard — are
 * deliberately not here. They need a model, they cost money, and they prove
 * something softer: that the mark looks nice somewhere. These prove it works.
 */

/**
 * The sizes a mark is actually met at.
 *
 * Real placements rather than a neat progression: a favicon is 16, an iOS
 * icon is 180, a browser tab on a retina screen is 32. A ramp of powers of two
 * would look tidier and test nothing anybody ships.
 */
export const PLACEMENT_SIZES: readonly { label: string; px: number }[] = [
  { label: "Favicon", px: 16 },
  { label: "Favicon @2x", px: 32 },
  { label: "Avatar", px: 48 },
  { label: "Toolbar", px: 64 },
  { label: "App icon", px: 180 },
  { label: "Full", px: 512 },
];

export type TileKind =
  | "clearspace"
  | "contrast"
  | "greyscale"
  | "ground"
  | "outline"
  | "scale"
  | "squint";

export interface ProofTile {
  /** The colour behind the mark, when the tile has an opinion about one. */
  background?: string;
  /** Blur radius in pixels, for the squint test. */
  blur?: number;
  /** What this tile is asking, in the words a finding would use. */
  caption: string;
  kind: TileKind;
  label: string;
  /** The placement sizes this tile renders, for the scale ramp. */
  sizes?: readonly { label: string; px: number }[];
}

/** Black and white, which every mark has to survive before anything else. */
const MONO_GROUNDS = ["#ffffff", "#000000"];

/**
 * How blurred the squint test is.
 *
 * The oldest test in the trade, and the one that catches what staring cannot:
 * defocus a mark and what remains is its silhouette. A logo whose shape only
 * works at full attention fails here, which is what happens to it on a shelf,
 * in a feed, or at forty miles an hour.
 */
const SQUINT_BLUR = 6;

/**
 * The tiles for one mark under one kit.
 *
 * Order is the order they are read in, and it is deliberate: the two tests a
 * mark must not fail come first — does it hold at the sizes it will actually
 * be met at, and does it survive with the colour taken away — before anything
 * about this particular brand's palette.
 *
 * A kit with no palette still gets a full sheet, minus the palette tiles. The
 * commonest moment to want a proof sheet is before the kit is finished, and a
 * sheet that refuses to render until every field is filled would be useless
 * exactly then.
 */
export const proofTilesFor = (doc: BrandKitDoc): ProofTile[] => {
  const tiles: ProofTile[] = [
    {
      caption:
        "The mark at the sizes it is actually met at. The line marks the width the kit declares it stops being legible below.",
      kind: "scale",
      label: "Scale",
      sizes: PLACEMENT_SIZES,
    },
    {
      caption:
        "Colour removed. A mark that needs its palette to read is a mark that fails in print, in a fax, and on a laser printer.",
      kind: "greyscale",
      label: "Greyscale",
    },
    {
      blur: SQUINT_BLUR,
      caption:
        "Defocused. What is left is the silhouette — which is what a mark is at distance, in a feed, or at speed.",
      kind: "squint",
      label: "Squint",
    },
    {
      caption:
        "The padding already in the file, against the clear space the kit asks for.",
      kind: "clearspace",
      label: "Clear space",
    },
    {
      caption:
        "The outline alone, with the artwork's own bounding box. A mark that does not fill its file arrives smaller than it was placed.",
      kind: "outline",
      label: "Outline",
    },
  ];

  for (const background of MONO_GROUNDS) {
    tiles.push({
      background,
      caption:
        background === "#000000"
          ? "On black. Half of everywhere a mark lands is dark now."
          : "On white, which is the ground every mark is drawn against and the one it is least often placed on.",
      kind: "ground",
      label: background === "#000000" ? "On black" : "On white",
    });
  }

  /*
   * Every colour the brand actually owns.
   *
   * The pairs nobody checks: a mark legible on white and invisible on the
   * brand's own second colour is a fault in the palette rather than in the
   * mark, and it is only ever found after something is printed.
   */
  for (const entry of doc.palette) {
    tiles.push({
      background: entry.value,
      caption: `On ${entry.name || entry.value}${entry.role ? ` — the brand's ${entry.role}` : ""}. Contrast is measured, not judged.`,
      kind: "contrast",
      label: entry.name || entry.value,
    });
  }

  return tiles;
};
