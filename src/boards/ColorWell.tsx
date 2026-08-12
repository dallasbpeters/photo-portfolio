import { useState } from "react";
import { type ColorResult, SketchPicker } from "react-color";
import { createPortal } from "react-dom";

/** SketchPicker's own size, used only to keep it on screen. */
const PICKER_WIDTH = 220;
const PICKER_HEIGHT = 300;

import { isTransparent } from "./drawing";

/**
 * A colour swatch that opens the project's SketchPicker.
 *
 * The same arrangement the site settings panel uses — swatch, a full-screen
 * button behind the popover to catch the dismissing click, picker above it —
 * because two colour pickers behaving differently in one product is worse than
 * either behaviour on its own.
 *
 * Alpha is enabled here, unlike in site settings. There it is disabled because
 * the contrast checker returns zero for anything that is not a plain hex, so a
 * translucent value would silently switch off the WCAG warning. Nothing here
 * measures contrast, and a translucent mark over a photograph — a highlight
 * rather than a blackout — is one of the main things drawing on a board is for.
 */

interface ColorWellProps {
  label: string;
  onChange: (color: string) => void;
  value: string;
}

/**
 * `#rrggbb`, or `#rrggbbaa` when it is not fully opaque.
 *
 * The alpha pair is dropped at full opacity so ordinary colours stay in the
 * familiar six-digit form, and carried whenever it would otherwise be lost.
 */
const toHex = (color: ColorResult): string => {
  const alpha = color.rgb.a ?? 1;
  if (alpha >= 1) {
    return color.hex;
  }
  return `${color.hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`;
};

export function ColorWell({ label, onChange, value }: ColorWellProps) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const clear = isTransparent(value);

  /**
   * Opens the picker at the swatch, in viewport coordinates.
   *
   * The position is read from the swatch and the picker is rendered into the
   * document body, because an absolutely-positioned popover is clipped by any
   * scrolling ancestor — and a node's body scrolls, so on a Palette node the
   * picker would have opened inside a box too short to show it.
   */
  const open = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (at) {
      setAt(null);
      return;
    }
    const box = e.currentTarget.getBoundingClientRect();
    // Below the swatch, unless that would run off the bottom of the window.
    const wantsAbove = box.bottom + PICKER_HEIGHT > window.innerHeight;
    setAt({
      left: Math.min(box.left, window.innerWidth - PICKER_WIDTH - 8),
      top: wantsAbove ? box.top - PICKER_HEIGHT - 8 : box.bottom + 8,
    });
  };

  return (
    <div className="relative">
      <button
        aria-label={label}
        className="size-6 overflow-hidden rounded border border-white/20"
        onClick={open}
        onPointerDown={(e) => e.stopPropagation()}
        title={label}
        type="button"
      >
        {/* A chequerboard under the swatch, so a transparent or translucent
            colour reads as see-through rather than as black. */}
        <span
          className="block size-full"
          style={{
            backgroundColor: clear ? "transparent" : value,
            backgroundImage: clear
              ? "linear-gradient(45deg,#666 25%,transparent 25%,transparent 75%,#666 75%),linear-gradient(45deg,#666 25%,transparent 25%,transparent 75%,#666 75%)"
              : undefined,
            backgroundPosition: "0 0, 4px 4px",
            backgroundSize: "8px 8px",
          }}
        />
      </button>

      {at
        ? createPortal(
            <>
              {/* Catches the click that dismisses the picker. Sits under it,
                  over everything else. */}
              <button
                aria-label={`Close ${label}`}
                className="fixed inset-0 z-[60] cursor-default"
                onClick={() => setAt(null)}
                type="button"
              />
              <div
                className="fixed z-[61]"
                onPointerDown={(e) => e.stopPropagation()}
                style={{ left: at.left, top: at.top }}
              >
                <SketchPicker
                  color={value}
                  onChange={(color: ColorResult) => onChange(toHex(color))}
                />
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  );
}
