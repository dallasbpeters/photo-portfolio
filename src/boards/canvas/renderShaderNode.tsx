import { Halftone, ImageTexture, Shader, SolidColor } from "shaders/react";
import { renderOffscreen } from "./renderOffscreen";

/**
 * Rendering a Halftone node to a file, away from the board.
 *
 * The stack is the one from shaders.com, copied rather than reinvented:
 *
 *   <Shader>
 *     <SolidColor color=… id=… />
 *     <Halftone angle=… frequency=…>
 *       <ImageTexture maskSource=… url=… />
 *     </Halftone>
 *   </Shader>
 *
 * **The SolidColor is the whole trick, and it is the ink rather than the
 * paper.** Halftone's classic shader returns `childColor * dotPattern` with the
 * alpha multiplied too, so the dots are a hole punched through the picture: dot
 * coverage rises with brightness, and what shows through the gaps is whatever
 * sibling sits behind. Behind nothing, the dark half of a photograph resolves
 * to the page and the export comes out pale and inverted — a black subject
 * rendering as blank was this node's defining bug. Behind a dark SolidColor,
 * the same shader is a duotone halftone: shadows become ink, highlights keep
 * the picture's own light tones.
 *
 * The light end is not a setting, and two attempts to make it one both failed
 * in the same way. Classic sizes every dot from the brightness of what it is
 * given, so mapping the picture to two chosen colours *before* the screen
 * flattens the dots along with the tones — a full ramp came out a solid block —
 * and mapping it afterwards crushes it just as hard, because by then coverage
 * is the only signal left. Both were rendered and looked at rather than
 * reasoned about, and both are worse than the picture's own highlights.
 *
 * Everything else that was blamed for it turned out not to matter. Rendered
 * side by side, `maskSource` and `boundingBox` changed nothing at all — the
 * ground is full-frame, so masking to it is a no-op — and an earlier attempt
 * that did add a SolidColor still looked washed out only because the colour
 * chosen was cream: light ink on light paper.
 *
 * Mounted offscreen rather than captured from the node on the canvas — see
 * renderOffscreen. The frame takes the picture's own aspect, so the whole of it
 * fills the whole of the output rather than being contained into a column.
 */

/**
 * The long edge of an export, and the ceiling the library actually honours.
 *
 * Asking for 2400 does not get 2400. Every render goes through the engine's
 * `clampToTextureCap`, which is
 *
 *   const capW = Math.min(w, env.viewportWidth, gpuCssCap)
 *
 * — the drawing is clamped to the *browser window's* inner size however large
 * the element it is mounted in. A 2400px request in a 1440px window draws 1440
 * real pixels and upscales the rest. Measured rather than assumed: a 600x400
 * host in a 414px-wide window produced a 414x276 canvas. So the request is
 * clamped honestly instead of carrying a size the file never had.
 */
const LONG_EDGE = 2400;

const longEdge = (): number =>
  Math.max(
    600,
    Math.min(
      LONG_EDGE,
      window.innerWidth || LONG_EDGE,
      window.innerHeight || LONG_EDGE
    )
  );

/** The ground's handle, so the texture above it can name it. */
const GROUND_ID = "halftone-ground";

const num = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;

const hex = (value: unknown, fallback: string): string =>
  typeof value === "string" && HEX_COLOR.test(value.trim())
    ? value.trim()
    : fallback;

const pick = (value: unknown, allowed: string[], fallback: string): string =>
  typeof value === "string" && allowed.includes(value) ? value : fallback;

export interface HalftoneSettings {
  [key: string]: unknown;
}

/**
 * The natural size of a picture, or null if it cannot be read.
 *
 * Read before rendering rather than after, because the frame is chosen from it:
 * a portrait photograph rendered into a landscape frame is contained down to a
 * narrow column, which reads as the halftone having missed most of the picture.
 */
const measure = (url: string): Promise<{ h: number; w: number } | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve({ h: img.naturalHeight, w: img.naturalWidth });
    img.onerror = () => resolve(null);
    img.src = url;
  });

/**
 * The halftone stack, shared by the export and by anything that wants to show
 * one. One definition, so what is on screen and what lands in the file cannot
 * drift apart — which they did, repeatedly.
 */
export const halftoneStack = (
  config: HalftoneSettings,
  imageUrl: string
): React.ReactElement => (
  <Shader style={{ height: "100%", width: "100%" }}>
    {/* Behind the halftone, and read through its dots. See above. */}
    <SolidColor color={hex(config.inkColor, "#041045")} id={GROUND_ID} />
    <Halftone
      angle={num(config.angle, 102)}
      blackAngle={num(config.blackAngle, 45)}
      blackColor={hex(config.blackColor, "#000000")}
      cyanAngle={num(config.cyanAngle, 15)}
      cyanColor={hex(config.cyanColor, "#00ffff")}
      frequency={num(config.frequency, 148)}
      magentaAngle={num(config.magentaAngle, 75)}
      magentaColor={hex(config.magentaColor, "#ff00ff")}
      misprint={num(config.misprint, 0)}
      misprintAngle={num(config.misprintAngle, 0)}
      paperColor={hex(config.paperColor, "#ffffff")}
      style={pick(config.style, ["classic", "cmyk"], "classic")}
      yellowAngle={num(config.yellowAngle, 0)}
      yellowColor={hex(config.yellowColor, "#ffff00")}
    >
      <ImageTexture
        maskSource={GROUND_ID}
        // `cover` rather than the library's `fill`, which stretches — on a
        // halftone that reads as a squeezed subject rather than as a choice.
        objectFit={pick(
          config.objectFit,
          ["cover", "contain", "fill"],
          "cover"
        )}
        url={imageUrl}
      />
    </Halftone>
  </Shader>
);

export const renderHalftone = async (
  config: HalftoneSettings,
  imageUrl: string | null
): Promise<Blob> => {
  if (!imageUrl) {
    throw new Error("Wire a picture into this node to halftone it.");
  }
  const natural = await measure(imageUrl);
  const aspect = natural && natural.h > 0 ? natural.w / natural.h : 1;
  const edge = longEdge();
  const width = Math.round(aspect >= 1 ? edge : edge * aspect);
  const height = Math.round(aspect >= 1 ? edge / aspect : edge);

  return await renderOffscreen(halftoneStack(config, imageUrl), {
    height,
    width,
  });
};
