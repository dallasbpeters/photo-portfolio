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

export interface CanvasViewport {
  /** Centres the whole canvas in the container. */
  fit: () => void;
  isPanning: boolean;
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
  containerRef: RefObject<HTMLDivElement | null>
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

  const fit = useCallback(() => {
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

  // Fit once the container has a measured size.
  useEffect(() => {
    fit();
  }, [fit]);

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
    [containerRef]
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
      e.preventDefault();
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
  }, [containerRef]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
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
    [viewport]
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

  return {
    fit,
    isPanning,
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
