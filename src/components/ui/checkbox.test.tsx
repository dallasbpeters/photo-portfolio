// The real stylesheet: these assertions are about geometry — what sits under
// the pointer — and without Tailwind the control has no size at all.
import "../../index.css";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Checkbox } from "./checkbox";

let host: HTMLDivElement | null = null;
let root: Root | null = null;

/** Lets React commit before the assertions look at the DOM. */
const flush = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

const render = async (ui: ReactElement): Promise<HTMLDivElement> => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  root.render(ui);
  await flush();
  return host;
};

/** What a pointer aimed at the middle of the control actually hits. */
const targetAtCentre = (el: HTMLElement): HTMLElement | null => {
  const { left, top, width, height } = el.getBoundingClientRect();
  return document.elementFromPoint(
    left + width / 2,
    top + height / 2
  ) as HTMLElement | null;
};

afterEach(() => {
  root?.unmount();
  host?.remove();
  host = null;
  root = null;
});

describe("Checkbox", () => {
  /**
   * The box a person aims at has to be the thing that toggles.
   *
   * The input was `sr-only`, which clips it to a 1px square in the corner and
   * leaves the visible 16px box as an aria-hidden sibling with no behaviour of
   * its own. It looked right, and keyboard use and clicking an associated
   * <label> both worked, so the only symptom was that clicking the checkbox
   * itself did nothing at all.
   */
  it("toggles when the visible box is clicked", async () => {
    const el = await render(<Checkbox defaultChecked={false} />);
    const input = el.querySelector("input") as HTMLInputElement;
    const hit = targetAtCentre(el.firstElementChild as HTMLElement);

    expect(hit).not.toBeNull();
    hit?.click();
    await flush();

    expect(input.checked).toBe(true);
  });

  it("is the input that sits under the pointer", async () => {
    const el = await render(<Checkbox />);
    const hit = targetAtCentre(el.firstElementChild as HTMLElement);
    // Either the input itself or a label bound to it — never a decorative span.
    const reachesInput =
      hit?.tagName === "INPUT" || hit?.closest("label") !== null;
    expect(reachesInput).toBe(true);
  });

  it("honours a controlled checked prop", async () => {
    const el = await render(<Checkbox checked onChange={() => undefined} />);
    expect((el.querySelector("input") as HTMLInputElement).checked).toBe(true);
  });

  it("does not toggle when disabled", async () => {
    const el = await render(<Checkbox defaultChecked={false} disabled />);
    const input = el.querySelector("input") as HTMLInputElement;
    targetAtCentre(el.firstElementChild as HTMLElement)?.click();
    await flush();
    expect(input.checked).toBe(false);
  });
});
