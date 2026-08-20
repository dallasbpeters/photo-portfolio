import { HugeiconsIcon } from "@hugeicons/react";
import { ColorPickerIcon } from "@hugeicons-pro/core-stroke-standard";
import { useEffect, useState } from "react";
import { type ColorResult, SketchPicker } from "react-color";
import { createPortal } from "react-dom";

/** SketchPicker's own size, used only to keep it on screen. */
const PICKER_WIDTH = 220;
const PICKER_HEIGHT = 300;

import { isTransparent } from "./drawing/drawing";

/**
 * A color swatch that opens the project's SketchPicker.
 *
 * The same arrangement the site settings panel uses — swatch, a full-screen
 * button behind the popover to catch the dismissing click, picker above it —
 * because two color pickers behaving differently in one product is worse than
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
 * The alpha pair is dropped at full opacity so ordinary colors stay in the
 * familiar six-digit form, and carried whenever it would otherwise be lost.
 */
export const toHex = (color: ColorResult): string => {
  const alpha = color.rgb.a ?? 1;
  if (alpha >= 1) {
    return color.hex;
  }
  return `${color.hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`;
};

/**
 * What the picker should open on.
 *
 * A transparent value is a *sentinel* — NO_FILL is "#00000000", meaning "do not
 * paint" — not an alpha somebody chose. Seeding the picker with it started the
 * alpha slider at zero, so every colour picked came back as `#rrggbb00`, which
 * isTransparent() reads as no paint: the shape stayed hollow and the well
 * appeared to do nothing at all.
 *
 * Opening on opaque white instead makes picking a colour mean what it looks
 * like it means. The swatch still shows the chequerboard, so "there is no fill
 * yet" is not lost, and the alpha slider still reaches zero for anyone who
 * genuinely wants to turn a fill off.
 */
export const pickerSeed = (value: string): string =>
  isTransparent(value) ? "#ffffff" : value;

export function ColorWell({ label, onChange, value }: ColorWellProps) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const clear = isTransparent(value);
  const canSample = typeof window !== "undefined" && "EyeDropper" in window;

  /**
   * Hands the pointer back to the operating system while the picker is open.
   *
   * The board draws its own cursor and hides the real one, which is fine for
   * dragging things about and useless for choosing a color off a gradient —
   * the drawn arrow and its name label cover the pixel being aimed at. While a
   * picker is open there is nothing else to interact with, so the swap is safe
   * for exactly as long as it is needed.
   */
  useEffect(() => {
    if (!at) {
      return;
    }
    document.body.classList.add("cursor-precise");
    return () => document.body.classList.remove("cursor-precise");
  }, [at]);

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

  /**
   * Samples a color from anywhere on screen.
   *
   * The picker stays open behind it: sampling is usually the first move and
   * nudging the result on the gradient is the second, so closing here would
   * make the common pair into two trips.
   */
  const sample = async () => {
    const Sampler = window.EyeDropper;
    if (!Sampler) {
      return;
    }
    try {
      const picked = await new Sampler().open();
      onChange(picked.sRGBHex);
    } catch {
      // Dismissed with Escape, which is a choice rather than a failure.
    }
  };

  return (
    <div className="relative">
      <button
        aria-label={label}
        className="size-6 overflow-hidden rounded border border-board-ink/20"
        onClick={open}
        onPointerDown={(e) => e.stopPropagation()}
        title={label}
        type="button"
      >
        {/* A chequerboard under the swatch, so a transparent or translucent
            color reads as see-through rather than as black. */}
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
                className="fixed inset-0 z-60 cursor-default"
                onClick={() => setAt(null)}
                type="button"
              />
              <div
                className="fixed z-61"
                onPointerDown={(e) => e.stopPropagation()}
                style={{ left: at.left, top: at.top }}
              >
                <SketchPicker
                  color={pickerSeed(value)}
                  onChange={(color: ColorResult) => onChange(toHex(color))}
                />
                {/* Sampling beats matching by eye when the color wanted is
                    already on the board — a reference photograph, a logo, an
                    image just generated. Absent rather than disabled where the
                    browser has no sampler: a control that cannot work is worse
                    than one that is not offered. */}
                {canSample ? (
                  <button
                    className="flex w-full items-center justify-center gap-1 bg-board-ink py-1.5 text-[10px] text-board-surface/70 uppercase tracking-[0.14em] hover:text-board-surface"
                    onClick={() => void sample()}
                    type="button"
                  >
                    <HugeiconsIcon icon={ColorPickerIcon} size={12} />
                    Pick from screen
                  </button>
                ) : null}
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  );
}
