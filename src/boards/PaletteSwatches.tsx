import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Cancel01Icon } from "@hugeicons-pro/core-stroke-standard";
import { HEX_COLOUR } from "../../config/nodeTypes.js";
import { ColorWell } from "./ColorWell";

/**
 * A palette as swatches rather than as typed hex codes.
 *
 * The colours are still *stored* as a line of hex, because that string is the
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
  const colours = value.match(HEX_COLOUR) ?? [];

  const write = (next: string[]) => onChange(next.join(", "));

  return (
    <div className="space-y-1">
      <span className="text-[10px] text-white/40 uppercase tracking-[0.14em]">
        Colours
      </span>

      <div className="flex flex-wrap items-center gap-1">
        {colours.map((colour, index) => (
          <div
            className="group/sw relative"
            // Position is the identity here: two swatches may hold the same
            // colour, and keying on the value would collapse them into one.
            // biome-ignore lint/suspicious/noArrayIndexKey: a swatch has no identity but its place in the palette
            key={index}
          >
            <ColorWell
              label={`Colour ${index + 1}`}
              onChange={(next) =>
                write(colours.map((c, i) => (i === index ? next : c)))
              }
              value={colour}
            />
            <button
              aria-label={`Remove colour ${index + 1}`}
              className="absolute -top-1 -right-1 grid size-3.5 place-items-center rounded-full border border-white/20 bg-black text-white/60 opacity-0 transition-opacity hover:text-red-300 focus-visible:opacity-100 group-hover/sw:opacity-100"
              onClick={() => write(colours.filter((_, i) => i !== index))}
              onPointerDown={(e) => e.stopPropagation()}
              type="button"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={8} />
            </button>
          </div>
        ))}

        {colours.length < MAX_COLOURS ? (
          <button
            aria-label="Add a colour"
            className="grid size-6 place-items-center rounded border border-white/20 border-dashed text-white/40 hover:border-white/50 hover:text-white"
            onClick={() => write([...colours, NEW_COLOUR])}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            <HugeiconsIcon icon={Add01Icon} size={11} />
          </button>
        ) : null}
      </div>

      {/* The hex stays visible and editable: pasting a brand palette is faster
          than picking six colours off a gradient, and it is what the node
          actually sends. */}
      <input
        aria-label="Colours as hex"
        className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white/70 outline-none focus:border-white/40"
        onChange={(e) => onChange(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        placeholder="#0a2540, #f5f0e8, #c8102e"
        spellCheck={false}
        value={value}
      />
    </div>
  );
}
