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

/** The long edge of an export. Large enough to print from. */
const LONG_EDGE = 2400;

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
  const width = Math.round(aspect >= 1 ? LONG_EDGE : LONG_EDGE * aspect);
  const height = Math.round(aspect >= 1 ? LONG_EDGE / aspect : LONG_EDGE);

  return await renderOffscreen(
    <Shader>
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
        style={pick(config.style, ["classic", "cmyk"], "classic")}
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
