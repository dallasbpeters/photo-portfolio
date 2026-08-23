import sharp from "sharp";
import { logoBox } from "../../config/nodes/logoPlacement.js";
import type { BrandLogo } from "./brandLogo.js";
import { persistBytes } from "./persistGenerated.js";

/**
 * Stamping a brand's logo onto a picture after it has been generated.
 *
 * The whole point is that the mark is *not* drawn by a model. Asked to place a
 * logo, an image model redraws it — different letterforms, a warped device,
 * colours it preferred — and that is precisely the failure a brand kit exists to
 * prevent. So the picture is generated from the prompt, and then the logo file is
 * composited onto it, pixel for pixel.
 *
 * It also means the clear space and minimum width the kit stores against each
 * logo become real. Sent to a model they are prose it may ignore; here they are
 * arithmetic — see logoBox, which will not draw a mark smaller than the brand
 * allows and refuses outright when the margin will not fit.
 *
 * Runs after `generateImage`, which has already copied its output to our blob
 * host. That costs one extra download of a picture we just stored, and buys a
 * composite step that cannot corrupt the original: a failure here leaves the
 * generated picture exactly as it was.
 *
 * Separate from brandLogo.ts because `sharp` is a native module: importing it
 * cannot happen in the browser the tests run in, and the wire-reading next door
 * is worth testing.
 */

const download = async (url: string, what: string): Promise<Buffer> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not download the ${what} (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
};

/**
 * Puts the logo on the picture and stores the result.
 *
 * Returns the original URL untouched when the mark cannot be placed — a picture
 * without its logo is still the picture somebody paid for, and failing the whole
 * run over a stamp would throw away a generation that succeeded. The caller
 * reports what happened; see the notice on the node.
 *
 * The logo is rasterised through sharp at the size it will be drawn rather than
 * scaled after the fact, so an SVG wordmark stays crisp instead of being
 * resampled twice. `density` is raised for the same reason rasterizeSvgUrl
 * raises it: sharp renders SVG at 72dpi by default, which for a small target
 * width produces a blurry mark.
 */
export const stampLogo = async (
  imageUrl: string,
  logo: BrandLogo
): Promise<{ url: string; warning?: string }> => {
  const [picture, mark] = await Promise.all([
    download(imageUrl, "generated picture"),
    download(logo.url, "logo"),
  ]);

  const base = sharp(picture);
  const meta = await base.metadata();
  // SVG has no intrinsic pixel size worth trusting, so the mark's proportions
  // are read from a render rather than from its metadata.
  const markMeta = await sharp(mark, { density: 300 }).metadata();

  const box = logoBox({
    clearSpace: logo.clearSpace,
    imageHeight: meta.height ?? 0,
    imageWidth: meta.width ?? 0,
    logoHeight: markMeta.height ?? 0,
    logoWidth: markMeta.width ?? 0,
    minWidth: logo.minWidth,
    placement: logo.placement,
    widthPercent: logo.widthPercent,
  });

  if (!box) {
    return {
      url: imageUrl,
      warning:
        "The logo did not fit with the clear space the brand kit asks for, so it was left off.",
    };
  }

  const resized = await sharp(mark, { density: 300 })
    .resize({ fit: "inside", height: box.height, width: box.width })
    .png()
    .toBuffer();

  const composited = await base
    .composite([{ input: resized, left: box.left, top: box.top }])
    // PNG throughout: the mark usually has an alpha channel, and flattening it
    // onto a JPEG would put a white rectangle behind a transparent logo.
    .png()
    .toBuffer();

  return {
    url: await persistBytes(composited, "boards/ai", "image/png"),
  };
};
