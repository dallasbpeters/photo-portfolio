import type { RefObject } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { type PanelPlacement, placePanel } from "./panelPlacement";

/**
 * A panel that rides an item and flips when it runs out of room above it.
 *
 * Shared rather than written twice: the text panel and the tool bar are the
 * same problem — chrome pinned to an item, sized in screen pixels, which has to
 * know whether it fits above. Two copies of this would drift, and the half that
 * drifts is the measurement, which is the part nobody notices is wrong until a
 * panel is off the top of the window.
 *
 * The measurement comes off the DOM because it cannot come from anywhere else:
 * the viewport that maps canvas coordinates to screen ones lives in a ref
 * precisely so that panning does not re-render, so an item's screen position is
 * not derivable from its props.
 */
export const useAnchoredPanel = (
  anchor: RefObject<HTMLElement | null>
): {
  panelRef: RefObject<HTMLDivElement | null>;
  placement: PanelPlacement;
} => {
  const [placement, setPlacement] = useState<PanelPlacement>("above");
  const panelRef = useRef<HTMLDivElement>(null);

  const decide = useCallback(() => {
    const anchored = anchor.current;
    const panel = panelRef.current;
    if (anchored && panel) {
      setPlacement(
        placePanel(anchored.getBoundingClientRect().top, panel.offsetHeight)
      );
    }
  }, [anchor]);

  // Every render is a chance the item moved under the top edge — dragged,
  // resized, zoomed, or the panel itself grew — and the answer is measured, not
  // derived from any one of those props.
  useLayoutEffect(() => {
    decide();
  });

  useLayoutEffect(() => {
    // The two gestures that move an item under the top edge without anything
    // re-rendering: a pan and a wheel zoom both write the layer transform
    // straight to the DOM, so neither arrives here as a prop.
    window.addEventListener("pointerup", decide);
    window.addEventListener("resize", decide);
    window.addEventListener("wheel", decide, { passive: true });
    return () => {
      window.removeEventListener("pointerup", decide);
      window.removeEventListener("resize", decide);
      window.removeEventListener("wheel", decide);
    };
  }, [decide]);

  return { panelRef, placement };
};
