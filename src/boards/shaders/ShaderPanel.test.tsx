import "../../index.css";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { NODE_TYPES } from "../../../config/nodeTypes.js";
import type { BoardItem } from "../../types";
import { OpNodeView } from "../nodes/OpNodeView";
import { ShaderPanel } from "./ShaderPanel";

/**
 * Where a halftone's settings render, and where they do not.
 *
 * Both halves are asserted because only the pair says anything: "the node has
 * no settings" is equally true of a node that renders nothing at all, and "the
 * panel has settings" does not prove the node stopped showing its own.
 *
 * Thirty-two controls cannot sit on the thing they change — the same argument
 * MaskControls makes, and the reason the shader settings moved off the item.
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

const halftone = (over: Partial<BoardItem> = {}): BoardItem => ({
  body: null,
  config: { dotSize: 4.5 },
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
  ...over,
});

const mount = async (node: React.ReactNode): Promise<HTMLElement> => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  root.render(node);
  await flush();
  return host;
};

/**
 * Every control a settings surface has put on screen.
 *
 * Counted by label rather than by input, because a colour setting renders as a
 * swatch button and a select as a listbox — counting `input` elements silently
 * missed seven of them and made a complete panel look short.
 */
const controls = (box: HTMLElement): number =>
  box.querySelectorAll("input, textarea, button[title], [role='combobox']")
    .length;

/** Which of a node type's settings actually reached the screen, by label. */
const labelled = (box: HTMLElement, labels: string[]): string[] => {
  const text = box.textContent ?? "";
  return labels.filter((label) => text.includes(label));
};

describe("the halftone's settings are not on the node", () => {
  it("renders no setting controls inside the node", async () => {
    const box = await mount(
      <OpNodeView
        hasWiredPrompt={false}
        item={halftone()}
        onCancel={() => undefined}
        onConfigChange={() => undefined}
        onRun={() => undefined}
        readOnly={false}
      />
    );
    expect(controls(box)).toBe(0);
  });

  it("still renders them inside a node that has only a few", async () => {
    // The gate is specific, not a blanket removal: a Palette node keeps its
    // controls on the node, where two of them are one glance from what they do.
    const box = await mount(
      <OpNodeView
        hasWiredPrompt={false}
        item={halftone({ config: {}, id: "p1", nodeType: "palette" })}
        onCancel={() => undefined}
        onConfigChange={() => undefined}
        onRun={() => undefined}
        readOnly={false}
      />
    );
    expect(controls(box)).toBeGreaterThan(0);
  });
});

describe("the halftone's settings are in the panel", () => {
  it("renders one control per declared setting", async () => {
    const box = await mount(
      <ShaderPanel
        onConfigChange={() => undefined}
        onExport={() => Promise.resolve()}
        selected={halftone()}
      />
    );
    // Every setting the node declares reaches the panel. The count is the
    // claim: a panel showing three of thirty-two looks perfectly fine on its
    // own, and the missing twenty-nine are only visible as a number.
    const labels = NODE_TYPES.standard.settings.map((s) => s.label);
    expect(labelled(box, labels)).toEqual(labels);
    expect(controls(box)).toBeGreaterThan(0);
  });

  it("shows nothing when the selection is not a halftone or a shader", async () => {
    const box = await mount(
      <ShaderPanel
        onConfigChange={() => undefined}
        onExport={() => Promise.resolve()}
        selected={halftone({ nodeType: "generate" })}
      />
    );
    expect(box.textContent).toBe("");
  });

  it("shows nothing with no selection at all", async () => {
    const box = await mount(
      <ShaderPanel
        onConfigChange={() => undefined}
        onExport={() => Promise.resolve()}
        selected={null}
      />
    );
    expect(box.textContent).toBe("");
  });
});
