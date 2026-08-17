import "../index.css";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { BoardItemKind } from "../types";
import { ToolPicker, type ToolPickerProps } from "./ToolPicker";

/**
 * What the picker refuses to do.
 *
 * The interesting cases all fail silently if they regress: a blocked tool that
 * still calls `onPick` costs real money on the next step, a planned tool that
 * is pickable reaches an executor that can only reject it, and a search that
 * only looks at labels loses every synonym in the registry without any error.
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

const picked: string[] = [];
/** The words each pick carried, index-matched to `picked`. */
const pickedPrompts: (string | undefined)[] = [];
const closed: string[] = [];

afterEach(() => {
  picked.length = 0;
  pickedPrompts.length = 0;
  closed.length = 0;
});

const open = (props: Partial<ToolPickerProps> = {}) =>
  render(
    <ToolPicker
      context={{ hasImage: true, hasMask: false, hasPrompt: true }}
      kind={"photo" as BoardItemKind}
      onClose={() => closed.push("closed")}
      onPick={(tool, prompt) => {
        picked.push(tool.id);
        pickedPrompts.push(prompt);
      }}
      {...props}
    />
  );

const rows = (box: HTMLElement): HTMLButtonElement[] =>
  Array.from(box.querySelectorAll<HTMLButtonElement>('[role="option"]'));

const labels = (box: HTMLElement): string[] =>
  rows(box).map(
    (row) => row.querySelector("[data-tool-label]")?.textContent ?? ""
  );

const rowNamed = (box: HTMLElement, label: string): HTMLButtonElement => {
  const found = rows(box).find(
    (row) => row.querySelector("[data-tool-label]")?.textContent === label
  );
  if (!found) {
    throw new Error(`no row for ${label}: saw ${labels(box).join(", ")}`);
  }
  return found;
};

const type = async (box: HTMLElement, value: string) => {
  const field = box.querySelector<HTMLInputElement>('input[role="combobox"]');
  if (!field) {
    throw new Error("no search box");
  }
  // The value setter React's onChange listens for, rather than assigning
  // `.value`, which React's synthetic layer does not see.
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  await flush();
};

const press = async (box: HTMLElement, key: string) => {
  box
    .querySelector('input[role="combobox"]')
    ?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
  await flush();
};

// The group tabs are the only buttons in the picker that are not rows, so the
// rows are excluded by role rather than by a test id the component would
// otherwise have to carry.
const tab = async (box: HTMLElement, label: string) => {
  const found = Array.from(
    box.querySelectorAll<HTMLButtonElement>('button:not([role="option"])')
  ).find((button) => button.textContent === label);
  if (!found) {
    throw new Error(`no tab for ${label}`);
  }
  found.click();
  await flush();
};

describe("ToolPicker — which tools are listed", () => {
  it("lists only the tools that apply to this kind of item", async () => {
    // A note has no image, so only Generate — which invents one — applies.
    const box = await open({ kind: "note" as BoardItemKind });
    expect(labels(box)).toEqual(["Generate"]);
  });

  it("keeps a tool it cannot run visible, with the reason", async () => {
    // Hidden, it would teach nobody that the tool exists or what unlocks it —
    // "why can't I click this" is answerable, "where is it" is not. A missing
    // *prompt* is deliberately not one of these: see the prompt-step tests.
    const box = await open({
      context: { hasImage: false, hasMask: false, hasPrompt: true },
    });
    const row = rowNamed(box, "Rotate right");

    expect(row.disabled).toBe(true);
    expect(row.textContent).toContain("needs an image");
  });

  it("never reaches the executor for an unrunnable tool that is clicked", async () => {
    const box = await open({
      context: { hasImage: false, hasMask: false, hasPrompt: true },
    });
    rowNamed(box, "Rotate right").click();
    await flush();

    expect(picked).toEqual([]);
  });

  it("shows a planned tool, marked and unpickable", async () => {
    const box = await open();
    const row = rowNamed(box, "Crop");

    expect(row.textContent).toContain("Soon");
    expect(row.disabled).toBe(true);
    row.click();
    await flush();
    expect(picked).toEqual([]);
  });

  it("hands back a ready tool", async () => {
    const box = await open();
    rowNamed(box, "Rotate right").click();
    await flush();

    expect(picked).toEqual(["rotate-right"]);
  });
});

