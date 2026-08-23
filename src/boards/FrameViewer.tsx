import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
} from "@hugeicons-pro/core-stroke-standard";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect } from "react";
import type { BoardItem } from "../types";
import { currentImageUrl } from "./itemOutput";
import "./FrameViewer.css";

/**
 * One frame of a published board, full screen.
 *
 * A published board is a single wide canvas, and what somebody actually wants to
 * look at is usually a *group* — the five logo studies, the deck mockups. A frame
 * already is that group, so this gives one an address and a way to be looked
 * through: the pictures it contains, one at a time, at the size of the window.
 *
 * Deliberately not the photo Lightbox. That one is built on `Photo` — optimised
 * sources, a browser-chrome mock, a link to a photo page — and a board item is
 * none of those things. Sharing it would have meant making both components
 * describe both shapes.
 *
 * The contents are whatever the frame geometrically owns, resolved by the
 * caller with `containedBy` so the innermost-frame rule holds: a frame inside
 * this one keeps its own pictures.
 */

export interface FrameViewerProps {
  index: number;
  /** Everything the frame owns that has a picture, in board order. */
  items: BoardItem[];
  /** The frame's own name, for the caption and the document title. */
  name: string;
  onClose: () => void;
  /** Moves within the frame. The caller owns the index so the URL can follow. */
  onIndex: (index: number) => void;
}

export function FrameViewer({
  index,
  items,
  name,
  onClose,
  onIndex,
}: FrameViewerProps) {
  const count = items.length;
  /*
   * Wrapping, because a frame is a set rather than a sequence.
   *
   * There is no "end" of a group of five mockups — going right from the last one
   * should return to the first, which is what somebody flicking through expects.
   * Modulo on a possibly-negative index needs the double remainder.
   */
  const step = useCallback(
    (by: number) => {
      if (count > 0) {
        onIndex((((index + by) % count) + count) % count);
      }
    },
    [count, index, onIndex]
  );

  // Arrow keys and Escape. Registered on the window rather than on a focused
  // element: the viewer covers the page, and requiring a click inside it first
  // would make the keys work only after somebody had already used the mouse.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
      if (event.key === "ArrowRight") {
        step(1);
      }
      if (event.key === "ArrowLeft") {
        step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, step]);

  const shown = items[index];
  const url = shown ? currentImageUrl(shown) : null;

  return (
    <AnimatePresence>
      <motion.div
        animate={{ opacity: 1 }}
        className="frame-viewer"
        exit={{ opacity: 0 }}
        initial={{ opacity: 0 }}
        // Only the backdrop closes. A click that lands on the picture or the
        // chrome targets a descendant and is left alone.
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
      >
        <header className="frame-viewer__bar">
          <span className="frame-viewer__title">
            {name}
            {count > 1 ? (
              <span className="frame-viewer__count">
                {index + 1} / {count}
              </span>
            ) : null}
          </span>
          <button
            aria-label="Close"
            className="frame-viewer__button"
            onClick={onClose}
            type="button"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} />
          </button>
        </header>

        {url ? (
          <motion.img
            alt={shown?.body ?? name}
            className="frame-viewer__image"
            // The run's own pixels when it has them, the item's box on the
            // board otherwise — a pinned photograph stores no intrinsic size.
            // Either way it is the right shape, which is what the browser needs
            // to hold the space before the picture arrives. Both sides of the
            // pair, or the browser has an edge and no ratio to reserve from.
            height={shown?.result?.height ?? shown?.height}
            // Keyed on the URL so moving between pictures animates rather than
            // swapping the same element's src, which shows the old picture
            // stretched to the new one's box for a frame.
            key={url}
            src={url}
            transition={{ duration: 0.15 }}
            width={shown?.result?.width ?? shown?.width}
          />
        ) : (
          <p className="frame-viewer__empty">
            Nothing in this frame has a picture yet.
          </p>
        )}

        {count > 1 ? (
          <>
            <button
              aria-label="Previous"
              className="frame-viewer__button frame-viewer__button--prev"
              onClick={() => step(-1)}
              type="button"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={22} />
            </button>
            <button
              aria-label="Next"
              className="frame-viewer__button frame-viewer__button--next"
              onClick={() => step(1)}
              type="button"
            >
              <HugeiconsIcon icon={ArrowRight01Icon} size={22} />
            </button>
          </>
        ) : null}
      </motion.div>
    </AnimatePresence>
  );
}
