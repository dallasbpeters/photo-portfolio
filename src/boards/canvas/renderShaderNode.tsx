import { createRoot } from "react-dom/client";
import { StandardShader } from "../../components/StandarShader";
import { CaptureError, captureShader } from "./captureCanvas";

/**
 * Rendering a halftone node to a file, away from the board.
 *
 * Mounted offscreen rather than captured from the node on the canvas, for three
 * reasons. The node on screen is sized to however it was dragged, and an export
 * should not change resolution because someone resized a box. A node scrolled
 * out of view may not be rendering at all. And a node that is mid-animation, or
 * mid-resize, would be captured in whatever state it happened to be in.
 *
 * The same reasoning composite already applies: only the browser can produce
 * this, so it produces it deliberately at a known size rather than
 * photographing whatever is currently on screen.
 */

/** Square, and large enough to print from without being a burden to store. */
export const RENDER_SIZE = 1600;

/** A draw is one image load away; past this something is wrong. */
const READY_TIMEOUT_MS = 8000;
const POLL_MS = 60;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface HalftoneSettings {
  background?: unknown;
  baseDensity?: unknown;
  dotSize?: unknown;
  dots?: unknown;
  fieldSize?: unknown;
  fieldStrength?: unknown;
  spiralAmount?: unknown;
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
 * The first capture that isn't blank, or the last complaint about why not.
 *
 * Recursive rather than a poll loop: each attempt has to wait for the one
 * before it, so the tries are sequential by nature.
 */
const captureWhenDrawn = async (
  host: HTMLElement,
  deadline: number,
  lastError: unknown
): Promise<Blob> => {
  if (Date.now() >= deadline) {
    throw lastError instanceof CaptureError
      ? lastError
      : new CaptureError("The halftone did not finish drawing in time.");
  }
  await wait(POLL_MS);
  try {
    return await captureShader(host);
  } catch (err) {
    // Blank is expected until the texture loads and the first frame lands.
    return await captureWhenDrawn(host, deadline, err);
  }
};

/**
 * A PNG of this node's settings, at export resolution.
 *
 * Resolves only once something has actually been drawn. The renderer draws on
 * the texture's load event, so the first frames after mounting are legitimately
 * blank — polling for a non-blank capture is the difference between exporting
 * the picture and exporting the moment before it.
 */
export const renderHalftone = async (
  config: HalftoneSettings,
  imageUrl: string | null
): Promise<Blob> => {
  const host = document.createElement("div");
  // Off screen rather than hidden: `display: none` gives the canvas no size and
  // WebGL nothing to draw into, and `visibility: hidden` still reserves layout
  // on the page it is borrowing.
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:${RENDER_SIZE}px;height:${RENDER_SIZE}px;pointer-events:none;`;
  document.body.append(host);
  const root = createRoot(host);

  try {
    root.render(
      <StandardShader
        animate={false}
        background={hex(config.background, "#FFFFFF")}
        baseDensity={num(config.baseDensity, 0.012)}
        blue="#3A70B3"
        breathing={0}
        clearFeather={0.12}
        clearSize={imageUrl ? 0 : 0.27}
        cornerRadius={0}
        description=""
        descriptionSize={17}
        dotSize={num(config.dotSize, 4.5)}
        dots={hex(config.dots, "#27444D")}
        fieldSize={num(config.fieldSize, 1)}
        fieldStrength={num(config.fieldStrength, 1)}
        height={RENDER_SIZE}
        iconOnly
        iconSize={180}
        imageUrl={imageUrl}
        ink="#131415"
        lockupGap={10}
        markSize={104}
        padding={0}
        reverseBackground="#27444D"
        reverseDots="#FAF8F0"
        reversed={false}
        reverseInk="#FAF8F0"
        rotation={0}
        showDescription={false}
        speed={0}
        spiralAmount={num(config.spiralAmount, 1)}
        spiralArms={4}
        spiralOverlap={0.5}
        spiralTightness={2}
        tracking={0}
        typeSize={24}
        typeWeight={500}
        verticalGap={12}
        width={RENDER_SIZE}
        wordmark=""
      />
    );

    return await captureWhenDrawn(host, Date.now() + READY_TIMEOUT_MS, null);
  } finally {
    // Unmounted on a later task: React refuses to unmount a root while it is
    // still rendering, and the capture above can land inside that window.
    setTimeout(() => {
      root.unmount();
      host.remove();
    }, 0);
  }
};
