import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { BoardItem } from "../types";
import { ItemMedia } from "./ItemMedia";

/**
 * What an item shows after a tool has run on it.
 *
 * This failed in the quietest way possible: Rotate and Edit both ran, both
 * uploaded a new picture, both wrote it to `result` — and the canvas went on
 * rendering `imageUrl`, so every tool looked like it did nothing. Nothing threw,
 * nothing was logged, and the work was on the item the whole time.
 */
let host: HTMLDivElement | null = null;
let root: Root | null = null;

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

const render = async (item: BoardItem): Promise<HTMLElement> => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  root.render(<ItemMedia isIcon={false} item={item} />);
  await flush();
  return host;
};

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
});

const itemWith = (fields: Partial<BoardItem>): BoardItem =>
  ({
    height: 100,
    id: "i1",
    imageUrl: "https://example.test/original.png",
    kind: "reference",
    width: 100,
    ...fields,
  }) as unknown as BoardItem;

describe("ItemMedia — which picture is shown", () => {
  it("shows the item's own picture when no tool has run", async () => {
    const box = await render(itemWith({}));
    expect(box.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.test/original.png"
    );
  });

  it("shows what a tool made, not the original", async () => {
    const box = await render(
      itemWith({
        result: {
          url: "https://example.test/rotated.png",
        } as BoardItem["result"],
      })
    );
    expect(box.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.test/rotated.png"
    );
  });

  it("falls back to the original when a result carries no url", async () => {
    // A result exists for other reasons — an Analyse node stores words — and
    // reading `url` off one of those must not blank the picture.
    const box = await render(
      itemWith({ result: { description: "some words" } as BoardItem["result"] })
    );
    expect(box.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.test/original.png"
    );
  });

  it("renders a clip as video, from the result", async () => {
    const box = await render(
      itemWith({
        result: {
          url: "https://example.test/boards/video/a.mp4",
        } as BoardItem["result"],
      })
    );
    expect(box.querySelector("video")).not.toBeNull();
    expect(box.querySelector("img")).toBeNull();
  });
});
