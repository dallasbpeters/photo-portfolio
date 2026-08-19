import "../../index.css";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { NODE_TYPES } from "../../../config/nodeTypes.js";
import type { BoardItem } from "../../types";
import { ShaderPanel } from "./ShaderPanel";

/**
 * What the halftone's settings show before anybody has touched them.
 *
 * A stored config only carries the keys somebody has changed, so a freshly
 * inserted node has none of them and every caller resolves a missing setting to
 * "". That is a string, so the guard meant to fall back to the declared default
 * passed it straight through: the ink swatch drew the "no fill" chequerboard
 * and its picker opened on white, neither being the colour the node was using
 * to render. Nothing was broken about the picker itself — it was being told the
 * node had no colour.
 */

let host: HTMLDivElement | null = null;
let root: Root | null = null;

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

afterEach(() => {
  root?.unmount();
  host?.remove();
  host = null;
  root = null;
});

const halftone = (config: Record<string, unknown>): BoardItem => ({
  body: null,
  config,
  creditName: null,
  creditUrl: null,
  fontSize: null,
  height: 320,
  id: "h1",
  imageUrl: null,
  kind: "op",
  nodeType: "standard",
  photoId: null,
  result: null,
  runError: null,
  runState: "idle",
  textStyle: null,
  thumbUrl: null,
  width: 320,
  x: 0,
  y: 0,
  z: 1,
});

const mount = async (
  config: Record<string, unknown>
): Promise<Record<string, unknown>[]> => {
  const writes: Record<string, unknown>[] = [];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  root.render(
    <ShaderPanel
      onConfigChange={(_id, next) => writes.push(next)}
      onExport={() => Promise.resolve()}
      selected={halftone(config)}
    />
  );
  await flush();
  return writes;
};

const wellFor = (label: string): HTMLButtonElement | undefined =>
  Array.from(document.querySelectorAll("button")).find(
    (button) => button.getAttribute("aria-label") === label
  );

/** The declared default for one of the node's settings. */
const declared = (key: string): string => {
  const setting = NODE_TYPES.standard.settings.find((s) => s.key === key);
  return setting && "default" in setting ? String(setting.default) : "";
};

describe("the halftone's settings before anyone touches them", () => {
  it("shows the ink the node actually renders with", async () => {
    await mount({});
    const swatch = wellFor("Ink")?.querySelector("span");
    // #041045 is rgb(4, 16, 69). Not a chequerboard, which is what "no fill"
    // draws and what this showed for every untouched node.
    expect(swatch?.getAttribute("style")).toContain("rgb(4, 16, 69)");
    expect(declared("inkColor")).toBe("#041045");
  });

  it("draws no chequerboard, which is the shape the bug took", async () => {
    await mount({});
    const swatch = wellFor("Ink")?.querySelector("span");
    expect(swatch?.getAttribute("style")).not.toContain("linear-gradient");
  });

  it("still shows a colour that has been chosen", async () => {
    // The fallback must not outrank a real stored value.
    await mount({ inkColor: "#ff0000" });
    const swatch = wellFor("Ink")?.querySelector("span");
    expect(swatch?.getAttribute("style")).toContain("rgb(255, 0, 0)");
  });

  it("opens the picker on the ink rather than on white", async () => {
    await mount({});
    wellFor("Ink")?.click();
    await flush();
    const fields = Array.from(document.querySelectorAll("input")).map(
      (field) => field.value
    );
    expect(fields).toContain("041045");
  });

  it("fills every setting that declares a default", async () => {
    // The same fault hid the style and fit selects, which read as unset.
    await mount({});
    const fields = Array.from(document.querySelectorAll("input")).map(
      (field) => field.value
    );
    expect(fields).toContain(declared("frequency"));
    expect(fields).toContain(declared("angle"));
  });
});
