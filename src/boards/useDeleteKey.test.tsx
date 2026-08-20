import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useDeleteKey } from "./useDeleteKey";

/**
 * The Delete key, and the one case where it must do nothing.
 *
 * The guard matters more than the feature. A caret sitting in a prompt field
 * must delete a character; deleting the node the prompt is being written on
 * instead destroys work that has never been saved, and a keystroke aimed at a
 * text box has no undo.
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

const press = (key: string, target: EventTarget = window) => {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key })
  );
};

const mount = async (enabled = true): Promise<{ calls: () => number }> => {
  let count = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  function Probe() {
    useDeleteKey(() => {
      count += 1;
    }, enabled);
    return <textarea defaultValue="a prompt" />;
  }
  root.render(<Probe />);
  // Twice: one pass paints, the next lets the effect that binds the listener
  // run. Under a loaded suite the single flush landed before it had attached
  // and the first keypress went nowhere.
  await flush();
  await flush();
  return { calls: () => count };
};

describe("useDeleteKey", () => {
  it("removes on Delete", async () => {
    const { calls } = await mount();
    press("Delete");
    expect(calls()).toBe(1);
  });

  it("removes on Backspace too", async () => {
    // Which key deletes is a platform habit, not a decision: a Mac keyboard
    // may have no Delete key at all.
    const { calls } = await mount();
    press("Backspace");
    expect(calls()).toBe(1);
  });

  it("ignores every other key", async () => {
    const { calls } = await mount();
    for (const key of ["a", "Enter", "Escape", "ArrowLeft", " "]) {
      press(key);
    }
    expect(calls()).toBe(0);
  });

  it("does nothing while something is being typed into", async () => {
    const { calls } = await mount();
    const field = host?.querySelector("textarea");
    if (field) {
      press("Backspace", field);
    }
    expect(calls()).toBe(0);
  });

  it("does nothing on a board that cannot be edited", async () => {
    const { calls } = await mount(false);
    press("Delete");
    expect(calls()).toBe(0);
  });

  it("stops listening once it is unmounted", async () => {
    const { calls } = await mount();
    root?.unmount();
    root = null;
    press("Delete");
    expect(calls()).toBe(0);
  });
});
