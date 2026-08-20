import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
  ExchangeIcon,
} from "@hugeicons-pro/core-stroke-standard";
import type { BoardItem } from "../../types";
import { type MaskConfig, maskOf } from "./mask";

/**
 * What to do with the mask on the selected picture.
 *
 * Only appears once something has been painted. A control for inverting a mask
 * that does not exist is noise, and the mask brush itself lives in the drawing
 * toolbar where the other tools are — this is about the mask already made, not
 * about making one.
 *
 * Sits beside the drawing toolbar rather than on the node: it belongs to the
 * selection, like the color controls, and putting it on the picture would mean
 * chrome on top of the very thing the mask has to be judged against.
 */

interface MaskControlsProps {
  onChange: (itemId: string, next: MaskConfig | null) => void;
  selected: BoardItem | null;
}

export function MaskControls({ onChange, selected }: MaskControlsProps) {
  const mask = selected ? maskOf(selected.config) : null;
  if (!(selected && mask)) {
    return null;
  }

  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-board-ink/10 bg-board-surface/80 p-1 backdrop-blur">
      <span className="px-1.5 text-[9px] text-board-ink/40 uppercase tracking-[0.16em]">
        Mask
      </span>

      {/* Says what the paint currently means, rather than what the button
          does. "Change" and "Keep" are the two states; a button labelled
          "Invert" leaves you working out which way round you are. */}
      <button
        aria-pressed={mask.invert}
        className={`rounded px-2 py-1 text-[11px] ${
          mask.invert
            ? "bg-sky-400/20 text-sky-200"
            : "bg-rose-400/20 text-rose-200"
        }`}
        onClick={() => onChange(selected.id, { ...mask, invert: !mask.invert })}
        title="What the painted area means"
        type="button"
      >
        <HugeiconsIcon aria-hidden icon={ExchangeIcon} size={11} />
        <span className="ml-1.5">
          {mask.invert ? "Painted = keep" : "Painted = change"}
        </span>
      </button>

      <button
        aria-label="Clear the mask"
        className="rounded px-1.5 py-1 text-board-ink/50 hover:text-red-300"
        onClick={() => onChange(selected.id, null)}
        title="Clear the mask"
        type="button"
      >
        <HugeiconsIcon icon={Delete02Icon} size={13} />
      </button>
    </div>
  );
}
