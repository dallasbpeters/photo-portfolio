import type { ResizeHandle } from "./geometry/alignmentGuides";
import "./ResizeHandles.css";

interface ResizeHandlesProps {
  /** Cancels the canvas zoom, so a handle is the same size at every scale. */
  chromeScale: { transform: string };
  onStart: (handle: ResizeHandle, clientX: number, clientY: number) => void;
}

/**
 * A block at each corner of a selected item.
 *
 * Four rather than one, because which corner you take decides which corner
 * stays put — pulling the top-left of an image should move its origin, not
 * grow it downward. `resizeBox` does that arithmetic; this only says which
 * handle was taken.
 *
 * Positioned by its own corner (`origin-*`) so the counter-scale that keeps a
 * handle thumb-sized at every zoom pushes it outward from the item rather than
 * dragging it toward the middle.
 */
const CORNERS: {
  handle: ResizeHandle;
  label: string;
}[] = [
  { handle: "nw", label: "Resize from the top left" },
  { handle: "ne", label: "Resize from the top right" },
  { handle: "sw", label: "Resize from the bottom left" },
  { handle: "se", label: "Resize from the bottom right" },
];

export function ResizeHandles({ chromeScale, onStart }: ResizeHandlesProps) {
  return (
    <>
      {CORNERS.map((corner) => (
        <button
          aria-label={corner.label}
          className={`resize-handle resize-handle--${corner.handle}`}
          key={corner.handle}
          onPointerDown={(e) => {
            // The press belongs to the handle: without stopping it the item
            // underneath begins a move and the resize never starts.
            e.stopPropagation();
            // Primary button only, as everywhere else on the canvas — a
            // right-click here should reach the context menu.
            if (e.button !== 0) {
              return;
            }
            onStart(corner.handle, e.clientX, e.clientY);
          }}
          style={chromeScale}
          type="button"
        />
      ))}
    </>
  );
}
