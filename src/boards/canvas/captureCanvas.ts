/**
 * Taking a picture of something the browser drew.
 *
 * A shader is rendered live and has never existed as a file. Capturing one is
 * what turns it from somewhere a picture ends up into something another node
 * can read — `config/nodeTypes.ts` states the current limitation outright, and
 * this is the half that removes it.
 *
 * The same division composite already uses: only the browser knows what was
 * drawn, so it renders and uploads, and the run stores the URL it produced.
 *
 * Two failures here are silent and produce a blank image rather than an error,
 * so both are checked for rather than hoped about:
 *
 * **A discarded drawing buffer.** WebGL may throw the buffer away once it has
 * been composited, and does. A context created without `preserveDrawingBuffer`
 * captures blank on every frame except the one that drew it.
 *
 * **A tainted canvas.** Drawing a cross-origin image without `crossOrigin` set
 * marks the canvas unreadable, and `toBlob` then yields null rather than
 * saying why.
 */

/** Anything past this is a mistake rather than a capture. */
const MAX_CAPTURE_EDGE = 4096;

export class CaptureError extends Error {}

/**
 * The canvas a shader drew into.
 *
 * Searched for rather than held as a ref: the shader library owns its own
 * elements and creates them 189 different ways, so the DOM is the only
 * interface every one of them shares. The last is taken because an effect
 * stacks its own canvas over the source it wraps, and the last is the composed
 * result rather than an input to it.
 */
export const canvasWithin = (
  host: Element | null
): HTMLCanvasElement | null => {
  if (!host) {
    return null;
  }
  const found = host.querySelectorAll("canvas");
  return (found.item(found.length - 1) as HTMLCanvasElement | null) ?? null;
};

/** True when a canvas has nothing on it — the shape a discarded buffer takes. */
export const isBlank = (canvas: HTMLCanvasElement): boolean => {
  // Sampled rather than read whole: a 4096-square readback is 64 MB, and one
  // opaque pixel anywhere is enough to prove something was drawn.
  const probe = document.createElement("canvas");
  const size = 32;
  probe.width = size;
  probe.height = size;
  const context = probe.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return false;
  }
  try {
    context.drawImage(canvas, 0, 0, size, size);
  } catch {
    // Tainted. Not blank, and reported separately by the caller.
    return false;
  }
  const { data } = context.getImageData(0, 0, size, size);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] !== 0) {
      return false;
    }
  }
  return true;
};

export interface CaptureOptions {
  quality?: number;
  /** PNG keeps the dither crisp; a JPEG would smear every dot edge. */
  type?: string;
}

/**
 * A PNG of whatever is currently on this canvas.
 *
 * Rejects rather than resolving to something unusable. A blank capture stored
 * as a node's result would look exactly like a shader that renders nothing,
 * and the run that produced it would report success.
 */
export const captureCanvas = async (
  canvas: HTMLCanvasElement,
  options: CaptureOptions = {}
): Promise<Blob> => {
  if (canvas.width === 0 || canvas.height === 0) {
    throw new CaptureError("This shader has not been drawn yet.");
  }
  if (canvas.width > MAX_CAPTURE_EDGE || canvas.height > MAX_CAPTURE_EDGE) {
    throw new CaptureError(
      `That is ${canvas.width}×${canvas.height}; ${MAX_CAPTURE_EDGE} is the largest that can be captured.`
    );
  }
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, options.type ?? "image/png", options.quality);
  });
  if (!blob) {
    // toBlob returns null for a tainted canvas rather than throwing, so this is
    // the only place the cause can be named.
    throw new CaptureError(
      "The picture could not be read. An image drawn into it came from another origin without permission."
    );
  }
  return blob;
};

/** Long enough for a frame to arrive; past this nothing is coming. */
const FRAME_TIMEOUT_MS = 2500;

/**
 * What a blank capture means, said once.
 *
 * Both roads to the pixels end here: a direct read that came back empty and a
 * compositor that never published a frame are the same finding — nothing was
 * drawn — and naming the usual cause is more use than either failure alone.
 */
