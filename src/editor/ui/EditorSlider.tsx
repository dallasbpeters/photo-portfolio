import { useCallback, useEffect, useRef, useState } from "react";

interface EditorSliderProps {
  /** Fill grows from the middle and a detent marks zero. */
  centered?: boolean;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  /** Fired once when a drag ends, for undo grouping. */
  onCommit?: () => void;
  value: number;
}

/**
 * Hairline track, no visible thumb until touched, value revealed only while
 * adjusting — the control should disappear and leave the photograph.
 *
 * Pointer events rather than a range input: a native range cannot be styled
 * this thinly across browsers, and dragging needs to keep tracking outside the
 * element's bounds.
 */
export function EditorSlider({
  label,
  value,
  min,
  max,
  centered = false,
  onChange,
  onCommit,
}: EditorSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const percent = ((value - min) / (max - min)) * 100;
  const zeroPercent = ((0 - min) / (max - min)) * 100;

  // Fill runs from zero to the handle when centred, otherwise from the left.
  const fillLeft = centered ? Math.min(percent, zeroPercent) : 0;
  const fillWidth = centered ? Math.abs(percent - zeroPercent) : percent;

  const valueFromClientX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track) {
        return value;
      }
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(
        1,
        Math.max(0, (clientX - rect.left) / rect.width)
      );
      const raw = min + ratio * (max - min);
      // Snap to zero near the detent so neutral is reachable by hand.
      if (centered && Math.abs(raw) < (max - min) * 0.02) {
        return 0;
      }
      return Math.round(raw);
    },
    [centered, max, min, value]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    onChange(valueFromClientX(e.clientX));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) {
      return;
    }
    onChange(valueFromClientX(e.clientX));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) {
      return;
    }
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
    onCommit?.();
  };

  // Escape returns the slider to neutral mid-drag.
  useEffect(() => {
    if (!isDragging) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onChange(0);
        setIsDragging(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDragging, onChange]);

  const isActive = value !== 0;
  // Centred sliders show an explicit sign so +10 and -10 are distinguishable.
  const displayValue = centered && value > 0 ? `+${value}` : String(value);

  return (
    <div className="group/slider select-none py-2.5">
      <div className="flex items-baseline justify-between pb-2">
        <span
          className={`text-[10px] uppercase tracking-[0.18em] transition-colors duration-200 ${
            isActive ? "text-white/70" : "text-white/35"
          }`}
        >
          {label}
        </span>
        <span
          className={`font-mono text-[10px] tabular-nums transition-opacity duration-200 ${
            isDragging || isActive ? "text-white/60 opacity-100" : "opacity-0"
          }`}
        >
          {displayValue}
        </span>
      </div>

      <div
        aria-label={label}
        aria-valuemax={max}
        aria-valuemin={min}
        aria-valuenow={value}
        className="relative h-4 cursor-pointer touch-none focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            onChange(Math.max(min, value - (e.shiftKey ? 10 : 1)));
          }
          if (e.key === "ArrowRight") {
            onChange(Math.min(max, value + (e.shiftKey ? 10 : 1)));
          }
          if (e.key === "Backspace" || e.key === "Delete") {
            onChange(0);
          }
        }}
        onPointerCancel={endDrag}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        ref={trackRef}
        role="slider"
        tabIndex={0}
      >
        {/* Track */}
        <div className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-white/[0.09]" />

        {/* Detent at neutral */}
        {centered ? (
          <div
            className="absolute top-1/2 h-1.5 w-px -translate-x-1/2 -translate-y-1/2 bg-white/20"
            style={{ left: `${zeroPercent}%` }}
          />
        ) : null}

        {/* Fill */}
        <div
          className="absolute top-1/2 h-px -translate-y-1/2 bg-white/70 transition-colors"
          style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
        />

        {/* Handle — a hairline, thickening only on hover or drag */}
        <div
          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white transition-all duration-150 ${
            isDragging
              ? "h-3.5 w-[3px]"
              : "h-2.5 w-px group-hover/slider:h-3.5 group-hover/slider:w-[3px]"
          }`}
          style={{ left: `${percent}%` }}
        />
      </div>
    </div>
  );
}
