import { HugeiconsIcon } from "@hugeicons/react";
import { RotateRight01Icon } from "@hugeicons-pro/core-stroke-standard";
import type { CanvasTransform } from "../engine/export";

interface CropPanelProps {
  isDisabled: boolean;
  onChange: (next: CanvasTransform) => void;
  transform: CanvasTransform;
}

const rotateBy = (
  transform: CanvasTransform,
  delta: number
): CanvasTransform => ({
  ...transform,
  rotation: (transform.rotation + delta + 360) % 360,
});

export function CropPanel({ isDisabled, onChange, transform }: CropPanelProps) {
  const rotation = ((transform.rotation % 360) + 360) % 360;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-2 text-[9px] text-white/60 uppercase tracking-[0.22em]">
          Rotate
        </p>
        <div className="flex items-center gap-2">
          <button
            className="flex h-8 flex-1 items-center justify-center gap-1.5 border border-white/15 text-[10px] text-white/90 uppercase tracking-[0.14em] transition-colors hover:border-white/30 hover:text-white disabled:pointer-events-none disabled:opacity-50"
            disabled={isDisabled}
            onClick={() => onChange(rotateBy(transform, -90))}
            type="button"
          >
            <HugeiconsIcon
              className="rotate-180"
              icon={RotateRight01Icon}
              size={13}
            />
            Left
          </button>
          <button
            className="flex h-8 flex-1 items-center justify-center gap-1.5 border border-white/15 text-[10px] text-white/90 uppercase tracking-[0.14em] transition-colors hover:border-white/30 hover:text-white disabled:pointer-events-none disabled:opacity-50"
            disabled={isDisabled}
            onClick={() => onChange(rotateBy(transform, 90))}
            type="button"
          >
            <HugeiconsIcon icon={RotateRight01Icon} size={13} />
            Right
          </button>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-[9px] text-white/60 uppercase tracking-[0.22em]">
            Free rotate
          </p>
          <span className="font-mono text-[10px] text-white/80 tabular-nums">
            {rotation}°
          </span>
        </div>
        <input
          aria-label="Free rotate"
          className="w-full accent-white"
          disabled={isDisabled}
          max="359"
          min="0"
          onChange={(e) =>
            onChange({ crop: transform.crop, rotation: Number(e.target.value) })
          }
          type="range"
          value={rotation}
        />
      </div>

      <div className="flex items-center gap-2">
        {transform.crop ? (
          <button
            className="h-8 border border-white/15 px-3 text-[10px] text-white/90 uppercase tracking-[0.14em] transition-colors hover:border-white/30 hover:text-white disabled:pointer-events-none disabled:opacity-50"
            disabled={isDisabled}
            onClick={() =>
              onChange({ crop: null, rotation: transform.rotation })
            }
            type="button"
          >
            Clear crop
          </button>
        ) : null}
        <button
          className="h-8 border border-white/15 px-3 text-[10px] text-white/90 uppercase tracking-[0.14em] transition-colors hover:border-white/30 hover:text-white disabled:pointer-events-none disabled:opacity-50"
          disabled={isDisabled}
          onClick={() => onChange({ crop: transform.crop, rotation: 0 })}
          type="button"
        >
          Reset rotation
        </button>
      </div>

      <p className="text-[10px] text-white/50 leading-relaxed">
        Drag the white dial to straighten or turn the photo. Drag the corners of
        the box to size the crop, the box itself to move it, or the photo to
        start a new crop.
      </p>
    </div>
  );
}
