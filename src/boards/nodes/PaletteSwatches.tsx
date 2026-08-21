import "./PaletteSwatches.css";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Cancel01Icon } from "@hugeicons-pro/core-stroke-standard";
import { HEX_COLOUR } from "../../../config/nodes/palette.js";
import { ColorWell } from "../ColorWell";

/**
 * A palette as swatches rather than as typed hex codes.
 *
 * The colors are still *stored* as a line of hex, because that string is the
 * node's output and the thing Ideogram's palette parameter is read back out of.
 * This edits that string; it does not replace it. Typing "#0a2540" and picking
 * it off a gradient have to mean the same thing, and they do because both end
 * up in the same field.
 */

/** A new swatch starts mid-grey: visibly there, and obviously not chosen yet. */
const NEW_COLOUR = "#808080";

/** More than a palette. Past this it is a gradient, and no model honours it. */
const MAX_COLOURS = 8;

interface PaletteSwatchesProps {
  onChange: (colors: string) => void;
  /** The stored value: hex codes, however they were separated. */
  value: string;
}

export function PaletteSwatches({ onChange, value }: PaletteSwatchesProps) {
  const colors = value.match(HEX_COLOUR) ?? [];

  const write = (next: string[]) => onChange(next.join(", "));

  return (
    <div className="palette-swatches">
      <span className="palette-swatches__label">Colors</span>

      <div className="palette-swatches__row">
        {colors.map((color, index) => (
          <div
            className="palette-swatches__swatch"
            // Position is the identity here: two swatches may hold the same
            // color, and keying on the value would collapse them into one.
            // biome-ignore lint/suspicious/noArrayIndexKey: a swatch has no identity but its place in the palette
            key={index}
          >
            <ColorWell
              label={`Color ${index + 1}`}
              onChange={(next) =>
                write(colors.map((c, i) => (i === index ? next : c)))
              }
              value={color}
            />
            <button
              aria-label={`Remove color ${index + 1}`}
              className="palette-swatches__remove"
              onClick={() => write(colors.filter((_, i) => i !== index))}
              onPointerDown={(e) => e.stopPropagation()}
              type="button"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={8} />
            </button>
          </div>
        ))}

        {colors.length < MAX_COLOURS ? (
          <button
            aria-label="Add a color"
            className="palette-swatches__add"
            onClick={() => write([...colors, NEW_COLOUR])}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            <HugeiconsIcon icon={Add01Icon} size={11} />
          </button>
        ) : null}
      </div>

      {/* The hex stays visible and editable: pasting a brand palette is faster
          than picking six colors off a gradient, and it is what the node
          actually sends. */}
      <input
        aria-label="Colors as hex"
        className="palette-swatches__field"
        onChange={(e) => onChange(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        placeholder="#0a2540, #f5f0e8, #c8102e"
        spellCheck={false}
        value={value}
      />
    </div>
  );
}
