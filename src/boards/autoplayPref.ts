import { useSyncExternalStore } from "react";

/**
 * Whether clips play by themselves on the canvas.
 *
 * A viewing preference rather than board content: it says how *you* want to
 * look at a board, not anything about the board, so it is not published, not
 * shared with whoever opens the link, and needs no column to live in. A dozen
 * clips looping at once is either the point of a moodboard or the reason you
 * cannot read one, and which of those it is changes hour to hour.
 *
 * A module-level store with `useSyncExternalStore` rather than context: the
 * only reader is `ItemMedia`, three components below the canvas, and threading
 * a boolean through `BoardCanvas` and `BoardItemView` to reach it would put the
 * preference in the signature of everything in between.
 */

const KEY = "board:autoplay";

/**
 * Read once at module load, then kept here.
 *
 * localStorage is synchronous and `getSnapshot` is called on every render, so
 * reading it there would put a disk-backed call in the render path of every
 * clip on the board. It also has to return a stable value — a fresh read is
 * fine for a boolean, but the habit is what makes an object-valued store loop
 * for ever.
 */
let enabled = ((): boolean => {
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    // Storage can be denied outright — Safari's private mode throws on read.
    // Autoplay on is the behaviour boards have always had, so that is the
    // answer when the preference cannot be recovered.
    return true;
  }
})();

const listeners = new Set<() => void>();

const subscribe = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
};

export const setAutoplay = (next: boolean): void => {
  if (next === enabled) {
    return;
  }
  enabled = next;
  try {
    window.localStorage.setItem(KEY, next ? "on" : "off");
  } catch {
    // Not being able to remember it is not a reason to refuse to do it: the
    // toggle still works for this session.
  }
  for (const listener of listeners) {
    listener();
  }
};

export const useAutoplay = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => enabled,
    () => true
  );
