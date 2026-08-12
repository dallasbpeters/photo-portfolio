import { useState } from "react";
import { type ColorResult, SketchPicker } from "react-color";
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
  const [isOpen, setIsOpen] = useState(false);
  const clear = isTransparent(value);

  return (
    <div className="relative">
      <button
        aria-label={label}
        className="size-6 overflow-hidden rounded border border-white/20"
        onClick={() => setIsOpen((open) => !open)}
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

      {isOpen ? (
        <>
          {/* Catches the click that dismisses the picker. Sits under it, over
              everything else. */}
          <button
            aria-label={`Close ${label}`}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setIsOpen(false)}
            type="button"
          />
          {/* Above the well rather than below: the toolbar sits at the bottom
              of the canvas, so a picker underneath it would be off screen. */}
          <div className="absolute bottom-9 left-0 z-50">
            <SketchPicker
              color={value}
              onChange={(color: ColorResult) => onChange(toHex(color))}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
