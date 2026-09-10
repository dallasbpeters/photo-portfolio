import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { usePanModifier } from "./usePanModifier";

/**
 * The keys that arm a pan, and the ways they get stuck.
 *
 * Being stuck is the failure that matters. A board left in pan mode cannot
 * select anything and offers no clue why, and every route into that state is a
 * keyup that never arrived — a second modifier released first, a window that
 * took focus mid-drag.
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

/** Modifier flags describe the keyboard *after* the event, as browsers do. */
const key = (
  type: "keydown" | "keyup",
  code: string,
  target: EventTarget = window
) => {
  target.dispatchEvent(
    new KeyboardEvent(type, { bubbles: true, cancelable: true, code })
  );
};

const mount = async (): Promise<{ held: () => boolean }> => {
  let latest = false;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  function Probe() {
    latest = usePanModifier().held;
    return <textarea defaultValue="a prompt" />;
  }
  root.render(<Probe />);
  await flush();
  await flush();
  return { held: () => latest };
};

describe("usePanModifier", () => {
  it("arms on space, shift or control, and disarms on release", async () => {
    // Written out rather than looped: each key is pressed and released in
    // turn, so one that arms but never disarms is caught by the pair after it
    // rather than left for a later test to trip over.
    const probe = await mount();

    key("keydown", "Space");
    await flush();
    expect(probe.held()).toBe(true);
    key("keyup", "Space");
    await flush();
    expect(probe.held()).toBe(false);

    key("keydown", "ShiftLeft");
    await flush();
    expect(probe.held()).toBe(true);
    key("keyup", "ShiftLeft");
    await flush();
    expect(probe.held()).toBe(false);

    key("keydown", "ControlRight");
    await flush();
    expect(probe.held()).toBe(true);
    key("keyup", "ControlRight");
    await flush();
    expect(probe.held()).toBe(false);
  });

  it("stays armed while a second pan key is still down", async () => {
    // Reaching for Control mid-drag and letting Shift go must not drop the
    // board. A boolean could not tell the difference; the key set can.
    const probe = await mount();
    key("keydown", "ShiftLeft");
    key("keydown", "ControlLeft");
    await flush();
    key("keyup", "ShiftLeft");
    await flush();
    expect(probe.held()).toBe(true);
    key("keyup", "ControlLeft");
    await flush();
    expect(probe.held()).toBe(false);
  });

  it("ignores every other key", async () => {
    const probe = await mount();
    for (const code of ["KeyA", "AltLeft", "MetaLeft", "Enter", "Escape"]) {
      key("keydown", code);
    }
    await flush();
    expect(probe.held()).toBe(false);
  });

  it("does nothing while something is being typed into", async () => {
    // Shift is how a capital letter is typed. Arming a pan on it would make
    // the canvas twitch under every sentence written on a note.
    const probe = await mount();
    const field = host?.querySelector("textarea");
    if (field) {
      key("keydown", "ShiftLeft", field);
    }
    await flush();
    expect(probe.held()).toBe(false);
  });

  it("swallows the context menu a control-pan would open", async () => {
    // macOS makes Control+click the secondary click, so arming a pan with
    // Control also fires contextmenu — the board would pan and open a menu
    // over itself at once.
    const probe = await mount();
    key("keydown", "ControlLeft");
    await flush();
    expect(probe.held()).toBe(true);

    const menu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });

  it("leaves an ordinary right-click alone", async () => {
    await mount();
    const menu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(false);
  });

  it("lets go when the window does", async () => {
    // The one keyup that never arrives: cmd-tab away mid-drag, and without
    // this the board is stuck in pan mode on the way back.
    const probe = await mount();
    key("keydown", "ShiftLeft");
    await flush();
    window.dispatchEvent(new Event("blur"));
    await flush();
    expect(probe.held()).toBe(false);
  });
});
