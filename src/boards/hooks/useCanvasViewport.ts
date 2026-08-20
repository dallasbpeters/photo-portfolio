import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_SCALE, MIN_SCALE } from "../../../config/canvas.js";
import {
  frameBounds,
  frameCanvas,
  toCanvas as toCanvasPoint,
  zoomAt as zoomAtPoint,
  zoomByAtCentre,
  zoomByWheel,
} from "../geometry/viewportModel";

export interface Viewport {
  /** Canvas units per CSS pixel. */
  scale: number;
  /** Screen offset of the canvas origin, in CSS pixels. */
  tx: number;
  ty: number;
}

/** A rectangle in canvas units. */
export interface Bounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface CanvasViewport {
  /** Centres the whole canvas in the container. */
  fit: () => void;
  /**
   * Frames a region — the items on the board rather than the board itself.
   *
   * Fitting the whole canvas is right for an empty board and wrong for a full
   * one: the arrangement usually occupies a small part of a 4000×3000 space, so
   * fitting the space leaves the content a speck, or off screen entirely.
   */
  fitToBounds: (bounds: Bounds) => boolean;
  /**
   * Frames the items the first time the board has any — call it when the items
   * change. Does nothing once the board has been framed or taken hold of.
   */
  frameContent: () => void;
  isPanning: boolean;
  /**
   * The element carrying the transform.
   *
   * Attached by the canvas so a pan can write `style.transform` straight to
   * the DOM. React state is resynced once, when the gesture ends.
   */
  layerRef: RefObject<HTMLDivElement | null>;
  /**
   * Records that the board has been taken hold of by something this hook cannot
   * see, such as dragging an item. Nothing re-frames the view afterwards.
   */
  markUserMoved: () => void;
  /** Spread onto the canvas container element. */
  onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** Converts a client (screen) point to canvas units. */
  toCanvas: (clientX: number, clientY: number) => { x: number; y: number };
  viewport: Viewport;
  /** Zooms about the container's centre — for on-screen buttons. */
  zoomBy: (factor: number) => void;
}

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

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Session storage key for a board's view, scoped so boards never share one. */
const VIEW_STORAGE_KEY = (path: string): string => `cyan-board-view:${path}`;

/** The saved view for this board, or null when there is none to restore. */
const readSavedView = (): Viewport | null => {
  try {
    const raw = sessionStorage.getItem(VIEW_STORAGE_KEY(location.pathname));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<Viewport>;
    if (
      typeof parsed.scale === "number" &&
      // Bounded, not merely finite: zero is finite, is reachable by framing
      // against an unlaid-out container, and renders every item at nothing.
      parsed.scale >= MIN_SCALE &&
      parsed.scale <= MAX_SCALE &&
      typeof parsed.tx === "number" &&
      Number.isFinite(parsed.tx) &&
      typeof parsed.ty === "number" &&
      Number.isFinite(parsed.ty)
    ) {
      return { scale: parsed.scale, tx: parsed.tx, ty: parsed.ty };
    }
    return null;
  } catch {
    return null;
  }
};

/** Remembers the view for this board, for the next load of the same page. */
const saveView = (viewport: Viewport): void => {
  try {
    sessionStorage.setItem(
      VIEW_STORAGE_KEY(location.pathname),
      JSON.stringify(viewport)
    );
  } catch {
    // Storage denied — the view simply does not survive a reload.
  }
};

/**
 * Pan and zoom over the fixed board canvas.
 *
 * Zoom is anchored to the pointer rather than the centre, which is what makes
 * it feel like moving a physical board: whatever is under the cursor stays
 * under the cursor. Panning and pinching both come through pointer events, so
 * mouse, trackpad and touch take the same path instead of three.
 */
