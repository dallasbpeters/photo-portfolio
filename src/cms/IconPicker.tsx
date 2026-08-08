import { NavArrowDown, Prohibition } from "iconoir-react";
import { useEffect, useRef, useState } from "react";
import { ICON_GROUPS } from "./icons";
import { resolveIcon } from "./SiteNav";

interface IconPickerProps {
  id?: string;
  onChange: (icon: string | null) => void;
  value: string | null;
}

/**
 * Visual icon chooser for a page's nav link.
 *
 * Replaces a free-text field that required knowing an exact Iconoir export
 * name — every option here is picked from a verified set, so a selection always
 * renders.
 */
export function IconPicker({ value, onChange, id }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape, the way a native select behaves.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const Selected = resolveIcon(value);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex min-h-11 w-full items-center justify-between gap-2 border border-white/10 bg-black/40 px-3 text-left transition-colors hover:border-white/25 focus:border-white/40 focus:outline-none"
        id={id}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className="flex items-center gap-2 text-sm text-white/80">
          {Selected ? (
            <>
              <Selected height={16} width={16} />
              <span className="text-[11px] text-white/90 uppercase tracking-[0.14em]">
                {value}
              </span>
            </>
          ) : (
            <span className="text-[11px] text-white/90 uppercase tracking-[0.14em]">
              No icon
            </span>
          )}
        </span>
        <NavArrowDown
          className={`shrink-0 text-white/90 transition-transform ${open ? "rotate-180" : ""}`}
          height={14}
          width={14}
        />
      </button>

      {open ? (
        <div
          className="absolute z-50 mt-1 max-h-72 w-full min-w-[280px] overflow-y-auto border border-white/15 bg-black shadow-2xl"
          role="listbox"
        >
          <button
            aria-selected={value === null}
            className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-[11px] uppercase tracking-[0.14em] transition-colors hover:bg-white/[0.06] ${
              value === null ? "text-white" : "text-white/90"
            }`}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            role="option"
            type="button"
          >
            <Prohibition height={14} width={14} />
            No icon
          </button>

          {ICON_GROUPS.map((group) => (
            <div className="border-white/[0.06] border-t" key={group.label}>
              <p className="px-3 pt-3 pb-1.5 text-[9px] text-white/25 uppercase tracking-[0.22em]">
                {group.label}
              </p>
              <div className="grid grid-cols-6 gap-px p-1">
                {group.icons.map((name) => {
                  const Icon = resolveIcon(name);
                  if (!Icon) {
                    return null;
                  }
                  return (
                    <button
                      aria-selected={value === name}
                      className={`flex aspect-square items-center justify-center transition-colors ${
                        value === name
                          ? "bg-white text-black"
                          : "text-white/45 hover:bg-white/[0.08] hover:text-white"
                      }`}
                      key={name}
                      onClick={() => {
                        onChange(name);
                        setOpen(false);
                      }}
                      role="option"
                      title={name}
                      type="button"
                    >
                      <Icon height={16} width={16} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
