import { HugeiconsIcon } from "@hugeicons/react";
import { Download01Icon } from "@hugeicons-pro/core-stroke-standard";
import { useEffect } from "react";
import "../../boards/boardChrome.css";
import "./SvgImportDialog.css";

interface SvgImportDialogProps {
  /** How many SVG files came in, to phrase the heading. */
  count: number;
  onCancel: () => void;
  /** Rasterises to a PNG. */
  onConvertPng: () => void;
  /** Keeps the file as a vector. */
  onKeepSvg: () => void;
}

/**
 * What to do with an SVG that was dragged onto the board.
 *
 * A vector and a picture are different things, and only the person dropping it
 * knows which one they meant — a logo wants to stay editable as an SVG, a
 * reference for a model wants to be pixels. So the board asks, once per drop.
 */
export function SvgImportDialog({
  count,
  onCancel,
  onKeepSvg,
  onConvertPng,
}: SvgImportDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="modal-layer svg-import__layer">
      <button
        aria-label="Cancel"
        className="modal-scrim modal-scrim--heavy"
        onClick={onCancel}
        tabIndex={-1}
        type="button"
      />
      <div className="modal-panel svg-import">
        <header className="svg-import__header">
          <h2 className="svg-import__title">
            Import {count === 1 ? "an SVG" : "SVGs"}
          </h2>
          <p className="svg-import__note">
            Keep it as a vector, or turn it into a PNG?
          </p>
        </header>

        <div className="svg-import__choices">
          <button
            className="svg-import__choice"
            onClick={onKeepSvg}
            type="button"
          >
            <HugeiconsIcon aria-hidden icon={Download01Icon} size={20} />
            <span className="svg-import__choice-name">Keep as SVG</span>
            <span className="svg-import__choice-note">
              Editable vector, still sharp at any size
            </span>
          </button>
          <button
            className="svg-import__choice"
            onClick={onConvertPng}
            type="button"
          >
            <span className="svg-import__glyph">PNG</span>
            <span className="svg-import__choice-name">Convert to PNG</span>
            <span className="svg-import__choice-note">
              Raster, ready for image models
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
