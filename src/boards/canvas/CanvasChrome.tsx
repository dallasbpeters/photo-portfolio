import { HugeiconsIcon } from "@hugeicons/react";
import { Layers01Icon } from "@hugeicons-pro/core-stroke-standard";
import { useState } from "react";
import type { BoardItem } from "../../types";
import type { CanvasViewport } from "../hooks/useCanvasViewport";
import { LayersPanel } from "../panels/LayersPanel";
import "./CanvasChrome.css";

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
      <div className="canvas-chrome">
        <div className="canvas-chrome__bar">
          {readOnly ? null : (
            <button
              aria-label="Layers"
              aria-pressed={showLayers}
              className={`canvas-chrome__button canvas-chrome__button--layers ${
                showLayers ? "canvas-chrome__button--on" : ""
              }`}
              onClick={() => setShowLayers((open) => !open)}
              type="button"
            >
              <HugeiconsIcon aria-hidden icon={Layers01Icon} size={16} />
            </button>
          )}
          <button
            aria-label="Zoom out"
            className="canvas-chrome__button"
            onClick={() => view.zoomBy(1 / 1.25)}
            type="button"
          >
            −
          </button>
          <span className="canvas-chrome__scale">
            {Math.round(view.viewport.scale * 100)}%
          </span>
          <button
            aria-label="Zoom in"
            className="canvas-chrome__button"
            onClick={() => view.zoomBy(1.25)}
            type="button"
          >
            +
          </button>
          <button
            className="canvas-chrome__button canvas-chrome__button--fit"
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
