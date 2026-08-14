import { HugeiconsIcon } from "@hugeicons/react";
import { Download01Icon } from "@hugeicons-pro/core-stroke-standard";
import { useEffect } from "react";

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
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <button
        aria-label="Cancel"
        className="absolute inset-0 cursor-default bg-board-surface/70 backdrop-blur-sm"
        onClick={onCancel}
        tabIndex={-1}
        type="button"
      />
      <div className="relative w-[min(92vw,26rem)] overflow-hidden rounded-xl border border-board-ink/15 bg-board-panel shadow-2xl">
        <header className="border-board-ink/10 border-b px-4 py-3">
          <h2 className="text-[11px] text-board-ink uppercase tracking-[0.18em]">
            Import {count === 1 ? "an SVG" : "SVGs"}
          </h2>
          <p className="mt-1 text-[11px] text-board-ink/50 leading-relaxed">
            Keep it as a vector, or turn it into a PNG?
          </p>
        </header>

        <div className="grid grid-cols-2 gap-2 p-4">
          <button
            className="flex flex-col items-center gap-1.5 rounded-lg border border-board-ink/15 p-3 text-board-ink/80 transition-colors hover:border-board-ink/40 hover:text-board-ink"
            onClick={onKeepSvg}
            type="button"
          >
            <HugeiconsIcon aria-hidden icon={Download01Icon} size={20} />
            <span className="font-medium text-[12px]">Keep as SVG</span>
            <span className="text-center text-[10px] text-board-ink/45 leading-snug">
              Editable vector, still sharp at any size
            </span>
          </button>
          <button
            className="flex flex-col items-center gap-1.5 rounded-lg border border-board-ink/15 p-3 text-board-ink/80 transition-colors hover:border-board-ink/40 hover:text-board-ink"
            onClick={onConvertPng}
            type="button"
          >
            <span className="grid size-5 place-items-center font-semibold text-[11px]">
              PNG
            </span>
            <span className="font-medium text-[12px]">Convert to PNG</span>
            <span className="text-center text-[10px] text-board-ink/45 leading-snug">
              Raster, ready for image models
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
