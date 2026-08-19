import { Halftone, ImageTexture, Shader } from "shaders/react";
import { renderOffscreen } from "./renderOffscreen";

/**
 * Rendering a Halftone node to a file, away from the board.
 *
 * The stack is the library's own — the same three components anyone would write
 * by hand from shaders.com:
 *
 *   <Shader><Halftone …><ImageTexture … /></Halftone></Shader>
 *
 * That matters more than it looks. This previously drove a bespoke WebGL
 * renderer built to dither the brand mark, and every complaint about it came
 * from one root: it was a mark renderer taught to accept a photograph. It
 * sampled a window instead of the whole picture, punched the lockup's clear
 * space out of the middle, and its spiral only read as a spiral over a sparse
 * shape. Handing the job to the component that exists for it removes the
 * translation layer where all of that lived.
 *
 * Mounted offscreen rather than captured from the node on the canvas — see
 * renderOffscreen. The frame takes the picture's own aspect, so the whole of it
 * fills the whole of the output rather than being contained into a column.
 */

/**
 * The long edge of an export, and the ceiling the library actually honours.
 *
 * Asking for 2400 does not get 2400. The engine runs every render through
 * `clampToTextureCap`, which is
 *
 *   const capW = Math.min(w, env.viewportWidth, gpuCssCap)
 *
 * — so the drawing is clamped to the *browser window's* inner size no matter
 * how large the element it is mounted in. A 2400px request in a 1440px window
 * renders 1440 real pixels and the rest is upscale. Measured here rather than
 * assumed: a 600x400 host in a 414px-wide window produced a 414x276 canvas.
 *
 * So the request is clamped honestly instead. An export is as large as the
 * window allows, which is the true limit, and the file says so rather than
 * carrying a size it never had.
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

  return await renderOffscreen(
    // Sized explicitly. Left to itself the wrapper takes a 2:1 box rather than
    // the host's — a 600x400 host rendered into 600x300 — so the picture was
    // fitted into a frame the wrong shape and the rest came out blank. That is
    // the "not grabbing all of the image" everyone kept seeing.
    <Shader style={{ height: "100%", width: "100%" }}>
      <Halftone
        angle={num(config.angle, 45)}
        blackAngle={num(config.blackAngle, 45)}
        blackColor={hex(config.blackColor, "#000000")}
        cyanAngle={num(config.cyanAngle, 15)}
        cyanColor={hex(config.cyanColor, "#00ffff")}
        frequency={num(config.frequency, 100)}
        magentaAngle={num(config.magentaAngle, 75)}
        magentaColor={hex(config.magentaColor, "#ff00ff")}
        misprint={num(config.misprint, 0)}
        misprintAngle={num(config.misprintAngle, 0)}
        paperColor={hex(config.paperColor, "#ffffff")}
        // `cmyk` by default: `classic` is not a printed halftone and every
        // ink below is switched off in it. See config/nodes/standard.ts.
        style={pick(config.style, ["cmyk", "classic"], "cmyk")}
        yellowAngle={num(config.yellowAngle, 0)}
        yellowColor={hex(config.yellowColor, "#ffff00")}
      >
        <ImageTexture
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
    </Shader>,
    { height, width }
  );
};
