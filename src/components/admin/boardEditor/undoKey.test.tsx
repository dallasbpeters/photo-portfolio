import { useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useBoardHistory } from "../../../boards/hooks/useBoardHistory";
import type { BoardItem, BoardWire } from "../../../types";
import { useBoardWindowEvents } from "./useBoardWindowEvents";

/**
 * ⌘Z, end to end, with the real history.
 *
 * There was no test over this at all, which is why "undo stopped working" could
 * only be answered by clicking. The three things that can each silently break
 * it are the recording (a snapshot taken inside a setter), the key guard (a
 * caret in a field must keep its own undo) and the restore.
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

const press = (target: EventTarget = window, shiftKey = false) => {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "z",
      metaKey: true,
      shiftKey,
    })
  );
};

const itemAt = (id: string, x: number): BoardItem =>
  ({ height: 10, id, width: 10, x, y: 0 }) as unknown as BoardItem;

interface Harness {
  edit: (next: BoardItem[]) => void;
  items: () => BoardItem[];
}

const mount = async (): Promise<Harness> => {
  const api: Partial<Harness> = {};
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);

  function Probe() {
    const [items, setItems] = useState<BoardItem[]>([itemAt("a", 0)]);
    const [wires, setWires] = useState<BoardWire[]>([]);
    const [isDirty, setIsDirty] = useState(false);
    const history = useBoardHistory();
    const pending = useRef({ isDirty, isLoaded: true, items, wires });
    pending.current = { isDirty, isLoaded: true, items, wires };

    useBoardWindowEvents({
      boardId: "b1",
      history,
      pending,
      setDrawTool: () => undefined,
      setIsDirty,
      setIsInserting: () => undefined,
      setItems,
      setWires,
    });

    api.items = () => items;
    // The same shape useBoardDocument's `change` has: record the state about to
    // be replaced, then replace it.
    api.edit = (next) => {
      setItems((currentItems) => {
        setWires((currentWires) => {
          history.record({ items: currentItems, wires: currentWires });
          return currentWires;
        });
        return currentItems;
      });
      setItems(next);
      setIsDirty(true);
    };
    return <textarea defaultValue="a prompt" />;
  }

  root.render(<Probe />);
  await flush();
  await flush();
  return api as Harness;
};

describe("⌘Z on a board", () => {
  it("puts back the arrangement the last edit replaced", async () => {
    const harness = await mount();
    harness.edit([itemAt("a", 500)]);
    await flush();
    expect(harness.items()[0].x).toBe(500);

    press();
    await flush();
    expect(harness.items()[0].x).toBe(0);
  });

  it("redoes with shift", async () => {
    const harness = await mount();
    harness.edit([itemAt("a", 500)]);
    await flush();
    press();
    await flush();
    press(window, true);
    await flush();
    expect(harness.items()[0].x).toBe(500);
  });

  it("does nothing with an empty history", async () => {
    const harness = await mount();
    press();
    await flush();
    expect(harness.items()[0].x).toBe(0);
  });

  it("undoes one drag, then the drag before it", async () => {
    // The shape a real gesture has: a change per pointer move, then a lift.
    // Two of them, close enough together that the coalescing window used to
    // treat them as one and lose the second.
    const harness = await mount();
    const drag = async (from: number, to: number) => {
      for (let frame = 0; frame <= 10; frame += 1) {
        harness.edit([itemAt("a", from + ((to - from) * frame) / 10)]);
      }
      await flush();
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      await flush();
    };

    await drag(0, 100);
    await drag(100, 200);
    expect(harness.items()[0].x).toBe(200);

    press();
    await flush();
    expect(harness.items()[0].x).toBe(100);

    press();
    await flush();
    expect(harness.items()[0].x).toBe(0);
  });

  it("leaves a field's own undo alone", async () => {
    const harness = await mount();
    harness.edit([itemAt("a", 500)]);
    await flush();
    const field = host?.querySelector("textarea");
    field?.focus();
    press(field ?? window);
    await flush();
    expect(harness.items()[0].x).toBe(500);
  });
});
