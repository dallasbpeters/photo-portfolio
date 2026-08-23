import sharp from "sharp";
import type { FalModelDef } from "../../../../config/falModels.js";
import { isVectorModel } from "../../../../config/falModels.js";
import { ICON_STYLES, isIconStyle } from "../../../../config/iconStyles.js";
import { MAX_LOOPS } from "../../../../config/nodes/generation.js";
import type { NodeCapability } from "../../../../config/nodeTypes.js";
import type { BrandLogo } from "../../../_lib/brandLogo.js";
import { stampLogo } from "../../../_lib/brandStamp.js";
import {
  describeImage,
  generateImage,
  isFalConfigured,
} from "../../../_lib/fal.js";
import { generateIcon, isMagnificConfigured } from "../../../_lib/magnific.js";
import { persistBytes } from "../../../_lib/persistGenerated.js";
import { getSite } from "../../../_lib/site.js";
import { browserRendered } from "./browserRendered.js";
import type { RunnableItem } from "./inputs.js";
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
      /**
       * Why the brand's logo is not on this picture, when one was asked for.
       *
       * Separate from `runError` because the run did not fail: the picture was
       * generated and billed, and only the stamp is missing. Reported so the
       * node can say so rather than leaving somebody to notice.
       */
      logoWarning?: string | null;
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

/**
 * How many passes over its own output this node makes.
 *
 * Clamped rather than trusted: the value arrives from a stored config that a
 * board save wrote, and every pass is a billed generation. One on anything
 * unreadable, which is the behaviour that existed before loops did.
 */
const loopsOf = (config: Record<string, unknown>): number => {
  const raw = Number(config.loops);
  if (!Number.isFinite(raw) || raw < 1) {
    return 1;
  }
  return Math.min(Math.floor(raw), MAX_LOOPS);
};

/**
 * The generation parameters, read off the node's config.
 *
 * Passed through as strings without validation here on purpose — fal.ts decides
 * what a value means and, more importantly, whether the endpoint being called
 * accepts the field at all. Checking the vocabulary twice would put the list in
 * two places, and the copy here would be the one to go stale.
 */
const generationParams = (config: Record<string, unknown>) => ({
  outputFormat:
    typeof config.outputFormat === "string" ? config.outputFormat : null,
  quality: typeof config.quality === "string" ? config.quality : null,
  size: typeof config.size === "string" ? config.size : null,
});

/** Analyse's branch: reads the wired images and returns words, not a picture. */
const described = async (
  item: RunnableItem,
  sourceImageUrls: string[],
  prompt: string
): Promise<Produced> => {
  if (sourceImageUrls.length === 0) {
    throw new Error("Analyse needs an image wired into it");
  }
  const focus =
    typeof item.config.focus === "string" ? item.config.focus : "style";
  return {
    kind: "text",
    text: await describeImage(sourceImageUrls, focus, prompt),
  };
};

