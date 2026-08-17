import "../index.css";
import { afterEach, describe, expect, it } from "vitest";

/**
 * What a shadcn control paints itself with when it is dropped on the board.
 *
 * The board is its own surface: `--board-ink` inverts with the light/dark
 * switch and every board-authored class reads it. A `Select` or an `Input` does
 * not — those come from the shadcn set and read `--foreground`, `--input` and
 * `--muted-foreground`, which describe the *admin's* palette. On a light board
 * inside a dark admin that is near-white type on white paper, which is what the
 * Seconds picker was: a value nobody could read.
 *
 * `[data-surface="board"]` already did this for buttons. These assertions say
 * it now does it for the rest, and they read the resolved colour out of
 * Chromium rather than trusting the file, because the whole failure was a
 * variable that resolved somewhere other than where it appeared to.
 */

const host = document.createElement("div");
const probe = document.createElement("div");

const on = (surface: "board" | "admin", dark: boolean): CSSStyleDeclaration => {
  document.documentElement.classList.toggle("dark", dark);
  if (surface === "board") {
    host.setAttribute("data-surface", "board");
  } else {
    host.removeAttribute("data-surface");
  }
  host.append(probe);
  document.body.append(host);
  return getComputedStyle(probe);
};

const varOf = (style: CSSStyleDeclaration, name: string): string =>
  style.getPropertyValue(name).trim();

afterEach(() => {
  document.documentElement.classList.remove("dark");
  host.remove();
});

describe("a control on the board", () => {
  it("writes in the board's ink, not the admin's", () => {
    // `text-foreground` is what SelectTrigger uses. On the board it has to mean
    // the board's writing colour or the control is illegible on the paper it is
    // actually sitting on.
    const light = on("board", false);
    expect(varOf(light, "--foreground")).toBe(varOf(light, "--board-ink"));
  });

  it("keeps meaning the board's ink when the admin is dark", () => {
    // The case in the screenshot: a dark admin, a board that follows the switch,
    // and a control reading the admin's near-white --foreground onto it.
    const dark = on("board", true);
    expect(varOf(dark, "--foreground")).toBe(varOf(dark, "--board-ink"));
  });

  it("puts its menus on the board's panel colour", () => {
    // An open Select is `bg-popover text-popover-foreground`. A dark popover
    // over a light board is a hole in the canvas.
    const light = on("board", false);
    expect(varOf(light, "--popover")).toBe(varOf(light, "--board-panel"));
    expect(varOf(light, "--popover-foreground")).toBe(
      varOf(light, "--board-ink")
    );
  });

  it("draws its edges in ink rather than the admin's grey", () => {
    const light = on("board", false);
    expect(varOf(light, "--input")).not.toBe("");
    expect(varOf(light, "--border")).toBe(varOf(light, "--input"));
  });

  it("still has a quieter colour for secondary text", () => {
    // `--muted-foreground` is the placeholder and the chevron. It must be
    // dimmer than the ink and still legible — mixed toward the surface rather
    // than set to a grey that only suits one of the two themes.
    const light = on("board", false);
    expect(varOf(light, "--muted-foreground")).not.toBe("");
    expect(varOf(light, "--muted-foreground")).not.toBe(
      varOf(light, "--board-ink")
    );
  });
});

describe("a control in the admin", () => {
  it("is left exactly as it was", () => {
    // The board mapping must not leak. The admin's own palette is what every
    // panel outside the canvas is built against.
    const light = on("admin", false);
    expect(varOf(light, "--foreground")).toBe("oklch(0.145 0 0)");
    const dark = on("admin", true);
    expect(varOf(dark, "--foreground")).toBe("oklch(0.985 0 0)");
  });
});
