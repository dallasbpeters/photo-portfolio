import "../../index.css";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { BoardItem } from "../../types";
import { CanvasMenu } from "./CanvasMenu";

/**
 * That the menu stays on screen, wherever it is opened.
 *
 * A real render rather than only the geometry, because the geometry was never
 * the whole story: `placeInViewport` was correct in isolation while the menu
 * still hung off the bottom, since nothing measured it and applied the result.
 * This asserts the thing that was actually broken — the box on the page, in
 * the window it is in.
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

const item = (extra: Partial<BoardItem> = {}): BoardItem => ({
  body: null,
  config: null,
  creditName: null,
  creditUrl: null,
  fontSize: null,
  height: 200,
  id: "a",
  imageUrl: "https://example.test/a.png",
  kind: "photo",
  nodeType: null,
  photoId: null,
  result: null,
  runError: null,
  runState: null,
  textStyle: null,
  thumbUrl: null,
  width: 200,
  x: 0,
  y: 0,
  z: 1,
  ...extra,
});

/**
 * Opens the menu at a point and hands back the box itself.
 *
 * Every handler is supplied so the menu offers as many rows as it can — a tall
 * menu is the case that clipped, and one with two rows would pass a test that
 * the real thing fails.
 */
const openAt = async (point: {
  x: number;
  y: number;
}): Promise<HTMLElement> => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const subject = item();
  root.render(
    <CanvasMenu
      items={[subject]}
      menu={{ frame: null, point, selection: [subject] }}
      onArrange={() => undefined}
      onBringToFront={() => undefined}
      onCopyFrame={() => undefined}
      onDismiss={() => undefined}
      onExport={() => undefined}
      onGroup={() => undefined}
      onRunTool={() => undefined}
      onSaveElement={() => undefined}
      onSaveRecipe={() => undefined}
      onSendToBack={() => undefined}
      onSendToCanva={() => undefined}
      onVectorize={() => undefined}
      wires={[]}
    />
  );
  await flush();
  const box = host.querySelector<HTMLElement>(".canvas-menu");
  if (!box) {
    throw new Error("the menu did not render");
  }
  return box;
};

/** Whether the box is wholly inside the window it was rendered into. */
const isOnScreen = (box: HTMLElement) => {
  const r = box.getBoundingClientRect();
  return {
    bottomInside: r.bottom <= window.innerHeight,
    leftInside: r.left >= 0,
    rightInside: r.right <= window.innerWidth,
    topInside: r.top >= 0,
  };
};

describe("the canvas menu stays on screen", () => {
  it("does when opened in the middle", async () => {
    const box = await openAt({
      x: Math.round(window.innerWidth / 2),
      y: Math.round(window.innerHeight / 2),
    });
    expect(isOnScreen(box)).toEqual({
      bottomInside: true,
      leftInside: true,
      rightInside: true,
      topInside: true,
    });
  });

  it("does when opened near the bottom — the reported case", async () => {
    // The screenshot: a tall menu opened low enough that its lower rows fell
    // off the window and could not be clicked at all.
    const box = await openAt({
      x: 200,
      y: Math.max(0, window.innerHeight - 40),
    });
    expect(isOnScreen(box)).toEqual({
      bottomInside: true,
      leftInside: true,
      rightInside: true,
      topInside: true,
    });
  });

  it("does when opened near the right edge", async () => {
    const box = await openAt({
      x: Math.max(0, window.innerWidth - 20),
      y: 100,
    });
    expect(isOnScreen(box)).toEqual({
      bottomInside: true,
      leftInside: true,
      rightInside: true,
      topInside: true,
    });
  });

  it("does when opened in the very corner", async () => {
    const box = await openAt({
      x: Math.max(0, window.innerWidth - 4),
      y: Math.max(0, window.innerHeight - 4),
    });
    expect(isOnScreen(box)).toEqual({
      bottomInside: true,
      leftInside: true,
      rightInside: true,
      topInside: true,
    });
  });

  it("scrolls rather than overflowing when it cannot fit at all", async () => {
    const box = await openAt({ x: 200, y: 200 });
    const capped = box.style.maxHeight !== "";
    // Only asserted when the window is genuinely too short for the menu; in a
    // tall test window the menu fits and must NOT be scrollable, because a
    // stray scrollbar on a menu that fits is its own small bug.
    if (capped) {
      expect(box.scrollHeight).toBeGreaterThanOrEqual(box.clientHeight);
      expect(getComputedStyle(box).overflowY).toBe("auto");
    } else {
      expect(getComputedStyle(box).overflowY).not.toBe("auto");
    }
  });
});
