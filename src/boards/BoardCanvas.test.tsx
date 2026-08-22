import "../index.css";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { BoardItem, BoardWire } from "../types";
import { BoardCanvas } from "./BoardCanvas";

/**
 * The canvas itself: what it draws, what it lets you pick up, and what it
 * refuses when the board is not yours.
 *
 * Worth testing in a real browser rather than reasoned about. Every failure
 * here is silent — an item drawn at the wrong place still looks like an item, a
 * selection that never reaches the editor looks exactly like a tool bar that
 * chose not to appear, and a read-only board that quietly accepts a drag looks
 * fine until a visitor's rearrangement is autosaved over the owner's.
 *
 * The geometry assertions are the point of using Chromium: these positions come
 * from real layout against a real transform, which jsdom cannot produce.
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

const item = (over: Partial<BoardItem> & { id: string }): BoardItem => ({
  body: null,
  config: null,
  creditName: null,
  creditUrl: null,
  fontSize: null,
  height: 200,
  imageUrl: "https://example.test/a.png",
  kind: "reference",
  nodeType: null,
  photoId: null,
  result: null,
  runError: null,
  runState: null,
  textStyle: null,
  thumbUrl: null,
  width: 200,
  x: 100,
  y: 100,
  z: 1,
  ...over,
});

interface Harness {
  box: HTMLDivElement;
  changed: BoardItem[][];
  selected: (BoardItem | null)[];
  wired: BoardWire[][];
}

const render = async (
  items: BoardItem[],
  extra: Record<string, unknown> = {}
): Promise<Harness> => {
  const changed: BoardItem[][] = [];
  const selected: (BoardItem | null)[] = [];
  const wired: BoardWire[][] = [];
  host = document.createElement("div");
  // A real size: the canvas frames its content against the container, and a
  // zero-height host would put every item at the same place.
  host.style.width = "1200px";
  host.style.height = "800px";
  document.body.append(host);
  root = createRoot(host);
  root.render(
    <BoardCanvas
      boardId="board-1"
      items={items}
      keyOf={(i) => i.id}
      onChange={(next) => changed.push(next)}
      onSelectionChange={(i) => selected.push(i)}
      onWiresChange={(next) => wired.push(next)}
      {...extra}
    />
  );
  await flush();
  return { box: host, changed, selected, wired };
};

/** Every item the canvas has drawn, in DOM order. */
const drawn = (box: HTMLElement): HTMLElement[] =>
  Array.from(box.querySelectorAll<HTMLElement>("div.board-item"));

const press = async (el: Element, over: Partial<PointerEventInit> = {}) => {
  el.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      isPrimary: true,
      pointerId: 1,
      ...over,
    })
  );
  await flush();
};

describe("BoardCanvas — drawing what it is given", () => {
  it("draws one element per item", async () => {
    const { box } = await render([
      item({ id: "a" }),
      item({ id: "b", x: 600 }),
      item({ id: "c", y: 600 }),
    ]);
    expect(drawn(box)).toHaveLength(3);
  });

  it("draws nothing for an empty board, without failing", async () => {
    const { box } = await render([]);
    expect(drawn(box)).toHaveLength(0);
  });

  it("gives each item its own size in canvas units", async () => {
    const { box } = await render([item({ height: 120, id: "a", width: 480 })]);
    const [el] = drawn(box);
    // Read off the inline style rather than the rendered box: the rendered box
    // is scaled by whatever zoom the canvas chose to frame the content at.
    expect(el?.style.width).toBe("480px");
    expect(el?.style.height).toBe("120px");
  });

  it("places items apart when their coordinates differ", async () => {
    const { box } = await render([
      item({ id: "a", x: 100, y: 100 }),
      item({ id: "b", x: 900, y: 700 }),
    ]);
    const [a, b] = drawn(box);
    const first = a?.getBoundingClientRect();
    const second = b?.getBoundingClientRect();
    expect(second?.left ?? 0).toBeGreaterThan(first?.left ?? 0);
    expect(second?.top ?? 0).toBeGreaterThan(first?.top ?? 0);
  });

  it("keeps drawing an item that has no picture yet", async () => {
    // A generation in flight has no URL. Dropping it from the canvas would make
    // a node vanish for the two minutes it is working.
    const { box } = await render([
      item({ id: "a", imageUrl: null, kind: "op", nodeType: "generate" }),
    ]);
    expect(drawn(box)).toHaveLength(1);
  });
});