/** The icon generator's branch. */
const iconGenerated = async (
  item: RunnableItem,
  prompt: string
): Promise<Produced> => {
  const style = isIconStyle(item.config.style)
    ? item.config.style
    : ICON_STYLES[0];
  // Required by every Magnific endpoint even though this polls for the
  // result, so it points at our own sink — exactly as api/ai/icon.ts does.
  const site = getSite();
  const icon = await generateIcon(
    prompt,
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
};

/**
 * The stamped picture, or the original plus the reason it is unstamped.
 *
 * A failure here does not fail the run — see the call site.
 */
const stampedWith = async (
  url: string,
  brandLogo: BrandLogo
): Promise<{ url: string; warning: string | null }> => {
  try {
    const result = await stampLogo(url, brandLogo);
    return { url: result.url, warning: result.warning ?? null };
  } catch (e) {
    return {
      url,
      warning:
        e instanceof Error
          ? `The logo could not be added: ${e.message}`
          : "The logo could not be added.",
    };
  }
};

/**
 * Whether to claim the result is a vector.
 *
 * Taken from the model's own entry rather than guessed from the file: the node
 * shows a "came back as a raster" warning, and an SVG mislabelled as raster
 * would raise it for no reason. Never a vector once a logo has been stamped:
 * the composite is a PNG whatever the model returned, and claiming otherwise
 * would raise that same notice on a file that is correctly a raster.
 */
const vectorClaim = (
  models: readonly FalModelDef[],
  model: string | null,
  wasStamped: boolean
): boolean | null => {
  if (wasStamped) {
    return null;
  }
  return isVectorModel(models, model) ? true : null;
};

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
    /**
     * A wired Brand node's logo, stamped onto the finished picture.
     *
     * Composited rather than described: asked to draw a logo a model redraws it,
     * which is the failure a brand kit exists to prevent. See brandLogo.ts.
     */
    brandLogo?: BrandLogo | null;
    /**
     * The exact colours a wired Brand or Palette node is asking for.
     *
     * Hex, because `color_palette` wants numbers — the prompt beside it
     * describes the same palette in words, since a hex code in a prompt gets
     * lettered onto the picture.
     */
    palette?: readonly string[];
    /** Which of a batch this run is, for the capabilities that fan out. */
    variation?: number;
  }
): Promise<Produced> => {
  if (capability === "board.composite") {
    return browserRendered(
      args.item.config,
      "compositeUrl",
      "The composite has not been rendered yet"
    );
  }
  if (capability === "board.shader") {
    return browserRendered(
      args.item.config,
      "renderUrl",
      "This shader has not been rendered yet",
      args.variation,
      "renderUrls"
    );
  }
  if (capability === "fal.describe") {
    return described(args.item, args.sourceImageUrls, args.prompt);
  }

  if (capability === "magnific.icon") {
    return iconGenerated(args.item, args.prompt);
  }

  // An image model reads pixels, and a wired SVG is not pixels — rasterize it
  // first. Raster sources pass through untouched, and Analyse above never gets
  // here (its vision model reads SVG fine, so it needs no conversion).
  const sourceImageUrl =
    args.sourceImageUrl && SVG_URL.test(args.sourceImageUrl)
      ? await rasterizeSvgUrl(args.sourceImageUrl)
      : args.sourceImageUrl;

  const params = {
    ...generationParams(args.item.config),
    palette: args.palette ?? [],
  };
  const loops = loopsOf(args.item.config);

  /*
   * The loop: each pass reworks what the last one made.
   *
   * Sequential because it has to be — pass two's source image is pass one's
   * result, so there is nothing to parallelise. Only the final picture is
   * returned; the passes in between are rungs on the way, and keeping them
   * would fill the node's version strip with drafts nobody asked for.
   *
   * The mask applies to the first pass only. It was drawn over the picture that
   * was wired in, and after one pass that picture no longer exists — the same
   * pixels are somewhere else, so continuing to apply it would confine each
   * pass to a region chosen for a different image.
   */
  let image = await generateImage(
    args.prompt,
    sourceImageUrl,
    args.model,
    args.sourceMaskUrl,
    params
  );
  for (let pass = 1; pass < loops; pass += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each pass needs the last one's picture — see above
    image = await generateImage(
      args.prompt,
      image.url,
      args.model,
      null,
      params
    );
  }

  /*
   * The brand's mark, stamped on last.
   *
   * After the loop rather than inside it: a logo composited on pass one would
   * be fed back in as pass two's source image, and the model would then treat
   * it as part of the picture to rework — smearing the exact mark the stamp
   * exists to preserve.
   *
   * A failure here does not fail the run. The picture is generated and paid for
   * either way, and losing it over a stamp would throw away the expensive half;
   * the warning travels back so the node can say the logo is missing.
   */
  let stamped = image.url;
  let logoWarning: string | null = null;
  if (args.brandLogo) {
    const result = await stampedWith(image.url, args.brandLogo);
    stamped = result.url;
    logoWarning = result.warning;
  }

  return {
    description: image.description,
    height: image.height,
    isVector: vectorClaim(
      models,
      args.model,
      Boolean(args.brandLogo) && stamped !== image.url
    ),
    kind: "image",
    logoWarning,
    url: stamped,
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
