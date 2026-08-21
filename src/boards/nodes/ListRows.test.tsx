import "../../index.css";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { BoardItem, BoardWire } from "../../types";
import { wiredItemsFor } from "../canvas/wiredPreviews";
import { OpNodeView } from "./OpNodeView";

/**
 * An Iterate node wired into a List, from the wire to the rows on screen.
 *
 * Asserted through the real components rather than against listSync alone,
 * because the interesting failure is not in the decision — it is in the
 * plumbing around it. A List that resolves its wire correctly and never writes
 * the result, or writes it and immediately overwrites it again, passes every
 * pure test and is useless on the board.
 *
 * The second render is the important one. It feeds back what the first render
 * asked to store, which is what a real save does, and it is the only way to
 * prove the fill settles instead of firing on every pass.
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

const item = (over: Partial<BoardItem>): BoardItem => ({
  body: null,
  config: {},
  creditName: null,
  creditUrl: null,
  fontSize: null,
  height: 320,
  id: "x",
  imageUrl: null,
  kind: "op",
  nodeType: "list",
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

const wire = (sourceItemId: string, targetItemId: string): BoardWire => ({
  id: `${sourceItemId}->${targetItemId}`,
  sourceItemId,
  sourcePort: "out",
  targetItemId,
  targetPort: "text",
});

/**
 * A List node on screen, and every config it asked to store.
 *
 * Re-renders itself with each stored config, exactly as the board does — the
 * only way an effect that writes can be shown to settle.
 */
const mountList = async (
  listItem: BoardItem,
  wired: readonly string[]
): Promise<{ box: HTMLElement; writes: Record<string, unknown>[] }> => {
  const writes: Record<string, unknown>[] = [];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  let current = listItem;
  const draw = () => {
    root?.render(
      <OpNodeView
        hasWiredPrompt={false}
        item={current}
        onCancel={() => undefined}
        onConfigChange={(config) => {
          writes.push(config);
          current = { ...current, config };
          draw();
        }}
        onRun={() => undefined}
        readOnly={false}
        wiredItems={wired}
      />
    );
  };
  draw();
  await flush();
  await flush();
  return { box: host, writes };
};

/** The text of every row's textarea, which is what the author actually sees. */
const rowsOnScreen = (box: HTMLElement): string[] =>
  Array.from(box.querySelectorAll("textarea")).map((field) => field.value);

describe("what an Iterate node hands a List", () => {
  it("resolves the prompts the template describes", () => {
    // The graph half: a real Iterate node, expanded through the real resolver.
    const iterate = item({
      config: { template: "a {} chair, studio lit", values: "oak\nsteel" },
      id: "it",
      nodeType: "iterate",
    });
    const list = item({ id: "ls" });
    expect(
      wiredItemsFor(list, { items: [iterate, list], wires: [wire("it", "ls")] })
    ).toEqual(["a oak chair, studio lit", "a steel chair, studio lit"]);
  });

  it("flattens several wires in wire order", () => {
    const a = item({
      config: { text: "one\ntwo" },
      id: "a",
      nodeType: "prompt",
    });
    const b = item({ config: { text: "three" }, id: "b", nodeType: "prompt" });
    const list = item({ id: "ls" });
    expect(
      wiredItemsFor(list, {
        items: [a, b, list],
        wires: [wire("a", "ls"), wire("b", "ls")],
      })
    ).toEqual(["one", "two", "three"]);
  });
});

describe("a List fills itself from its wire", () => {
  it("writes the rows without anyone pressing anything", async () => {
    const { writes } = await mountList(item({ id: "ls" }), ["red", "blue"]);
    expect(writes.at(-1)?.items).toBe("red\nblue");
  });

  it("shows them as editable rows", async () => {
    const { box } = await mountList(item({ id: "ls" }), ["red", "blue"]);
    expect(rowsOnScreen(box)).toEqual(["red", "blue"]);
  });

  it("records the fill alongside the rows, in one write", async () => {
    // Two writes would each spread a config captured before the other landed,
    // and the rows would arrive with no record of where they came from — read
    // on the next render as a hand edit.
    const { writes } = await mountList(item({ id: "ls" }), ["red"]);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ filled: "red", items: "red" });
  });

  it("stops after one write instead of filling on every render", async () => {
    // The failure this guards against is a render loop that saves forever.
    const { writes } = await mountList(item({ id: "ls" }), ["red", "blue"]);
    expect(writes).toHaveLength(1);
  });

  it("leaves a hand-edited list alone", async () => {
    const { box, writes } = await mountList(
      item({ config: { filled: "red\nblue", items: "red\nTEAL" }, id: "ls" }),
      ["red", "blue", "green"]
    );
    expect(writes).toHaveLength(0);
    expect(rowsOnScreen(box)).toEqual(["red", "TEAL"]);
  });

  it("offers the refill rather than taking it", async () => {
    const { box } = await mountList(
      item({ config: { filled: "red\nblue", items: "red\nTEAL" }, id: "ls" }),
      ["red", "blue", "green"]
    );
    const refill = Array.from(box.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Refill")
    );
    expect(refill?.textContent).toContain("(3)");
  });

  it("takes the refill once it is asked for", async () => {
    const { box, writes } = await mountList(
      item({ config: { filled: "red\nblue", items: "red\nTEAL" }, id: "ls" }),
      ["red", "blue", "green"]
    );
    const refill = Array.from(box.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Refill")
    );
    refill?.click();
    await flush();
    expect(writes.at(-1)).toMatchObject({
      filled: "red\nblue\ngreen",
      items: "red\nblue\ngreen",
    });
    expect(rowsOnScreen(box)).toEqual(["red", "blue", "green"]);
  });

  it("does not offer a refill when nothing is wired in", async () => {
    const { box } = await mountList(
      item({ config: { items: "red\nblue" }, id: "ls" }),
      []
    );
    expect(box.textContent).not.toContain("Refill");
  });
});
