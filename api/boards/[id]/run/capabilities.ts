import sharp from "sharp";
import type { FalModelDef } from "../../../../config/falModels.js";
import { isVectorModel } from "../../../../config/falModels.js";
import { ICON_STYLES, isIconStyle } from "../../../../config/iconStyles.js";
import type { NodeCapability } from "../../../../config/nodeTypes.js";
import {
  describeImage,
  generateImage,
  isFalConfigured,
} from "../../../_lib/fal.js";
import { parsePublicHttpUrl } from "../../../_lib/httpUrl.js";
import { generateIcon, isMagnificConfigured } from "../../../_lib/magnific.js";
import { persistBytes } from "../../../_lib/persistGenerated.js";
import { getSite } from "../../../_lib/site.js";
import type { RunnableItem } from "./inputs.js";
import { HTTP_SCHEME } from "./refusals.js";
import { type Prepared, refuse } from "./replies.js";

/**
 * Where a node type becomes a third-party call.
 *
 * The only such place, deliberately: adding a capability is an entry in
 * config/nodeTypes.ts plus a branch here — no schema change, no wire model
 * change, nothing in the canvas. Every branch copies its output into blob
 * storage before returning, so a result is durable by the time it leaves.
 */

/** Matches an SVG by extension, ignoring any query string. */
export const SVG_URL = /\.svg(\?|$)/i;

/** Rasterized copies, keyed by the SVG URL they were made from. */
export const RASTER_CACHE = new Map<string, string>();

/**
 * The PNG an SVG becomes, so an image model can read it.
 *
 * fal's image models read pixels, not vectors — and this app makes plenty of
 * vectors: Recraft's vector models, the icon generator, and every Affinity edit
 * synced back onto a board. Those used to be refused or dropped the moment one
 * reached an image model, which stranded any frame that contained a single
 * vector. Instead the SVG is rasterized here, at the moment it is consumed,
 * into a PNG stored like any generated file. The cache just spares a warm
 * function re-rendering the same SVG for every job of a batch.
 */
export const rasterizeSvgUrl = async (url: string): Promise<string> => {
  const cached = RASTER_CACHE.get(url);
  if (cached) {
    return cached;
  }
  const fetched = await fetch(url);
  if (!fetched.ok) {
    throw new Error(
      `Could not download the SVG to rasterize (${fetched.status})`
    );
  }
  const svg = Buffer.from(await fetched.arrayBuffer());
  const png = await sharp(svg, { density: 96 })
    // Bounded for fal's sake, never enlarged: a poster-sized vector should not
    // arrive as a four-thousand-pixel raster.
    .resize({
      fit: "inside",
      height: 2048,
      width: 2048,
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  const stored = await persistBytes(png, "boards/ai", "image/png");
  RASTER_CACHE.set(url, stored);
  return stored;
};

/**
 * What a run produced.
 *
 * Two shapes, because not every node makes a picture. The Analyse node reads an
 * image and writes words, and those words are the thing that travels down its
 * wire — so a result is either an image or a piece of text, and everything
 * downstream reads whichever it has.
 */
export type Produced =
  | {
      description: string | null;
      height: number | null;
      /** Null when the concept does not apply — every raster generator. */
      isVector: boolean | null;
      kind: "image";
      url: string;
      width: number | null;
    }
  | { kind: "text"; text: string };

/**
 * Dispatches to the generator a node type declares.
 *
 * The only place a node type turns into a third-party call, so adding one is an
 * entry in config/nodeTypes.ts plus a branch here — no schema change, no wire
 * model change, nothing in the canvas. `models` is the list the picker was
 * built from, so the vector claim and the fal call agree with the board.
 *
 * Both generators copy their output into blob storage before returning, so a
 * result is durable by the time it reaches here.
 */
export const produce = async (
  capability: NodeCapability,
  models: readonly FalModelDef[],
  args: {
    item: RunnableItem;
    /** "auto" (or absent) keeps fal.ts's own image-present switch. */
    model: string | null;
    prompt: string;
    /** Confines the repaint to part of the picture. See maskByUrl. */
    sourceMaskUrl: string | null;
    sourceImageUrl: string | null;
    /** Every wired image, for the one capability that reads them together. */
    sourceImageUrls: string[];
  }
): Promise<Produced> => {
  if (capability === "fal.describe") {
    if (args.sourceImageUrls.length === 0) {
      throw new Error("Analyse needs an image wired into it");
    }
    const focus =
      typeof args.item.config.focus === "string"
        ? args.item.config.focus
        : "style";
    return {
      kind: "text",
      text: await describeImage(args.sourceImageUrls, focus, args.prompt),
    };
  }

  if (capability === "board.composite") {
    // Rendered in the browser, which is the only place that knows where the
    // pictures sit — this stores what it produced so the node gets a result,
    // a history and a thumbnail like every other node. The canvas clears the
    // URL on any edit, so one that survived to here is current.
    const raw = args.item.config.compositeUrl;
    // Checked like any other URL that leaves here, even though the canvas only
    // ever writes our own blob storage into it: this value arrives through a
    // board save, and a saved board is caller-supplied data.
    const url =
      typeof raw === "string" && HTTP_SCHEME.test(raw)
        ? parsePublicHttpUrl(raw)
        : null;
    if (!url) {
      throw new Error("The composite has not been rendered yet");
    }
    return {
      description: null,
      height: null,
      isVector: null,
      kind: "image",
      url,
      width: null,
    };
  }

  if (capability === "magnific.icon") {
    const style = isIconStyle(args.item.config.style)
      ? args.item.config.style
      : ICON_STYLES[0];
    // Required by every Magnific endpoint even though this polls for the
    // result, so it points at our own sink — exactly as api/ai/icon.ts does.
    const site = getSite();
    const icon = await generateIcon(
      args.prompt,
      style,
      `https://${site.domain}/api/ai/icon-webhook`
    );
    return {
      description: null,
      height: null,
      isVector: icon.isVector,
      kind: "image",
      url: icon.url,
      width: null,
    };
  }

  // An image model reads pixels, and a wired SVG is not pixels — rasterize it
  // first. Raster sources pass through untouched, and Analyse above never gets
  // here (its vision model reads SVG fine, so it needs no conversion).
  const sourceImageUrl =
    args.sourceImageUrl && SVG_URL.test(args.sourceImageUrl)
      ? await rasterizeSvgUrl(args.sourceImageUrl)
      : args.sourceImageUrl;
  const image = await generateImage(
    args.prompt,
    sourceImageUrl,
    args.model,
    args.sourceMaskUrl
  );
  return {
    description: image.description,
    height: image.height,
    // Taken from the model's own entry rather than guessed from the file: the
    // node shows a "came back as a raster" warning, and an SVG mislabelled as
    // raster would raise it for no reason.
    isVector: isVectorModel(models, args.model) ? true : null,
    kind: "image",
    url: image.url,
    width: image.width,
  };
};

/**
 * The refusal for a capability whose provider has no key, or null when there is
 * nothing in the way.
 *
 * A composite is assembled in the browser and merely stored here, so neither
 * provider needs to be configured for one to run — which is why this asks per
 * capability rather than checking both up front.
 */
export const unconfiguredProvider = (
  capability: NodeCapability
): Prepared | null => {
  if (capability === "fal.image" && !isFalConfigured()) {
    return refuse(503, {
      error:
        "Image generation is not configured. Set FAL_API_KEY on the project.",
    });
  }
  if (capability === "magnific.icon" && !isMagnificConfigured()) {
    return refuse(503, {
      error:
        "Icon generation is not configured. Set MAGNIFIC_API_KEY on the project.",
    });
  }
  return null;
};
