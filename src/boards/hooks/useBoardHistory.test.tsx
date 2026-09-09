import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BoardItem } from "../../types";
import { type BoardHistory, useBoardHistory } from "./useBoardHistory";

/**
 * What the snapshot stack does with a real sequence of gestures.
 *
 * The coalescing window is the part with no test and the part that decides
 * whether ⌘Z feels like it works. A drag emits a change per pointer move, so
 * without coalescing undo steps back through single pixels; with it measured
 * from the wrong moment, a whole gesture goes unrecorded and one ⌘Z throws away
 * two.
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
  vi.useRealTimers();
});

const itemAt = (x: number): BoardItem[] =>
  [{ height: 10, id: "a", width: 10, x, y: 0 }] as unknown as BoardItem[];

const snap = (x: number) => ({ items: itemAt(x), wires: [] });

const mount = async (): Promise<() => BoardHistory> => {
  let latest: BoardHistory | null = null;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  function Probe() {
    latest = useBoardHistory();
    return null;
  }
  root.render(<Probe />);
  await flush();
  await flush();
  return () => latest as BoardHistory;
};

describe("useBoardHistory coalescing", () => {
  it("treats one drag as one entry", async () => {
    const history = (await mount())();
    let clock = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);

    // A drag: a change per pointer move, sixteen milliseconds apart.
    for (let frame = 0; frame < 20; frame += 1) {
      history.record(snap(frame));
      clock += 16;
    }
    history.undo(snap(20));
    expect(history.undo(snap(0))).toBeNull();
  });

  it("records a second gesture that starts soon after the first ends", async () => {
    const history = (await mount())();
    let clock = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);

    // Gesture one: drag an item from 0 to 100.
    for (let frame = 0; frame < 10; frame += 1) {
      history.record(snap(0));
      clock += 16;
    }
    // The pointer is lifted, which is what ends the run. Two hundred
    // milliseconds later — a normal pause between two drags, and well inside
    // the coalescing window — gesture two moves it from 100 to 200.
    history.seal();
    clock += 200;
    for (let frame = 0; frame < 10; frame += 1) {
      history.record(snap(100));
      clock += 16;
    }

    // One ⌘Z undoes gesture two only. Before `seal` this returned 0: the
    // second gesture was swallowed as part of the first, so the single
    // keystroke threw away both drags.
    expect(history.undo(snap(200))?.items[0].x).toBe(100);
  });

  it("still merges the moves inside one gesture after a lift", async () => {
    const history = (await mount())();
    let clock = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);

    history.record(snap(0));
    clock += 16;
    history.seal();
    // A lift before the gesture is over cannot happen, but sealing must not
    // turn every pointer move into its own entry if it did.
    for (let frame = 0; frame < 20; frame += 1) {
      history.record(snap(frame));
      clock += 16;
    }
    history.undo(snap(20));
    expect(history.undo(snap(0))?.items[0].x).toBe(0);
    expect(history.undo(snap(0))).toBeNull();
  });
});
