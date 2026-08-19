import { DEFAULT_PROPS, StandardShader } from "../../components/StandarShader";
import { renderOffscreen } from "./renderOffscreen";

/**
 * Rendering a Halftone node to a file, away from the board.
 *
 * **Built on the shader's own defaults.** The first version of this restated
 * three dozen props by hand and got twenty-two of them wrong — spiralTightness
 * 18 became 2, spiralArms 3 became 4, `reversed` was flipped, the wordmark was
 * stripped and a 1200×700 composition was squared off. The result was a
 * halftone, but not *this* halftone. Spreading DEFAULT_PROPS means the node
 * renders the shader as designed and the settings change it from there; a prop
 * nobody has thought about keeps its intended value instead of an invented one.
 *
 * Mounted offscreen rather than captured from the node on the canvas. The node
 * on screen is sized to however it was dragged, and an export should not change
 * resolution because someone resized a box; a node scrolled out of view may not
 * be rendering at all; and one mid-resize would be caught mid-resize.
 *
 * The same reasoning composite already applies: only the browser can produce
 * this, so it produces it deliberately at a known size.
 */

/**
 * How much larger than the design to export.
 *
 * The aspect is the shader's own — 1200×700 — rather than a square, because the
 * composition was laid out for it: squaring the frame moves the lockup and
 * changes where the spiral falls.
 */
export const RENDER_SCALE = 2;

export interface HalftoneSettings {
  background?: unknown;
  baseDensity?: unknown;
  dotSize?: unknown;
  dots?: unknown;
  fieldSize?: unknown;
  fieldStrength?: unknown;
  reversed?: unknown;
  spiralAmount?: unknown;
  spiralArms?: unknown;
  spiralTightness?: unknown;
  wordmark?: unknown;
}

const num = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;

const hex = (value: unknown, fallback: string): string =>
  typeof value === "string" && HEX_COLOR.test(value.trim())
    ? value.trim()
    : fallback;

/**
 * A PNG of this node, at export resolution.
 *
 * Resolves only once something has been drawn. The renderer draws on the
 * texture's load event, so the first frames after mounting are legitimately
 * blank — polling for a non-blank capture is the difference between exporting
 * the picture and exporting the moment before it.
 */
export const renderHalftone = async (
  config: HalftoneSettings,
  imageUrl: string | null
): Promise<Blob> => {
  const width = (DEFAULT_PROPS.width ?? 1200) * RENDER_SCALE;
  const height = (DEFAULT_PROPS.height ?? 700) * RENDER_SCALE;

  return await renderOffscreen(
    <StandardShader
      {...DEFAULT_PROPS}
      animate={false}
      background={hex(config.background, DEFAULT_PROPS.background)}
      baseDensity={num(config.baseDensity, DEFAULT_PROPS.baseDensity)}
      // A still, so the two things that only mean something over time are
      // stopped rather than captured at an arbitrary phase.
      breathing={0}
      dotSize={num(config.dotSize, DEFAULT_PROPS.dotSize)}
      dots={hex(config.dots, DEFAULT_PROPS.dots)}
      fieldSize={num(config.fieldSize, DEFAULT_PROPS.fieldSize)}
      fieldStrength={num(config.fieldStrength, DEFAULT_PROPS.fieldStrength)}
      height={height}
      imageUrl={imageUrl}
      reversed={
        config.reversed === undefined
          ? DEFAULT_PROPS.reversed
          : config.reversed === "yes"
      }
      rotation={0}
      spiralAmount={num(config.spiralAmount, DEFAULT_PROPS.spiralAmount)}
      spiralArms={num(config.spiralArms, DEFAULT_PROPS.spiralArms)}
      spiralTightness={num(
        config.spiralTightness,
        DEFAULT_PROPS.spiralTightness
      )}
      width={width}
      wordmark={
        typeof config.wordmark === "string"
          ? config.wordmark
          : DEFAULT_PROPS.wordmark
      }
    />,
    { height, width }
  );
};
