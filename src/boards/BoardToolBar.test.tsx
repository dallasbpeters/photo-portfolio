import "../index.css";
import { createRef, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { BoardItem } from "../types";
import { BoardToolBar } from "./BoardToolBar";

/**
 * When the bar offers to open the manual editor.
 *
 * The two wrong answers are both silent. Offered on a clip, the photo editor
 * loads an mp4 into an image and shows an empty canvas with working controls —
 * it looks like the editor is broken rather than like the wrong file was
 * opened. Withheld from a picture, there is simply no way in, which is the bug
 * this whole path exists to fix.
 */

let host: HTMLDivElement | null = null;
let root: Root | null = null;

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

const render = async (ui: ReactElement): Promise<HTMLElement> => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  root.render(ui);
  await flush();
  return host;
};

afterEach(() => {
  root?.unmount();
  host?.remove();
  host = null;
  root = null;
});

const item = (over: Partial<BoardItem>): BoardItem =>
  ({
    h: 200,
    id: "one",
    kind: "reference",
    w: 200,
    x: 0,
    y: 0,
    z: 1,
    ...over,
  }) as BoardItem;

/** The first button whose label contains `text`. */
const buttonSaying = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

const bar = async (node: BoardItem, onEditManually?: () => void) => {
  const anchor = createRef<HTMLDivElement>();
  const box = document.createElement("div");
  document.body.append(box);
  Object.assign(anchor, { current: box });
  const el = await render(
    <BoardToolBar
      anchor={anchor}
      chromeScale={{ transform: "scale(1)" }}
      isRunning={false}
      item={node}
      onEditManually={onEditManually}
      onRun={() => {
        /* not under test */
      }}
    />
  );
  const found = [...el.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Edit by hand")
  );
  box.remove();
  return found ?? null;
};

describe("BoardToolBar's mask tools", () => {
  it("offers Replace on an unmasked picture rather than greying it out", async () => {
    // The bug this fixes: Replace sat disabled in the picker until something
    // was painted, and the brush that would paint it lives in a different
    // toolbar with nothing to connect the two. Pressing it now arms that
    // brush, so it has to be pressable while there is still no mask.
    const runs: string[] = [];
    const anchor = createRef<HTMLDivElement>();
    const box = document.createElement("div");
    document.body.append(box);
    Object.assign(anchor, { current: box });
    const el = await render(
      <BoardToolBar
        anchor={anchor}
        chromeScale={{ transform: "scale(1)" }}
        isRunning={false}
        item={item({ imageUrl: "https://example.com/a.png" })}
        onRun={(tool) => runs.push(tool.id)}
      />
    );

    // Behind the picker rather than on the bar itself, which shows only the
    // first few.
    buttonSaying(el, "Tools")?.click();
    await flush();
    const replace = buttonSaying(el, "Replace");
    expect(replace).toBeTruthy();
    expect(replace?.disabled).toBe(false);

    replace?.click();
    await flush();
    box.remove();

    // Straight to the runner, not into the prompt panel: it is the runner that
    // hands over the brush, and words collected first would be thrown away
    // when it stops to ask for the area.
    expect(runs).toEqual(["replace-area"]);
  });
});

describe("BoardToolBar's manual editor button", () => {
  it("is offered on a placed picture", async () => {
    // `reference` is what a dragged-in image becomes — the commonest thing on
    // a board, and the one the editor is most often wanted for.
    expect(
      await bar(item({ imageUrl: "https://example.com/a.png" }), () => {
        /* noop */
      })
    ).not.toBeNull();
  });

  it("is withheld from a clip, which the editor cannot draw", async () => {
    // The URL is the only signal here: a video result and an image result are
    // the same shape, and `imageOf` hands back whichever one is newest.
    expect(
      await bar(item({ imageUrl: "https://example.com/a.mp4" }), () => {
        /* noop */
      })
    ).toBeNull();
  });

  it("is withheld from a node with nothing on it yet", async () => {
    expect(
      await bar(item({ kind: "op", nodeType: "generate" }), () => {
        /* noop */
      })
    ).toBeNull();
  });

  it("is absent when there is no board to save into", async () => {
    // Read-only boards pass no handler. Opening an editor whose save cannot
    // land would be an invitation to lose work.
    expect(
      await bar(item({ imageUrl: "https://example.com/a.png" }))
    ).toBeNull();
  });
});
