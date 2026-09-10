import { type RefObject, useEffect } from "react";
import {
  panByWheel,
  type Viewport,
  wheelIntent,
  zoomByWheel,
} from "../geometry/viewportModel";

/**
 * What the wheel does on a board: move it, or get closer to it.
 *
 * Its own hook because the two halves are one concern and neither is small:
 * deciding whether the gesture even belongs to the canvas means walking the
 * DOM from the event target, and deciding what it then means is the
 * pan-versus-zoom rule the whole board's feel rests on.
 */

const SCROLLABLE = /(auto|scroll)/;

/**
 * The scrollable element under the pointer that could still take this wheel, or
 * null when the gesture belongs to the canvas.
 *
 * Walks from the event target up to the canvas container. "Could still take it"
 * matters as much as "is scrollable": a list already at its bottom should hand
 * the wheel back rather than swallow it, so reaching the end of a panel goes on
 * to zoom instead of stopping dead.
 */
const scrollableUnder = (
  target: EventTarget | null,
  stop: Element,
  e: WheelEvent
): Element | null => {
  let node = target instanceof Element ? target : null;
  while (node && node !== stop) {
    const style = getComputedStyle(node);
    const vertical =
      SCROLLABLE.test(style.overflowY) &&
      node.scrollHeight > node.clientHeight &&
      // Room left in the direction being scrolled, with a pixel of tolerance
      // for the fractional scroll offsets a zoomed canvas produces.
      (e.deltaY < 0
        ? node.scrollTop > 0
        : node.scrollTop + node.clientHeight < node.scrollHeight - 1);
    const horizontal =
      SCROLLABLE.test(style.overflowX) &&
      node.scrollWidth > node.clientWidth &&
      (e.deltaX < 0
        ? node.scrollLeft > 0
        : node.scrollLeft + node.clientWidth < node.scrollWidth - 1);
    if (vertical || horizontal) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
};

export const useWheelGesture = (
  containerRef: RefObject<HTMLDivElement | null>,
  markUserMoved: () => void,
  setViewport: (next: (v: Viewport) => Viewport) => void
): void => {
  // Wheel must be a non-passive native listener: React's synthetic wheel
  // handler is passive, so preventDefault there is ignored and the page scrolls
  // (or the browser zooms) instead of the canvas.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const onWheel = (e: WheelEvent) => {
      // A panel inside the canvas gets the wheel first. Without this the zoom
      // handler swallowed every scroll on the board, so no scrollable thing
      // living on the canvas — a shader's settings, a long list of versions —
      // could be scrolled at all.
      if (scrollableUnder(e.target, el, e)) {
        return;
      }
      e.preventDefault();
      markUserMoved();
      /*
       * Two fingers move the board; a pinch, or a held Cmd or Control, zooms.
       *
       * Every wheel used to zoom, which meant a trackpad could not pan at all
       * and moving around a board needed the other hand on the space bar. A
       * pinch reaches here as ctrlKey+wheel, synthesized by the browser, so
       * the same test covers the gesture and the keyboard shortcut.
       */
      if (wheelIntent(e) === "pan") {
        setViewport((v) => panByWheel(v, e.deltaX, e.deltaY, e.deltaMode));
        return;
      }
      const rect = el.getBoundingClientRect();
      setViewport((v) =>
        zoomByWheel(v, e.deltaY, e.clientX, e.clientY, rect, e.deltaMode)
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [containerRef, markUserMoved, setViewport]);
};
