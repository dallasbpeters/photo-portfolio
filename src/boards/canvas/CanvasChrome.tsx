import { HugeiconsIcon } from "@hugeicons/react";
import { Layers01Icon } from "@hugeicons-pro/core-stroke-standard";
import { useState } from "react";
import type { BoardItem } from "../../types";
import type { CanvasViewport } from "../hooks/useCanvasViewport";
import { LayersPanel } from "../panels/LayersPanel";

/**
 * The bottom-right chrome: zoom controls, and the layers panel's toggle.
 *
 * Kept out of BoardCanvas because the canvas's own function was already at the
 * complexity ceiling, and this is self-contained chrome — the panel's open
 * state, the button that toggles it, and the zoom box that hosts the button.
 */
export function CanvasChrome({
  items,
  onChange,
  onSelect,
  readOnly,
  selectedId,
  view,
}: {
  items: BoardItem[];
  onChange: (items: BoardItem[]) => void;
  onSelect: (item: BoardItem) => void;
  readOnly?: boolean;
  selectedId: string | null;
  view: CanvasViewport;
}) {
  const [showLayers, setShowLayers] = useState(false);
  return (
    <>
      {!readOnly && showLayers ? (
        <LayersPanel
          items={items}
          onChange={onChange}
          onClose={() => setShowLayers(false)}
          onSelect={onSelect}
          selectedId={selectedId}
        />
      ) : null}
      <div className="pointer-events-none absolute right-4 bottom-4 flex items-center gap-2">
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-board-ink/10 bg-board-surface/80 p-1 backdrop-blur">
          {readOnly ? null : (
            <button
              aria-label="Layers"
              aria-pressed={showLayers}
              className={`grid min-h-9 min-w-9 place-items-center text-xs uppercase tracking-widest transition-colors hover:text-board-ink ${
                showLayers ? "text-board-ink" : "text-board-ink/70"
              }`}
              onClick={() => setShowLayers((open) => !open)}
              type="button"
            >
              <HugeiconsIcon aria-hidden icon={Layers01Icon} size={16} />
            </button>
          )}
          <button
            aria-label="Zoom out"
            className="min-h-9 min-w-9 text-board-ink/70 text-xs uppercase tracking-widest hover:text-board-ink"
            onClick={() => view.zoomBy(1 / 1.25)}
            type="button"
          >
            −
          </button>
          <span className="w-12 text-center text-[10px] text-board-ink/50 tabular-nums">
            {Math.round(view.viewport.scale * 100)}%
          </span>
          <button
            aria-label="Zoom in"
            className="min-h-9 min-w-9 text-board-ink/70 text-xs uppercase tracking-widest hover:text-board-ink"
            onClick={() => view.zoomBy(1.25)}
            type="button"
          >
            +
          </button>
          <button
            className="min-h-9 px-2 text-[10px] text-board-ink/70 uppercase tracking-widest hover:text-board-ink"
            onClick={view.fit}
            type="button"
          >
            Fit
          </button>
        </div>
      </div>
    </>
  );
}
