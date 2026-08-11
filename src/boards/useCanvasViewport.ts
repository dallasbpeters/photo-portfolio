import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  clampScale,
} from "../../config/canvas.js";

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

/** How much one wheel notch zooms. */
const WHEEL_SENSITIVITY = 0.0015;

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

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
  const [viewport, setViewport] = useState<Viewport>({
    scale: 1,
    tx: 0,
    ty: 0,
  });
  const [isPanning, setIsPanning] = useState(false);

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
  // not undo where they put the board.
  const hasUserMoved: RefObject<boolean> = useRef(false);
  // Content is framed once; later resizes must not re-frame from scratch.
  const hasFramedContent: RefObject<boolean> = useRef(false);

  const markUserMoved = useCallback(() => {
    hasUserMoved.current = true;
  }, []);

  // Held in a ref so an inline arrow from the caller does not re-create the
  // framing callback on every render.
  const getContentBoundsRef = useRef(getContentBounds);
  getContentBoundsRef.current = getContentBounds;

  const fitCanvas = useCallback(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const { width, height } = el.getBoundingClientRect();
    // A little breathing room so the edges are not flush with the frame.
    const scale = clampScale(
      Math.min(width / CANVAS_WIDTH, height / CANVAS_HEIGHT) * 0.92
    );
    setViewport({
      scale,
      tx: (width - CANVAS_WIDTH * scale) / 2,
      ty: (height - CANVAS_HEIGHT * scale) / 2,
    });
  }, [containerRef]);

  const fitToBounds = useCallback(
    (bounds: Bounds): boolean => {
      const el = containerRef.current;
      if (!el || bounds.width <= 0 || bounds.height <= 0) {
        return false;
      }
      const { width, height } = el.getBoundingClientRect();
      // Reports failure rather than silently doing nothing: a caller that marks
      // itself done on a zero-sized container never frames the board at all.
      if (width === 0 || height === 0) {
        return false;
      }
      // Margin so the outermost items are not flush against the frame.
      const scale = clampScale(
        Math.min(width / bounds.width, height / bounds.height) * 0.85
      );
      setViewport({
        scale,
        tx: (width - bounds.width * scale) / 2 - bounds.x * scale,
        ty: (height - bounds.height * scale) / 2 - bounds.y * scale,
      });
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

  const toCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el) {
        return { x: 0, y: 0 };
      }
      const rect = el.getBoundingClientRect();
      return {
        x: (clientX - rect.left - viewport.tx) / viewport.scale,
        y: (clientY - rect.top - viewport.ty) / viewport.scale,
      };
    },
    [containerRef, viewport]
  );

  /** Zooms while keeping the given screen point pinned to the same canvas point. */
  const zoomAt = useCallback(
    (nextScaleRaw: number, screenX: number, screenY: number) => {
      setViewport((v) => {
        const nextScale = clampScale(nextScaleRaw);
        const el = containerRef.current;
        if (!el) {
          return v;
        }
        const rect = el.getBoundingClientRect();
        const px = screenX - rect.left;
        const py = screenY - rect.top;
        // The canvas point under the cursor before the zoom must land under it
        // again afterwards; solving for the new offset gives this.
        const canvasX = (px - v.tx) / v.scale;
        const canvasY = (py - v.ty) / v.scale;
        return {
          scale: nextScale,
          tx: px - canvasX * nextScale,
          ty: py - canvasY * nextScale,
        };
      });
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
      setViewport((v) => {
        const nextScale = clampScale(v.scale * factor);
        const px = rect.width / 2;
        const py = rect.height / 2;
        const canvasX = (px - v.tx) / v.scale;
        const canvasY = (py - v.ty) / v.scale;
        return {
          scale: nextScale,
          tx: px - canvasX * nextScale,
          ty: py - canvasY * nextScale,
        };
      });
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
      setViewport((v) => {
        const nextScale = clampScale(
          v.scale * Math.exp(-e.deltaY * WHEEL_SENSITIVITY)
        );
        const rect = el.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const canvasX = (px - v.tx) / v.scale;
        const canvasY = (py - v.ty) / v.scale;
        return {
          scale: nextScale,
          tx: px - canvasX * nextScale,
          ty: py - canvasY * nextScale,
        };
      });
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
      setViewport((v) => ({
        ...v,
        tx: o.tx + (e.clientX - o.x),
        ty: o.ty + (e.clientY - o.y),
      }));
    },
    [isPanning, zoomAt]
  );

  const endPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) {
      pinchStart.current = null;
    }
    if (pointers.current.size === 0) {
      setIsPanning(false);
    }
  }, []);

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