describe("BoardCanvas — selection", () => {
  it("reports the item that was pressed", async () => {
    const { box, selected } = await render([
      item({ id: "a" }),
      item({ id: "b", x: 600 }),
    ]);
    const [first] = drawn(box);
    if (!first) {
      throw new Error("nothing drawn");
    }
    await press(first);
    expect(selected.at(-1)?.id).toBe("a");
  });

  it("rings the selected item so it is visible as well as reported", async () => {
    const { box } = await render([item({ id: "a" })]);
    const [el] = drawn(box);
    if (!el) {
      throw new Error("nothing drawn");
    }
    await press(el);
    expect(el.className).toContain("board-item--selected");
  });

  it("moves the selection when another item is pressed", async () => {
    const { box, selected } = await render([
      item({ id: "a" }),
      item({ id: "b", x: 600 }),
    ]);
    const [first, second] = drawn(box);
    if (!(first && second)) {
      throw new Error("nothing drawn");
    }
    await press(first);
    await press(second);
    expect(selected.at(-1)?.id).toBe("b");
  });

  it("does not report a selection for a right-click", async () => {
    // A right-click opens the menu and must not begin a drag — letting it
    // through meant the menu opened over a gesture holding stale positions.
    const { box, selected } = await render([item({ id: "a" })]);
    const before = selected.length;
    const [el] = drawn(box);
    if (!el) {
      throw new Error("nothing drawn");
    }
    await press(el, { button: 2 });
    expect(selected.length).toBe(before);
  });
});

describe("BoardCanvas — a board that is not yours", () => {
  it("draws every item exactly as an editable board does", async () => {
    const { box } = await render(
      [item({ id: "a" }), item({ id: "b", x: 600 })],
      { readOnly: true }
    );
    expect(drawn(box)).toHaveLength(2);
  });

  it("never rings an item, because there is nothing to do with one", async () => {
    const { box } = await render([item({ id: "a" })], { readOnly: true });
    const [el] = drawn(box);
    if (!el) {
      throw new Error("nothing drawn");
    }
    await press(el);
    expect(el.className).not.toContain("board-item--selected");
  });

  it("does not change the arrangement when an item is pressed", async () => {
    // The real hazard: a visitor's accidental drag being autosaved over the
    // owner's board. Nothing a read-only canvas does may reach onChange.
    const { box, changed } = await render([item({ id: "a" })], {
      readOnly: true,
    });
    const [el] = drawn(box);
    if (!el) {
      throw new Error("nothing drawn");
    }
    await press(el);
    expect(changed).toHaveLength(0);
  });
});

describe("BoardCanvas — wires", () => {
  it("draws a board that has wires without touching them", async () => {
    const wires: BoardWire[] = [
      {
        id: "w1",
        sourceItemId: "a",
        sourcePort: "out",
        targetItemId: "b",
        targetPort: "image",
      },
    ];
    const { box, wired } = await render(
      [
        item({ id: "a" }),
        item({ id: "b", kind: "op", nodeType: "generate", x: 600 }),
      ],
      { wires }
    );
    expect(drawn(box)).toHaveLength(2);
    // Rendering is not an edit. A wire change reported on mount would mark the
    // board dirty and autosave it the moment it was opened.
    expect(wired).toHaveLength(0);
  });

  it("does not report a change merely for having been rendered", async () => {
    const { changed } = await render([item({ id: "a" }), item({ id: "b" })]);
    expect(changed).toHaveLength(0);
  });
});
