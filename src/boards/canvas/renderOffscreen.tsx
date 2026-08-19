import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { CaptureError, captureShader } from "./captureCanvas";

/**
 * Rendering something to a file, away from the board.
 *
 * Anything drawn live — a shader stack, a halftone — has never existed as a
 * file, and a run or an export is the first moment it has to. The same division
 * composite already uses: only the browser can produce it, so it produces it
 * deliberately.
 *
 * Mounted offscreen rather than captured from the node on the canvas, for three
 * reasons. A node is sized to however it was dragged, and an export should not
 * change resolution because someone resized a box. A node scrolled out of view
 * may not be rendering at all. And one caught mid-resize is captured mid-resize.
 */

/** A draw is usually one image load away; past this something is wrong. */
const READY_TIMEOUT_MS = 8000;
const POLL_MS = 60;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface OffscreenSize {
  height: number;
  width: number;
}

/**
 * The next attempt at a capture, or the last failure once the deadline passes.
 *
 * Each attempt tail-calls the next rather than looping, so a run is a chain of
 * waits: one poll is one call, and the only way out is a capture or the clock.
 */
const captureWhenReady = async (
  host: HTMLElement,
  deadline: number,
  lastError: unknown
): Promise<Blob> => {
  if (Date.now() >= deadline) {
    throw lastError instanceof CaptureError
      ? lastError
      : new CaptureError("It did not finish drawing in time.");
  }

  await wait(POLL_MS);
  try {
    return await captureShader(host);
  } catch (err) {
    return await captureWhenReady(host, deadline, err);
  }
};

/**
 * A PNG of `element`, rendered at `size`.
 *
 * Polls for a *non-blank* capture rather than waiting a fixed time. These
 * renderers draw on an image's load event, so the first frames after mounting
 * are legitimately empty — the difference between exporting the picture and
 * exporting the moment before it.
 */
export const renderOffscreen = async (
  element: ReactElement,
  size: OffscreenSize
): Promise<Blob> => {
  const host = document.createElement("div");
  // Off screen rather than hidden: `display: none` gives the canvas no size and
  // nothing to draw into, and `visibility: hidden` still reserves layout on
  // whatever page it is borrowing.
  /*
   * On screen, but behind the page.
   *
   * Not at -99999px, which is the obvious way to hide it and the one that does
   * not work: the shader library watches with an IntersectionObserver and stops
   * rendering anything that is not in the viewport, so a host parked off the
   * left edge polls until it times out and captures a blank. Behind everything
   * at zero opacity is still "in view" as far as the observer is concerned.
   */
  host.style.cssText = `position:fixed;left:0;top:0;width:${size.width}px;height:${size.height}px;opacity:0.01;pointer-events:none;z-index:-2147483647;`;
  document.body.append(host);
  const root = createRoot(host);

  try {
    root.render(element);

    // Awaited, not returned: the `finally` below schedules the unmount, and it
    // has to be the capture that settles first.
    return await captureWhenReady(host, Date.now() + READY_TIMEOUT_MS, null);
  } finally {
    // Unmounted on a later task: React refuses to unmount a root while it is
    // still rendering, and the capture above can land inside that window.
    setTimeout(() => {
      root.unmount();
      host.remove();
    }, 0);
  }
};
