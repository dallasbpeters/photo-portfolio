import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { NODE_TYPES } from "../../../config/nodeTypes.js";
import { renderHalftone } from "./renderShaderNode";

/**
 * Pictures of the halftone, for looking at.
 *
 * Not a test — nothing here can fail — and that is deliberate. The shader
 * cannot be asserted on: a WebGPU canvas hands back nothing to
 * `toDataURL`, `drawImage` or `createImageBitmap`, so the only way to see what
 * it drew is the compositor, through `page.screenshot`. Every wrong halftone
 * this project shipped was shipped because it was reasoned about instead of
 * looked at.
 *
 * Run with `pnpm shots`, then open src/boards/canvas/.shots.
 */

let host: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  root?.unmount();
  host?.remove();
  host = null;
  root = null;
});

/** A photograph-like card: dark subject, light ground, a full tonal ramp. */
const card = (): string => {
  const source = document.createElement("canvas");
  source.width = 900;
  source.height = 600;
  const g = source.getContext("2d");
  if (!g) {
    throw new Error("no 2d context");
  }
  const sky = g.createLinearGradient(0, 0, 0, 600);
  sky.addColorStop(0, "#efefef");
  sky.addColorStop(1, "#a8a8a8");
  g.fillStyle = sky;
  g.fillRect(0, 0, 900, 600);
  g.fillStyle = "#141428";
  g.beginPath();
  g.ellipse(450, 340, 210, 230, 0, 0, Math.PI * 2);
  g.fill();
  for (let step = 0; step < 8; step += 1) {
    const v = Math.round((step / 7) * 255);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(60 + step * 60, 40, 60, 70);
  }
  return source.toDataURL("image/png");
};

/** A node's settings, as a fresh one carries them. */
const defaults = (): Record<string, unknown> =>
  Object.fromEntries(
    NODE_TYPES.standard.settings.map((setting) => [
      setting.key,
      "default" in setting ? setting.default : "",
    ])
  );

/** Renders through the real export path and shows the file it produced. */
const shootHalftone = async (
  name: string,
  config: Record<string, unknown>
): Promise<void> => {
  const blob = await renderHalftone(config, card(), 900);
  const shown = document.createElement("img");
  shown.src = URL.createObjectURL(blob);
  await new Promise((done) => {
    shown.onload = done;
  });
  host = document.createElement("div");
  host.style.cssText = "position:fixed;left:0;top:0;width:900px;height:600px;";
  shown.style.cssText = "width:100%;height:100%;object-fit:contain;";
  host.append(shown);
  document.body.append(host);
  await page.screenshot({ element: host, path: `.shots/${name}.png` });
};

describe("halftone", () => {
  it("a new node's defaults", async () => {
    await shootHalftone("1-defaults", defaults());
    expect(true).toBe(true);
  });

  it("inverted: the two inks swapped", async () => {
    await shootHalftone("2-inverted", {
      ...defaults(),
      ink: "#FAFAFA",
      paper: "#27444D",
    });
    expect(true).toBe(true);
  });

  it("a coarser screen", async () => {
    await shootHalftone("3-coarse", { ...defaults(), dot: 8 });
    expect(true).toBe(true);
  });

  it("tone pushed dark", async () => {
    await shootHalftone("4-dark", { ...defaults(), gamma: 0.6 });
    expect(true).toBe(true);
  });
});
