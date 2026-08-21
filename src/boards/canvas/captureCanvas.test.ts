import { afterEach, describe, expect, it } from "vitest";
import {
  CaptureError,
  canvasWithin,
  captureCanvas,
  captureShader,
  isBlank,
} from "./captureCanvas";

/**
 * Capturing what the browser drew, checked against a real browser.
 *
 * This is the whole reason the test runner is Chromium rather than jsdom, which
 * returns null from getContext and would pass every assertion below without
 * drawing anything at all.
 *
 * The two failures worth the trouble both produce a *blank image* rather than
 * an error: a WebGL context that discarded its drawing buffer, and a canvas
 * tainted by a cross-origin picture. Either one, unnoticed, stores an empty
 * result against a run that reported success.
 */

const TOO_LARGE = /8000×10/;
const NOTHING_RENDERED = /nothing rendered/i;
const PRESERVE_DRAWING_BUFFER = /preserveDrawingBuffer/;

const hosts: HTMLElement[] = [];

afterEach(() => {
  for (const host of hosts.splice(0)) {
    host.remove();
  }
});

const host = (): HTMLDivElement => {
  const el = document.createElement("div");
  document.body.append(el);
  hosts.push(el);
  return el;
};

/** A canvas with something actually painted on it. */
const painted = (w = 40, h = 30, colour = "#b8442a"): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("no 2d context — the browser runner is not working");
  }
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, w, h);
  return canvas;
};

const empty = (w = 40, h = 30): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d");
  return canvas;
};

describe("canvasWithin", () => {
  it("finds the canvas a shader drew into", () => {
    const el = host();
    const canvas = painted();
    el.append(canvas);
    expect(canvasWithin(el)).toBe(canvas);
  });

  it("takes the last, which is the composed result rather than an input", () => {
    // An effect stacks its own canvas over the source it wraps.
    const el = host();
    const source = painted(10, 10);
    const effect = painted(20, 20);
    el.append(source, effect);
    expect(canvasWithin(el)).toBe(effect);
  });

  it("returns null for a host with nothing in it", () => {
    expect(canvasWithin(host())).toBeNull();
    expect(canvasWithin(null)).toBeNull();
  });
});

describe("isBlank", () => {
  it("is false when something was drawn", () => {
    expect(isBlank(painted())).toBe(false);
  });

  it("is true for an untouched canvas — the shape a discarded buffer takes", () => {
    expect(isBlank(empty())).toBe(true);
  });

  it("notices a single opaque pixel in an otherwise empty canvas", () => {
    const canvas = empty(64, 64);
    const ctx = canvas.getContext("2d");
    ctx?.fillRect(63, 63, 1, 1);
    expect(isBlank(canvas)).toBe(false);
  });
});

describe("captureCanvas", () => {
  it("returns a PNG of what is on the canvas", async () => {
    const blob = await captureCanvas(painted());
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("really contains the pixels, not just a header", async () => {
    // The point of a real browser: decode it back and check a pixel.
    const blob = await captureCanvas(painted(8, 8, "#00ff00"));
    const bitmap = await createImageBitmap(blob);
    expect(bitmap.width).toBe(8);
    const check = document.createElement("canvas");
    check.width = 8;
    check.height = 8;
    const ctx = check.getContext("2d");
    ctx?.drawImage(bitmap, 0, 0);
    const px = ctx?.getImageData(4, 4, 1, 1).data;
    expect(px?.[1]).toBeGreaterThan(200);
  });

  it("refuses a canvas that has not been drawn yet", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 0;
    canvas.height = 0;
    await expect(captureCanvas(canvas)).rejects.toBeInstanceOf(CaptureError);
  });

  it("refuses something too large to be a capture", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 8000;
    canvas.height = 10;
    await expect(captureCanvas(canvas)).rejects.toThrow(TOO_LARGE);
  });
});

describe("captureShader", () => {
  it("captures the canvas inside a host", async () => {
    const el = host();
    el.append(painted());
    const blob = await captureShader(el);
    expect(blob.size).toBeGreaterThan(0);
  });

  it("says so when there is nothing rendered", async () => {
    await expect(captureShader(host())).rejects.toThrow(NOTHING_RENDERED);
  });

  it("names preserveDrawingBuffer when the capture came back blank", async () => {
    // The failure this whole module exists to catch. Stored silently, a blank
    // result is indistinguishable from a shader that renders nothing.
    const el = host();
    el.append(empty());
    await expect(captureShader(el)).rejects.toThrow(PRESERVE_DRAWING_BUFFER);
  });

  it("captures a real WebGL canvas that preserves its buffer", async () => {
    const el = host();
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true });
    if (!gl) {
      // No WebGL in this runner — the 2D paths above still cover the logic.
      return;
    }
    gl.clearColor(0.2, 0.6, 0.4, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    el.append(canvas);
    const blob = await captureShader(el);
    expect(blob.size).toBeGreaterThan(0);
  });
});
