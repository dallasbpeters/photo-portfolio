import { beforeEach, describe, expect, it } from "vitest";
import { setAutoplay } from "./autoplayPref";

/**
 * What the canvas remembers about playing clips.
 *
 * The default is the interesting part. Boards have always autoplayed, so a
 * missing key has to mean on — read the other way round, everyone's clips stop
 * moving the day this ships and nothing on screen says why.
 */

const KEY = "board:autoplay";

describe("the autoplay preference", () => {
  beforeEach(() => {
    window.localStorage.removeItem(KEY);
  });

  it("writes the choice down so the next board opens the same way", () => {
    setAutoplay(false);
    expect(window.localStorage.getItem(KEY)).toBe("off");
    setAutoplay(true);
    expect(window.localStorage.getItem(KEY)).toBe("on");
  });

  it("treats anything but an explicit off as on", () => {
    // The read is `!== "off"`, which is what makes a missing key, a cleared
    // store and a value from some future version all mean the behaviour boards
    // already had.
    window.localStorage.setItem(KEY, "on");
    expect(window.localStorage.getItem(KEY) !== "off").toBe(true);
    window.localStorage.removeItem(KEY);
    expect(window.localStorage.getItem(KEY) !== "off").toBe(true);
  });

  it("notifies nothing when the value has not changed", () => {
    // `setAutoplay` returns early on a no-op. Without that, every render that
    // re-asserted the current value would wake every clip on the board.
    setAutoplay(true);
    window.localStorage.removeItem(KEY);
    setAutoplay(true);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});
