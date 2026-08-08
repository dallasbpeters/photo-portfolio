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
  const family = LOOK_FAMILIES.find((f) => f.id === openFamily);
  if (!family) {
    // LOOK_FAMILIES is a non-empty literal, so this is unreachable — but it is
    // cheaper to return than to assert the compiler into agreeing.
    return null;
  }

  return (
    <div className="space-y-5 py-1">
      {/* Family rail — the signature colour is the whole affordance. */}
      <div className="flex gap-px bg-white/[0.06]">
        {LOOK_FAMILIES.map((f) => {
          const isOpen = f.id === family.id;
          const holdsActive = active?.family === f.id;
          return (
            <button
              aria-pressed={isOpen}
              className={`relative flex flex-1 flex-col items-center gap-1.5 py-2.5 transition-all ${
                isOpen ? "" : "opacity-55 hover:opacity-80"
              }`}
              key={f.id}
              onClick={() => setOpenFamily(f.id)}
              style={{
                backgroundColor: `${f.color}`,
                color: `${f.contrastColor}`,
              }}
              title={`${f.name} — ${f.description}`}
              type="button"
            >
              <span className="font-mono text-[11px] tracking-wider">
                {f.letter}
              </span>
              {/* Marks the family holding the selected look when its panel is
                  closed, so the current grade stays findable in the rail. */}
              {holdsActive && !isOpen ? (
                <span
                  aria-hidden
                  className="absolute bottom-1 size-1 rounded-full"
                  style={{ backgroundColor: f.contrastColor }}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div>
        <p className="pb-2 text-[10px] text-white/90 uppercase tracking-[0.18em]">
          {family.name}
          <span className="ml-2 text-white/90 normal-case tracking-normal">
            {family.description}
          </span>
        </p>

        <div className="grid grid-cols-4 gap-px bg-white/6">
          {looksInFamily(family.id).map((look) => {
            const isActive = active?.id === look.id;
            return (
              <button
                className={`flex aspect-square flex-col items-center justify-center gap-1 bg-black transition-colors duration-200 ${
                  isActive ? "text-white" : "text-white/90 hover:text-white/90"
                }`}
                key={look.id}
                onClick={() => onChoose(look)}
                style={
                  isActive ? { backgroundColor: `${family.color}` } : undefined
                }
                title={look.name}
                type="button"
              >
                <span
                  className="font-mono text-[11px] tracking-wider"
                  style={{
                    color: isActive ? `${family.contrastColor}` : "#FFFFFF",
                  }}
                >
                  {look.code}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {active ? (
        <div className="border-white/6 border-t pt-1">
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
