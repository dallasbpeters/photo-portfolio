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

describe("which items get a bar at all", () => {
  it("gives a generating node none, even when it has produced something", async () => {
    // The whole bar, not one button. `toolsForKind` is what decides, so the
    // right-click menu's Tools section disappears with it — one answer, two
    // surfaces, which is the point of the registry.
    const anchor = createRef<HTMLDivElement>();
    const box = document.createElement("div");
    document.body.append(box);
    Object.assign(anchor, { current: box });
    const el = await render(
      <BoardToolBar
        anchor={anchor}
        chromeScale={{ transform: "scale(1)" }}
        isRunning={false}
        item={item({
          kind: "op",
          nodeType: "generate",
          result: { url: "https://example.com/made.png" },
        } as Partial<BoardItem>)}
        onRun={() => {
          /* not under test */
        }}
      />
    );
    box.remove();
    expect(el.querySelectorAll("button")).toHaveLength(0);
  });

  it("gives a placed picture the full bar", async () => {
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
        onRun={() => {
          /* not under test */
        }}
      />
    );
    box.remove();
    expect(el.querySelectorAll("button").length).toBeGreaterThan(0);
  });
});

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

  it("is withheld from a generating node, which has no picture of its own", async () => {
    // And not only this button: a node gets no bar at all. It is the recipe for
    // a picture rather than a picture, with its own model, prompt and Run, and
    // a tool pointed at it could only mean the selected version — which the
    // next run replaces, taking the edit with it and saying nothing.
    expect(
      await bar(
        item({
          kind: "op",
          nodeType: "generate",
          result: { url: "https://example.com/made.png" },
        } as Partial<BoardItem>),
        () => {
          /* noop */
        }
      )
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

describe("saving the picture", () => {
  /** Every button label currently on screen. */
  const labels = (): string[] =>
    [...document.body.querySelectorAll("button")].map(
      (b) => b.textContent ?? ""
    );

  it("offers Save for an item that has one", async () => {
    // There was no way to get an ordinary image off a board at all: a node's
    // own result had a download button and nothing else did, so a photograph
    // could be looked at and worked on and never taken away. The way out was a
    // right-click, which the canvas overrides.
    await bar(item({ imageUrl: "https://example.test/a.png" }));
    expect(labels().some((text) => text.includes("Save"))).toBe(true);
  });

  it("does not offer it for an item with no picture", async () => {
    await bar(item({ body: "a note", kind: "note" }));
    expect(labels().some((text) => text.includes("Save"))).toBe(false);
  });
});
