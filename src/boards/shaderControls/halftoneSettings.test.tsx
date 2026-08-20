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
  // Re-rendered with each stored config, as the board does: a field that reads
  // its own value back is only honest if the value actually round-trips.
  let current = halftone(config);
  const draw = () => {
    root?.render(
      <ShaderPanel
        onConfigChange={(_id, next) => {
          writes.push(next);
          current = { ...current, config: next };
          draw();
        }}
        onExport={() => Promise.resolve()}
        selected={current}
      />
    );
  };
  draw();
  await flush();
  return writes;
};

/** Types into a field the way a person does, through the native setter. */
const typeInto = (field: HTMLInputElement, text: string): void => {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(field, text);
  field.dispatchEvent(new Event("input", { bubbles: true }));
};

const numberFields = (): HTMLInputElement[] =>
  Array.from(host?.querySelectorAll('input[type="number"]') ?? []);

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

describe("a number setting can be retyped", () => {
  it("stays empty when it is cleared", async () => {
    /*
     * The failure this replaces: clearing the field wrote "", "" was read back
     * as "never set", the declared default was substituted, and the box jumped
     * straight back to 148. There was no way to type 60 except to select the
     * whole field first — which reads, correctly, as a control that does not
     * work.
     */
    await mount({});
    const freq = numberFields().find((f) => f.value === "148");
    expect(freq).toBeDefined();
    if (freq) {
      typeInto(freq, "");
    }
    await flush();
    expect(numberFields().at(0)?.value).toBe("");
  });

  it("takes the number typed after it is cleared", async () => {
    const writes = await mount({});
    const freq = numberFields().find((f) => f.value === "148");
    if (freq) {
      typeInto(freq, "");
    }
    await flush();
    const empty = numberFields().at(0);
    if (empty) {
      typeInto(empty, "60");
    }
    await flush();
    expect(writes.at(-1)).toMatchObject({ frequency: "60" });
    expect(numberFields().at(0)?.value).toBe("60");
  });

  it("still shows the declared default for a node that has none stored", async () => {
    // The fallback must survive the fix: undefined is "never set" and still
    // means the default, which is what the render is actually using.
    await mount({});
    expect(numberFields().at(0)?.value).toBe(declared("frequency"));
  });
});

describe("the panel edits the item it is showing", () => {
  /**
   * The arrangement BoardEditor uses: a list of items and the *id* of the one
   * selected, looked up on every render.
   *
   * It used to hold the item itself, captured when the canvas reported the
   * selection — and an item captured once is an item frozen once. The panel
   * re-rendered the config from before the edit, so every field snapped back
   * the moment it changed, and each write spread that stale config, so changing
   * one setting reverted the one changed before it.
   */
  const mountByLookup = async (): Promise<() => Record<string, unknown>> => {
    let items = [halftone({})];
    const id = "h1";
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const draw = () => {
      const selected = items.find((item) => item.id === id) ?? null;
      root?.render(
        <ShaderPanel
          onConfigChange={(itemId, next) => {
            items = items.map((item) =>
              item.id === itemId ? { ...item, config: next } : item
            );
            draw();
          }}
          onExport={() => Promise.resolve()}
          selected={selected}
        />
      );
    };
    draw();
    await flush();
    return () => items[0]?.config ?? {};
  };

  it("keeps a change to the frequency", async () => {
    const configNow = await mountByLookup();
    const freq = numberFields().find((f) => f.value === declared("frequency"));
    if (freq) {
      typeInto(freq, "60");
    }
    await flush();
    expect(configNow().frequency).toBe("60");
    expect(numberFields().at(0)?.value).toBe("60");
  });

  it("keeps both when two settings are changed in turn", async () => {
    // The stale snapshot lost this: the second write spread a config captured
    // before the first, so changing the angle put the frequency back.
    const configNow = await mountByLookup();
    const freq = numberFields().find((f) => f.value === declared("frequency"));
    if (freq) {
      typeInto(freq, "60");
    }
    await flush();
    const angle = numberFields().find((f) => f.value === declared("angle"));
    if (angle) {
      typeInto(angle, "30");
    }
    await flush();
    expect(configNow()).toMatchObject({ angle: "30", frequency: "60" });
  });
});
