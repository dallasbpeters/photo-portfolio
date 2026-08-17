import "../index.css";
import type { ComponentProps, ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { BoardItem } from "../types";
import { BoardItemView } from "./BoardItemView";
import { BoardTextTools } from "./BoardTextTools";
import { PANEL_GAP, placePanel } from "./panelPlacement";

/**
 * What the panel shows, who it edits, and where it sits.
 *
 * The placement is worth a test of its own because getting it wrong is
 * invisible until it happens: an item near the top of the window has no room
 * above it, and a panel that stays there is simply not on screen — with no
 * error, and nothing to click to bring it back.
 */

let host: HTMLDivElement | null = null;
let root: Root | null = null;

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

/**
 * Renders into a box standing in for the item, at a given distance from the
 * top of the window — which is the only thing the placement decision reads.
 */
const mount = async (ui: (anchor: HTMLElement) => ReactElement, top = 400) => {
  host = document.createElement("div");
  host.style.cssText = `position:fixed;left:24px;top:${top}px;width:480px;height:90px;`;
  document.body.append(host);
  root = createRoot(host);
  root.render(ui(host));
  await flush();
  return host;
};

const item = (extra: Partial<BoardItem> = {}): BoardItem => ({
  body: "Hello",
  config: null,
  creditName: null,
  creditUrl: null,
  fontSize: null,
  height: 90,
  id: "a",
  imageUrl: null,
  kind: "text",
  nodeType: null,
  photoId: null,
  result: null,
  runError: null,
  runState: null,
  textStyle: null,
  thumbUrl: null,
  width: 480,
  x: 0,
  y: 0,
  z: 1,
  ...extra,
});

const panelFor = async (
  subject: BoardItem,
  top: number,
  onPatch: (patch: Partial<BoardItem>) => void = () => undefined
) => {
  const box = await mount(
    (anchor) => (
      <BoardTextTools
        anchor={{ current: anchor }}
        chromeScale={{ transform: "scale(1)" }}
        item={subject}
        onPatch={onPatch}
      />
    ),
    top
  );
  return { box, panel: box.firstElementChild as HTMLElement | null };
};

const click = async (el: HTMLElement, label: string) => {
  el.querySelector<HTMLElement>(`[aria-label="${label}"]`)?.click();
  await flush();
};

afterEach(() => {
  root?.unmount();
  host?.remove();
  host = null;
  root = null;
});

describe("placePanel — which side of the item it sits on", () => {
  /**
   * Above by default, below only when above would be off the top of the
   * window. The same rule as anchorBar, for the same reason: a panel below an
   * item covers whatever the item is sitting on, which on a moodboard is
   * usually the thing being compared against.
   */
  it("stays above when there is room", () => {
    expect(placePanel(400, 40)).toBe("above");
  });

  it("flips below when the item is against the top of the window", () => {
    expect(placePanel(0, 40)).toBe("below");
    expect(placePanel(12, 40)).toBe("below");
  });

  it("flips rather than sliding along the top edge", () => {
    // Clamping would keep the panel visible but detach it from its item, which
    // on a board of a hundred items stops it saying what it edits.
    expect(placePanel(40 + PANEL_GAP + 8, 40)).toBe("above");
    expect(placePanel(40 + PANEL_GAP + 7, 40)).toBe("below");
  });

  it("flips for a panel that has grown taller", () => {
    // Opening the extra controls adds a row, which can be the difference
    // between fitting above and not.
    expect(placePanel(90, 40)).toBe("above");
    expect(placePanel(90, 100)).toBe("below");
  });
});

describe("BoardTextTools — where it lands", () => {
  it("sits above the item, clear of its top edge", async () => {
    const { box, panel } = await panelFor(item(), 400);
    const anchored = box.getBoundingClientRect();
    const placed = (panel as HTMLElement).getBoundingClientRect();

    expect(placed.bottom).toBeLessThanOrEqual(anchored.top);
    // Constant on screen: the gap is applied after the counter-scale, so it is
    // the same ten pixels at 20% zoom as at 300%.
    expect(anchored.top - placed.bottom).toBeCloseTo(PANEL_GAP, 0);
  });

  it("drops below the item when there is no room above", async () => {
    const { box, panel } = await panelFor(item(), 4);
    const anchored = box.getBoundingClientRect();
    const placed = (panel as HTMLElement).getBoundingClientRect();

    expect(placed.top).toBeGreaterThanOrEqual(anchored.bottom);
    expect(placed.top).toBeGreaterThan(0);
  });

  it("swallows its own presses so the item underneath does not move", async () => {
    // Without this the canvas reads a press on a control as the start of a
    // drag and the item slides out from under the pointer mid-edit. The
    // wrapper stands in for the item's own onPointerDown, which is the handler
    // that starts the drag.
    const presses: string[] = [];
    const box = await mount((anchor) => (
      <div onPointerDown={() => presses.push("item")}>
        <BoardTextTools
          anchor={{ current: anchor }}
          chromeScale={{ transform: "scale(1)" }}
          item={item()}
          onPatch={() => undefined}
        />
      </div>
    ));

    box
      .querySelector<HTMLElement>('[aria-label="Align center"]')
      ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await flush();

    expect(presses).toEqual([]);
  });
});

describe("BoardTextTools — what it edits", () => {
  it("is absent for an item with no words in it", async () => {
    const { box } = await panelFor(item({ body: null, kind: "photo" }), 400);
    expect(box.textContent).toBe("");
  });

  it("names the family and weight before either menu is opened", async () => {
    // A select only learns a label when its popup mounts, so without the
    // `items` maps the panel reads "cormorant-garamond" and "700" until each
    // menu has been opened once — and after a reload it does it again.
    const { box } = await panelFor(
      item({
        fontSize: 58,
        textStyle: {
          align: null,
          color: null,
          family: "fraunces",
          italic: null,
          letterSpacing: null,
          lineHeight: null,
          transform: null,
          weight: 500,
        },
      }),
      400
    );
    expect(box.textContent).toBe("Fraunces▼Medium▼58");
  });

  it("writes a style property back through one patch", async () => {
    const patches: Partial<BoardItem>[] = [];
    const { box } = await panelFor(item(), 400, (next) => patches.push(next));

    await click(box, "Align center");

    expect(patches[0]?.textStyle?.align).toBe("center");
    // Untouched properties stay unset rather than being written as defaults.
    expect(patches[0]?.textStyle?.weight).toBeNull();
  });

  it("steps the size, which lives in its own column", async () => {
    const patches: Partial<BoardItem>[] = [];
    const { box } = await panelFor(item({ fontSize: 40 }), 400, (next) =>
      patches.push(next)
    );

    await click(box, "Increase text size");
    // One callback, two destinations: `fontSize` is a column of its own and
    // `textStyle` a JSONB blob, and the panel does not have to care.
    expect(patches[0]?.fontSize).toBe(44);
    expect(patches[0]).not.toHaveProperty("textStyle");
  });

  it("merges a change into the style rather than replacing it", async () => {
    const patches: Partial<BoardItem>[] = [];
    const { box } = await panelFor(
      item({ textStyle: { family: "inter" } as never }),
      400,
      (next) => patches.push(next)
    );

    await click(box, "Align right");

    expect(patches[0]?.textStyle?.family).toBe("inter");
    expect(patches[0]?.textStyle?.align).toBe("right");
  });
});

describe("who gets a panel", () => {
  /**
   * Requirement, and the reason `isSoleSelected` exists: with three text items
   * picked, three panels would be a wall of controls and one panel would be
   * editing whichever item it happened to hold. Neither is acceptable, so the
   * panel is simply absent — visibly unavailable rather than quietly wrong.
   */
  const board = (props: Partial<ComponentProps<typeof BoardItemView>> = {}) => (
    <BoardItemView
      index={0}
      isEditing={false}
      isSelected
      item={item()}
      onBeginEdit={() => undefined}
      onDelete={() => undefined}
      onEditBody={() => undefined}
      onPatch={() => undefined}
      onResizeStart={() => undefined}
      onSelect={() => undefined}
      scale={1}
      {...props}
    />
  );

  it("appears for the lone selection", async () => {
    const box = await mount(() => board({ isSoleSelected: true }));
    expect(box.querySelector('[aria-label="Align center"]')).not.toBeNull();
  });

  it("is absent when it is one of several selected", async () => {
    const box = await mount(() => board({ isSoleSelected: false }));
    expect(box.querySelector('[aria-label="Align center"]')).toBeNull();
  });

  it("is absent on a published board nobody can edit", async () => {
    const box = await mount(() =>
      board({ isSoleSelected: true, readOnly: true })
    );
    expect(box.querySelector('[aria-label="Align center"]')).toBeNull();
  });
});
