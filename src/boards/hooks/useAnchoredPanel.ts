import { useLayoutEffect, useRef, useState } from "react";
import { type Placement, placeInViewport } from "../geometry/placeInViewport";

/**
 * A popover placed at the cursor and kept on screen.
 *
 * The measuring half of `placeInViewport`, which holds the geometry and the
 * reasoning. This exists only because the size cannot be known until the thing
 * has rendered: a menu's height depends on which rows apply, so it is placed
 * naively for one frame, measured, and placed properly.
 *
 * `useLayoutEffect` rather than `useEffect` so the correction lands before the
 * browser paints. With `useEffect` the menu appears in the wrong spot and jumps,
 * which is worse than the clipping it was meant to fix.
 *
 * Usage:
 *
 *   const { ref, style } = useAnchoredPanel(point);
 *   <div ref={ref} style={style}>…</div>
 */
export const useAnchoredPanel = (point: { x: number; y: number }) => {
  // Read into locals so the effect can depend on the numbers rather than on
  // the object. A caller passing a fresh literal every render — which the
  // canvas menu does while closed — would otherwise re-measure forever.
  const { x, y } = point;
  const ref = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<Placement>(() =>
    placeInViewport({ x, y }, { height: 0, width: 0 }, viewportNow())
  );

  useLayoutEffect(() => {
    const el: HTMLDivElement | null = ref.current;
    if (!el) {
      return;
    }

    const reposition = () => {
      // Measured from the element's own box rather than its children, because
      // padding and the scrollbar both count towards whether it fits.
      const rect = el.getBoundingClientRect();
      const next = placeInViewport(
        { x, y },
        // scrollHeight, not the rect's height: once a max-height has been
        // applied the rect reports the capped size, and re-measuring that
        // would let the menu ratchet smaller on every pass.
        { height: el.scrollHeight, width: rect.width },
        viewportNow()
      );
      setPlacement((current) =>
        current.left === next.left &&
        current.top === next.top &&
        current.maxHeight === next.maxHeight
          ? current
          : next
      );
    };

    reposition();

    // A menu open across a resize — or a rotation on a tablet — is worth
    // keeping on screen too, and this is one listener for the life of one menu.
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [x, y]);

  return {
    ref,
    style: {
      left: placement.left,
      maxHeight: placement.maxHeight,
      // Only when capped, so an ordinary menu has no scroll container and no
      // chance of a stray scrollbar.
      overflowY: placement.maxHeight === undefined ? undefined : "auto",
      top: placement.top,
    } as const,
  };
};

/**
 * The window, or a plausible stand-in.
 *
 * Guarded because this module is imported by tests that run without a window,
 * and a menu is not worth a crash on first render.
 */
const viewportNow = () => ({
  height: typeof window === "undefined" ? 800 : window.innerHeight,
  width: typeof window === "undefined" ? 1200 : window.innerWidth,
});