export const useCanvasViewport = (
  containerRef: RefObject<HTMLDivElement | null>,
  /**
   * The region worth looking at — the items on the board.
   *
   * Read through a ref rather than a dependency, so the caller can pass an
   * inline arrow without every render re-registering the observer below.
   */
  getContentBounds?: () => Bounds | null
): CanvasViewport => {
  // The view is remembered per board, in session storage, so a reload does not
  // throw the board back to "fit everything" — which reads as the items having
  // moved when all that moved was the camera. Restored as the initial state,
  // and the flags below tell the framing to keep its hands off.
  const initial = useRef<Viewport | null>(null);
  if (initial.current === null) {
    initial.current = readSavedView();
  }

  const [viewport, setViewport] = useState<Viewport>(
    () => initial.current ?? { scale: 1, tx: 0, ty: 0 }
  );
  const [isPanning, setIsPanning] = useState(false);

  /**
   * The viewport as it is right now, which during a gesture is ahead of state.
   *
   * Panning used to call setViewport per pointermove, re-rendering the canvas
   * and every item on it at pointer rate — measured at ~35,000 item renders
   * per second of panning on a 500-item board. The ref plus a direct
   * `style.transform` write moves the whole gesture off the React path;
   * `commitViewport` puts state back in step once, at the end.
   */
  const viewportRef = useRef<Viewport>(viewport);
  const layerRef = useRef<HTMLDivElement | null>(null);

  /** Writes the viewport to the DOM without telling React. */
  const applyDirect = useCallback((next: Viewport) => {
    viewportRef.current = next;
    layerRef.current?.style.setProperty(
      "transform",
      `translate(${next.tx}px, ${next.ty}px) scale(${next.scale})`
    );
  }, []);

  /** Puts React state back in step with the ref, once. */
  const commitViewport = useCallback(() => {
    setViewport(viewportRef.current);
  }, []);

  // Live pointer positions, keyed by pointerId. Two of them means a pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panOrigin = useRef<{ tx: number; ty: number; x: number; y: number }>({
    tx: 0,
    ty: 0,
    x: 0,
    y: 0,
  });
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);

  // Once the view is the user's doing, automatic framing stops: a resize must
  // not undo where they put the board. A restored view counts as the user's.
  const hasUserMoved: RefObject<boolean> = useRef(initial.current !== null);
  // Content is framed once; later resizes must not re-frame from scratch.
  const hasFramedContent: RefObject<boolean> = useRef(initial.current !== null);

  const markUserMoved = useCallback(() => {
    hasUserMoved.current = true;
  }, []);

  // The view follows the user wherever they put it; remembered so a reload
  // comes back to the same place instead of re-fitting the whole board.
  useEffect(() => {
    saveView(viewport);
  }, [viewport]);

  // Held in a ref so an inline arrow from the caller does not re-create the
  // framing callback on every render.
  const getContentBoundsRef = useRef(getContentBounds);
  getContentBoundsRef.current = getContentBounds;

  const fitCanvas = useCallback(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    // The opening screenful sits in the middle of the canvas, which is also
    // where an item with nowhere else to go is dropped — see dropPoint.
    // Null on a zero-sized container, where the old code produced a plausible
    // but wrong view at MIN_SCALE that then never re-framed.
    const framed = frameCanvas(el.getBoundingClientRect());
    if (framed) {
      setViewport(framed);
    }
  }, [containerRef]);

  const fitToBounds = useCallback(
    (bounds: Bounds): boolean => {
      const el = containerRef.current;
      if (!el || bounds.width <= 0 || bounds.height <= 0) {
        return false;
      }
      // Reports failure rather than silently doing nothing: a caller that marks
      // itself done on a zero-sized container never frames the board at all.
      // frameBounds answers null in exactly that case.
      const framed = frameBounds(bounds, el.getBoundingClientRect());
      if (!framed) {
        return false;
      }
      setViewport(framed);
      return true;
    },
    [containerRef]
  );

  /**
   * Puts the board where it belongs: framed on the items, or on the whole
   * canvas while there are none.
   *
   * Both are computed from the container's measured size, which is why this
   * runs again whenever that size changes. Framing against a stale measurement
   * is what left a published board off centre: the first pass ran before the
   * layout had settled, and nothing ever corrected it.
   */
  const frame = useCallback(() => {
    if (hasUserMoved.current) {
      return;
    }
    const bounds = getContentBoundsRef.current?.() ?? null;
    if (!bounds) {
      // An empty board has nothing to frame, so show the space it will fill.
      // Only until there is content: once framed, a stray resize must not send
      // the view back to the whole 4000×3000 canvas.
      if (!hasFramedContent.current) {
        fitCanvas();
      }
      return;
    }
    hasFramedContent.current = fitToBounds(bounds) || hasFramedContent.current;
  }, [fitCanvas, fitToBounds]);

  useEffect(() => {
    frame();
    const el = containerRef.current;
    if (!(el && typeof ResizeObserver !== "undefined")) {
      return;
    }
    const observer = new ResizeObserver(() => frame());
    observer.observe(el);
    return () => observer.disconnect();
  }, [frame, containerRef]);

  /** Centres the whole canvas — the on-screen Fit button. */
  const fit = useCallback(() => {
    markUserMoved();
    fitCanvas();
  }, [fitCanvas, markUserMoved]);

  // Anything that sets state — framing, the zoom buttons, a restored view —
  // must leave the ref agreeing with it, or the next gesture would start from
  // a stale origin.
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const toCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el) {
        return { x: 0, y: 0 };
      }
      const rect = el.getBoundingClientRect();
      // From the ref, not state: during a gesture state is behind, and a
      // conversion against a stale viewport puts the pointer in the wrong
      // place. Reading the ref also keeps this callback's identity stable,
      // which matters because it is closed over all over the canvas.
      return toCanvasPoint(viewportRef.current, clientX, clientY, rect);
    },
    [containerRef]
  );

  /** Zooms while keeping the given screen point pinned to the same canvas point. */
  const zoomAt = useCallback(
    (nextScaleRaw: number, screenX: number, screenY: number) => {
      const el = containerRef.current;
      if (!el) {
        return;
      }
      const rect = el.getBoundingClientRect();
      setViewport((v) => zoomAtPoint(v, nextScaleRaw, screenX, screenY, rect));
    },
    [containerRef]
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const el = containerRef.current;
      if (!el) {
        return;
      }
      markUserMoved();
      const rect = el.getBoundingClientRect();
      setViewport((v) => zoomByAtCentre(v, factor, rect));
    },
    [containerRef, markUserMoved]
  );

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
      // A trackpad pinch arrives as ctrlKey+wheel; both should zoom.
      const rect = el.getBoundingClientRect();
      setViewport((v) => zoomByWheel(v, e.deltaY, e.clientX, e.clientY, rect));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [containerRef, markUserMoved]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      markUserMoved();
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      e.currentTarget.setPointerCapture(e.pointerId);

      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        pinchStart.current = { dist: distance(a, b), scale: viewport.scale };
        setIsPanning(false);
        return;
      }
      panOrigin.current = {
        tx: viewport.tx,
        ty: viewport.ty,
        x: e.clientX,
        y: e.clientY,
      };
      setIsPanning(true);
    },
    [markUserMoved, viewport]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!pointers.current.has(e.pointerId)) {
        return;
      }
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size >= 2 && pinchStart.current) {
        const [a, b] = [...pointers.current.values()];
        const dist = distance(a, b);
        if (pinchStart.current.dist > 0) {
          zoomAt(
            pinchStart.current.scale * (dist / pinchStart.current.dist),
            (a.x + b.x) / 2,
            (a.y + b.y) / 2
          );
        }
        return;
      }

      if (!isPanning) {
        return;
      }
      const o = panOrigin.current;
      applyDirect({
        ...viewportRef.current,
        tx: o.tx + (e.clientX - o.x),
        ty: o.ty + (e.clientY - o.y),
      });
    },
    [applyDirect, isPanning, zoomAt]
  );

  const endPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) {
        pinchStart.current = null;
      }
      if (pointers.current.size === 0) {
        setIsPanning(false);
        // One render for the whole gesture, rather than one per frame.
        commitViewport();
      }
    },
    [commitViewport]
  );

  /**
   * Frames the items the first time the board has any.
   *
   * The canvas calls this when the items change, which is the only moment the
   * hook cannot see for itself: a board arrives from the API long after the
   * container has settled at its final size, so no resize follows to trigger
   * the framing.
   */
  const frameContent = useCallback(() => {
    if (hasFramedContent.current) {
      return;
    }
    frame();
  }, [frame]);

  return {
    fit,
    fitToBounds,
    frameContent,
    isPanning,
    layerRef,
    markUserMoved,
    // Handlers are spread onto the container by the canvas component.
    onPointerCancel: endPointer,
    onPointerDown,
    onPointerMove,
    onPointerUp: endPointer,
    toCanvas,
    viewport,
    zoomBy,
  };
};