const BLANK = () =>
  new CaptureError(
    "This rendered blank. Nothing was drawn, or a WebGL canvas needs preserveDrawingBuffer to be captured after the frame that drew it."
  );

/**
 * A picture of a canvas that refuses to be read.
 *
 * The shader library draws through WebGPU, and its canvas hands back nothing:
 * `toBlob`, `toDataURL`, `drawImage` and `createImageBitmap` all return a fully
 * transparent image — measured, every one of 120,000 pixels at alpha zero —
 * while the very same canvas is plainly showing the picture on screen. It is
 * not a timing problem and `preserveDrawingBuffer` has no WebGPU equivalent;
 * the drawing buffer is simply not readable from the page.
 *
 * This is why the Halftone node produced nothing. The render was correct, the
 * capture came back blank, the run reported "this shader has not been rendered
 * yet", and the node sat there doing nothing at all.
 *
 * `captureStream` takes a different road to the same pixels: frames come off
 * the compositor, which is the half that works, rather than out of the buffer.
 * The same canvas that reads as empty yields a full opaque frame this way.
 */
const captureComposited = async (
  canvas: HTMLCanvasElement,
  options: CaptureOptions
): Promise<Blob> => {
  const source = canvas as HTMLCanvasElement & {
    captureStream?: (fps?: number) => MediaStream;
  };
  if (typeof source.captureStream !== "function") {
    throw new CaptureError(
      "This browser cannot capture what the shader drew. Chrome and Edge can."
    );
  }
  // Zero frames a second: nothing is published until it is asked for, so the
  // frame captured is the current one rather than whichever the clock landed on.
  const stream = source.captureStream(0);
  const track = stream.getVideoTracks()[0] as
    | (MediaStreamTrack & { requestFrame?: () => void })
    | undefined;
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;

  try {
    track?.requestFrame?.();
    // Deliberately not awaited. A stream that never publishes a frame — which
    // is what a canvas with nothing on it produces — leaves `play()` pending
    // for good, and awaiting it hung the capture until the test runner gave up
    // rather than failing with a reason.
    video.play().catch(() => undefined);
    await new Promise<void>((resolve, reject) => {
      // A stream that publishes nothing is a canvas with nothing on it.
      const timer = setTimeout(() => reject(BLANK()), FRAME_TIMEOUT_MS);
      const ready = () => {
        clearTimeout(timer);
        resolve();
      };
      if (video.videoWidth > 0) {
        ready();
        return;
      }
      video.onloadeddata = ready;
    });

    const flat = document.createElement("canvas");
    flat.width = canvas.width;
    flat.height = canvas.height;
    const context = flat.getContext("2d");
    if (!context) {
      throw new CaptureError("There is nothing rendered here to capture.");
    }
    context.drawImage(video, 0, 0, flat.width, flat.height);
    // Still nothing. The compositor is the last road to these pixels, so a
    // blank frame here means the shader really did draw nothing — and a blank
    // file stored as a node's result looks exactly like a working run.
    if (isBlank(flat)) {
      throw BLANK();
    }
    return await captureCanvas(flat, options);
  } finally {
    video.pause();
    video.srcObject = null;
    for (const each of stream.getTracks()) {
      each.stop();
    }
  }
};

/**
 * The whole capture, from a container to a file.
 *
 * Kept together because every step has a failure worth naming, and a caller
 * that assembled these by hand would report "could not export" for all of them.
 *
 * Read directly where that works, and off the compositor where it does not. Two
 * renderers are in play — a plain 2D canvas reads back perfectly, a WebGPU one
 * not at all — and which is in front of us is not knowable in advance, so it is
 * settled by trying rather than by guessing from the element.
 */
export const captureShader = async (
  host: Element | null,
  options: CaptureOptions = {}
): Promise<Blob> => {
  const canvas = canvasWithin(host);
  if (!canvas) {
    throw new CaptureError("There is nothing rendered here to capture.");
  }
  if (isBlank(canvas)) {
    return await captureComposited(canvas, options);
  }
  return await captureCanvas(canvas, options);
};
