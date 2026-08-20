import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { NODE_TYPES } from "../../../config/nodeTypes.js";
import { halftoneStack } from "./renderShaderNode";

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

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

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

const shoot = async (
  name: string,
  node: React.ReactNode,
  w = 900,
  h = 600
): Promise<void> => {
  host = document.createElement("div");
  host.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;`;
  document.body.append(host);
  root = createRoot(host);
  root.render(node);
  // The library draws on the image's load, so the first frames are legitimately
  // empty. Generous rather than clever: this runs by hand, not in CI.
  await wait(3000);
  await page.screenshot({ element: host, path: `.shots/${name}.png` });
};

/** Exactly the settings a freshly inserted node carries. */
const defaults = (): Record<string, unknown> =>
  Object.fromEntries(
    NODE_TYPES.standard.settings.map((setting) => [
      setting.key,
      "default" in setting ? setting.default : "",
    ])
  );

describe("the screen is kept legible at any size", () => {
  it("frequency 148 in a node-sized box, clamped", async () => {
    await shoot(
      "small-clamped",
      halftoneStack(defaults(), card(), 300),
      300,
      225
    );
    expect(true).toBe(true);
  });

  it("frequency 148 at export size, untouched", async () => {
    await shoot(
      "large-untouched",
      halftoneStack(defaults(), card(), 1200),
      1200,
      900
    );
    expect(true).toBe(true);
  });
});
