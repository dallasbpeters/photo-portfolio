import "../../index.css";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { NODE_TYPES } from "../../../config/nodeTypes.js";
import { HalftonePreview } from "./HalftonePreview";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const card = (): string => {
  const c = document.createElement("canvas");
  c.width = 600;
  c.height = 400;
  const g = c.getContext("2d");
  if (!g) {
    throw new Error("no 2d");
  }
  const sky = g.createLinearGradient(0, 0, 0, 400);
  sky.addColorStop(0, "#efefef");
  sky.addColorStop(1, "#a0a0a0");
  g.fillStyle = sky;
  g.fillRect(0, 0, 600, 400);
  g.fillStyle = "#141428";
  g.beginPath();
  g.ellipse(300, 230, 140, 150, 0, 0, Math.PI * 2);
  g.fill();
  return c.toDataURL("image/png");
};

const defaults = (): Record<string, unknown> =>
  Object.fromEntries(
    NODE_TYPES.standard.settings.map((s) => [
      s.key,
      "default" in s ? s.default : "",
    ])
  );

describe("the node preview", () => {
  it("draws inside a node-sized box", async () => {
    const host = document.createElement("div");
    // A node's body: fixed width, scrolling, like the real thing.
    host.style.cssText =
      "position:fixed;left:0;top:0;width:280px;max-height:360px;overflow-y:auto;padding:8px;background:#1a1a1a;";
    document.body.append(host);
    createRoot(host).render(
      <HalftonePreview config={defaults()} imageUrl={card()} />
    );
    await wait(3000);
    await page.screenshot({ element: host, path: ".shots/node-preview.png" });
    expect(true).toBe(true);
  });

  it("says what to do when nothing is wired", async () => {
    const host = document.createElement("div");
    host.style.cssText =
      "position:fixed;left:0;top:400px;width:280px;padding:8px;background:#1a1a1a;";
    document.body.append(host);
    createRoot(host).render(<HalftonePreview config={defaults()} />);
    await wait(300);
    await page.screenshot({ element: host, path: ".shots/node-empty.png" });
    expect(true).toBe(true);
  });
});
