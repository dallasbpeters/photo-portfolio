import { useState } from "react";
import { LOOK_FAMILIES, type Look, looksInFamily } from "../presets";
import { EditorSlider } from "./EditorSlider";

/**
 * The look strip: a family rail carrying each family's signature colour, the
 * eight looks inside the open family, then a strength slider.
 */
export function LooksPanel({
  active,
  strength,
  onChoose,
  onStrength,
}: {
  active: Look | null;
  strength: number;
  onChoose: (look: Look) => void;
  onStrength: (value: number) => void;
}) {
  // Opens on the active look's family so returning to the panel lands where the
  // photograph already is.
  const [openFamily, setOpenFamily] = useState<string>(active?.family ?? "a");
  const family =
    LOOK_FAMILIES.find((f) => f.id === openFamily) ?? LOOK_FAMILIES[0]!;

  return (
    <div className="space-y-5 py-1">
      {/* Family rail — the signature colour is the whole affordance. */}
      <div className="flex gap-px bg-white/[0.06]">
        {LOOK_FAMILIES.map((f) => {
          const isOpen = f.id === family.id;
          const holdsActive = active?.family === f.id;
          // Open, holds the current look, or idle — clearer named than nested.
          let swatchOpacity = 0.28;
          if (isOpen) {
            swatchOpacity = 1;
          } else if (holdsActive) {
            swatchOpacity = 0.7;
          }
          return (
            <button
              aria-pressed={isOpen}
              className={`flex flex-1 flex-col items-center gap-1.5 bg-black py-2.5 transition-colors ${
                isOpen ? "text-white" : "text-white/30 hover:text-white/60"
              }`}
              key={f.id}
              onClick={() => setOpenFamily(f.id)}
              title={`${f.name} — ${f.description}`}
              type="button"
            >
              <span className="font-mono text-[11px] tracking-wider">
                {f.letter}
              </span>
              <span
                aria-hidden
                className="h-[3px] w-4 rounded-full transition-opacity"
                style={{
                  backgroundColor: f.color,
                  opacity: swatchOpacity,
                }}
              />
            </button>
          );
        })}
      </div>

      <div>
        <p className="pb-2 text-[10px] text-white/35 uppercase tracking-[0.18em]">
          {family.name}
          <span className="ml-2 text-white/20 normal-case tracking-normal">
            {family.description}
          </span>
        </p>

        <div className="grid grid-cols-4 gap-px bg-white/[0.06]">
          {looksInFamily(family.id).map((look) => {
            const isActive = active?.id === look.id;
            return (
              <button
                className={`flex aspect-square flex-col items-center justify-center gap-1 bg-black transition-colors duration-200 ${
                  isActive ? "text-white" : "text-white/30 hover:text-white/70"
                }`}
                key={look.id}
                onClick={() => onChoose(look)}
                style={
                  isActive
                    ? { backgroundColor: `${family.color}14` }
                    : undefined
                }
                title={look.name}
                type="button"
              >
                <span className="font-mono text-[11px] tracking-wider">
                  {look.code}
                </span>
                <span
                  aria-hidden
                  className="h-px w-3 transition-opacity"
                  style={{
                    backgroundColor: family.color,
                    opacity: isActive ? 1 : 0,
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {active ? (
        <div className="border-white/[0.06] border-t pt-1">
          <EditorSlider
            label={`${active.code} · ${active.name}`}
            max={100}
            min={0}
            onChange={onStrength}
            value={strength}
          />
        </div>
      ) : null}
    </div>
  );
}
