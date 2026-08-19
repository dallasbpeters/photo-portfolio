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
export const RENDER_SCALE = 1;

export interface HalftoneSettings {
  [key: string]: unknown;
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

/** Stored as a select, because SettingDef has no boolean kind. */
const bool = (value: unknown, fallback: boolean): boolean =>
  value === undefined || value === null ? fallback : value === "yes";

const text = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value : fallback;

/**
 * A PNG of this node, at export resolution.
 *
 * Resolves only once something has been drawn. The renderer draws on the
 * texture's load event, so the first frames after mounting are legitimately
 * blank — polling for a non-blank capture is the difference between exporting
 * the picture and exporting the moment before it.
 */
/**
 * The natural size of a picture, or null if it cannot be read.
 *
 * Needed before rendering rather than after: the frame is chosen from it.
 */
const measure = (url: string): Promise<{ h: number; w: number } | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve({ h: img.naturalHeight, w: img.naturalWidth });
    img.onerror = () => resolve(null);
    img.src = url;
  });

/** The long edge of an export. */
const LONG_EDGE = (DEFAULT_PROPS.width ?? 1200) * 2;

export const renderHalftone = async (
  config: HalftoneSettings,
  imageUrl: string | null
): Promise<Blob> => {
  /*
   * The frame follows the picture when there is one.
   *
   * The design's own 1200x700 is right for the lockup, and wrong for anything
   * else: a portrait photograph rendered into it is contained down to a narrow
   * column with empty field either side, which reads as the halftone having
   * missed most of the picture. Taking the picture's aspect means the whole of
   * it fills the whole of the output, with nothing letterboxed and nothing
   * cropped.
   */
  const natural = imageUrl ? await measure(imageUrl) : null;
  const aspect =
    natural && natural.h > 0
      ? natural.w / natural.h
      : (DEFAULT_PROPS.width ?? 1200) / (DEFAULT_PROPS.height ?? 700);
  const width = Math.round(
    (aspect >= 1 ? LONG_EDGE : LONG_EDGE * aspect) * RENDER_SCALE
  );
  const height = Math.round(
    (aspect >= 1 ? LONG_EDGE / aspect : LONG_EDGE) * RENDER_SCALE
  );

  return await renderOffscreen(
    <StandardShader
      {...DEFAULT_PROPS}
      // A still: the four properties that only mean something over time are
      // stopped rather than captured at an arbitrary phase.
      animate={false}
      background={hex(config.background, DEFAULT_PROPS.background)}
      baseDensity={num(config.baseDensity, DEFAULT_PROPS.baseDensity)}
      blue={hex(config.blue, DEFAULT_PROPS.blue)}
      breathing={0}
      clearFeather={num(config.clearFeather, DEFAULT_PROPS.clearFeather)}
      clearSize={num(config.clearSize, DEFAULT_PROPS.clearSize)}
      cornerRadius={num(config.cornerRadius, DEFAULT_PROPS.cornerRadius)}
      description={text(config.description, DEFAULT_PROPS.description)}
      descriptionSize={num(
        config.descriptionSize,
        DEFAULT_PROPS.descriptionSize
      )}
      dotSize={num(config.dotSize, DEFAULT_PROPS.dotSize)}
      dots={hex(config.dots, DEFAULT_PROPS.dots)}
      fieldSize={num(config.fieldSize, DEFAULT_PROPS.fieldSize)}
      fieldStrength={num(config.fieldStrength, DEFAULT_PROPS.fieldStrength)}
      height={height}
      iconOnly={bool(config.iconOnly, DEFAULT_PROPS.iconOnly)}
      iconSize={num(config.iconSize, DEFAULT_PROPS.iconSize)}
      imageUrl={imageUrl}
      ink={hex(config.ink, DEFAULT_PROPS.ink)}
      lockupGap={num(config.lockupGap, DEFAULT_PROPS.lockupGap)}
      markSize={num(config.markSize, DEFAULT_PROPS.markSize)}
      padding={num(config.padding, DEFAULT_PROPS.padding)}
      reverseBackground={hex(
        config.reverseBackground,
        DEFAULT_PROPS.reverseBackground
      )}
      reverseDots={hex(config.reverseDots, DEFAULT_PROPS.reverseDots)}
      reversed={bool(config.reversed, DEFAULT_PROPS.reversed)}
      reverseInk={hex(config.reverseInk, DEFAULT_PROPS.reverseInk)}
      rotation={0}
      showDescription={bool(
        config.showDescription,
        DEFAULT_PROPS.showDescription
      )}
      speed={0}
      spiralAmount={num(config.spiralAmount, DEFAULT_PROPS.spiralAmount)}
      spiralArms={num(config.spiralArms, DEFAULT_PROPS.spiralArms)}
      spiralOverlap={num(config.spiralOverlap, DEFAULT_PROPS.spiralOverlap)}
      spiralTightness={num(
        config.spiralTightness,
        DEFAULT_PROPS.spiralTightness
      )}
      tracking={num(config.tracking, DEFAULT_PROPS.tracking)}
      typeSize={num(config.typeSize, DEFAULT_PROPS.typeSize)}
      typeWeight={num(config.typeWeight, DEFAULT_PROPS.typeWeight)}
      verticalGap={num(config.verticalGap, DEFAULT_PROPS.verticalGap)}
      width={width}
      wordmark={text(config.wordmark, DEFAULT_PROPS.wordmark)}
    />,
    { height, width }
  );
};