describe("ToolPicker — search and tabs", () => {
  it("matches a keyword that appears nowhere in the label", async () => {
    // "inpaint" is a keyword on the tool labelled "Replace". Searching labels
    // alone would find nothing, and the search would look broken to the one
    // person who knows the word for it.
    const box = await open();
    await type(box, "inpaint");

    expect(labels(box)).toEqual(["Replace"]);
  });

  it("narrows rather than widens as terms are added", async () => {
    const box = await open();
    await type(box, "rotate");
    expect(labels(box)).toEqual(["Rotate right", "Rotate left"]);

    await type(box, "rotate left");
    expect(labels(box)).toEqual(["Rotate left"]);
  });

  it("says so when nothing matches", async () => {
    const box = await open();
    await type(box, "zzzz");

    expect(rows(box)).toHaveLength(0);
    expect(box.textContent).toContain("No tools match");
  });

  it("filters to one group without losing the kind filter", async () => {
    const box = await open();
    await tab(box, "Transform");

    expect(labels(box)).toEqual([
      "Rotate right",
      "Rotate left",
      "Flip",
      "Crop",
    ]);
  });
});

describe("ToolPicker — keyboard", () => {
  it("moves with the arrows and picks with Enter", async () => {
    const box = await open();
    await press(box, "ArrowDown");
    await press(box, "Enter");

    expect(picked).toEqual(["rotate-left"]);
  });

  it("wraps past the end rather than sticking", async () => {
    const box = await open();
    await press(box, "ArrowUp");
    await press(box, "Enter");

    // The last row a photo offers is Describe, which is planned — so the
    // wrap lands on it and Enter does nothing, which is the disabled contract
    // holding on the keyboard as well as the pointer.
    expect(picked).toEqual([]);
  });

  it("picks nothing when Enter lands on a blocked row", async () => {
    const box = await open();
    await type(box, "crop");
    await press(box, "Enter");

    expect(picked).toEqual([]);
  });

  it("closes on Escape", async () => {
    const box = await open();
    await press(box, "Escape");

    expect(closed).toEqual(["closed"]);
  });

  it("filters from the keyboard and picks the survivor", async () => {
    const box = await open();
    await type(box, "mirror");
    await type(box, "edit");
    await press(box, "Enter");

    expect(picked).toEqual(["edit-image"]);
  });
});

/**
 * Collecting the words a tool needs.
 *
 * The rows for prompt-needing tools are enabled on the promise that this step
 * exists. If it ever stops standing between the row and `onPick`, those tools
 * run with an empty prompt — a paid generation from nothing, which fails in a
 * way that looks like the model's fault rather than the picker's.
 */
describe("ToolPicker — the prompt step", () => {
  const withoutWords = {
    context: { hasImage: true, hasMask: false, hasPrompt: false },
  };

  const promptField = (box: HTMLElement) =>
    box.querySelector<HTMLTextAreaElement>("textarea");

  const typePrompt = async (box: HTMLElement, value: string) => {
    const field = promptField(box);
    if (!field) {
      throw new Error("no prompt field");
    }
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
  };

  it("asks for words instead of running, when the item has none", async () => {
    const box = await open(withoutWords);
    rowNamed(box, "Edit").click();
    await flush();

    expect(promptField(box)).not.toBeNull();
    expect(picked).toEqual([]);
  });

  it("will not run on an empty prompt", async () => {
    const box = await open(withoutWords);
    rowNamed(box, "Edit").click();
    await flush();
    await typePrompt(box, "   ");

    box.querySelector<HTMLButtonElement>("button:not([role='option'])");
    const run = Array.from(
      box.querySelectorAll<HTMLButtonElement>("button")
    ).find((button) => button.textContent === "Run");
    expect(run?.disabled).toBe(true);
    run?.click();
    await flush();
    expect(picked).toEqual([]);
  });

  it("hands the typed words to the tool", async () => {
    const box = await open(withoutWords);
    rowNamed(box, "Edit").click();
    await flush();
    await typePrompt(box, "make the sky green");

    const run = Array.from(
      box.querySelectorAll<HTMLButtonElement>("button")
    ).find((button) => button.textContent === "Run");
    run?.click();
    await flush();

    expect(picked).toEqual(["edit-image"]);
    expect(pickedPrompts).toEqual(["make the sky green"]);
  });

  it("goes back to the list without running", async () => {
    const box = await open(withoutWords);
    rowNamed(box, "Edit").click();
    await flush();
    const back = Array.from(
      box.querySelectorAll<HTMLButtonElement>("button")
    ).find((button) => button.getAttribute("aria-label") === "Back to tools");
    back?.click();
    await flush();

    expect(promptField(box)).toBeNull();
    expect(picked).toEqual([]);
  });
});
