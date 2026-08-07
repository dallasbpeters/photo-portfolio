import { useEffect, useRef, useState } from 'react';
import { NavArrowDown, Prohibition } from 'iconoir-react';
import { ICON_GROUPS } from './icons';
import { resolveIcon } from './SiteNav';

interface IconPickerProps {
  value: string | null;
  onChange: (icon: string | null) => void;
  id?: string;
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
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const Selected = resolveIcon(value);

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2 border border-white/10 bg-black/40 px-3 text-left transition-colors hover:border-white/25 focus:border-white/40 focus:outline-none"
      >
        <span className="flex items-center gap-2 text-sm text-white/80">
          {Selected ? (
            <>
              <Selected width={16} height={16} />
              <span className="text-[11px] uppercase tracking-[0.14em] text-white/50">{value}</span>
            </>
          ) : (
            <span className="text-[11px] uppercase tracking-[0.14em] text-white/30">No icon</span>
          )}
        </span>
        <NavArrowDown
          width={14}
          height={14}
          className={`shrink-0 text-white/30 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full min-w-[280px] overflow-y-auto border border-white/15 bg-black shadow-2xl"
        >
          <button
            type="button"
            role="option"
            aria-selected={value === null}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-[11px] uppercase tracking-[0.14em] transition-colors hover:bg-white/[0.06] ${
              value === null ? 'text-white' : 'text-white/40'
            }`}
          >
            <Prohibition width={14} height={14} />
            No icon
          </button>

          {ICON_GROUPS.map((group) => (
            <div key={group.label} className="border-t border-white/[0.06]">
              <p className="px-3 pt-3 pb-1.5 text-[9px] uppercase tracking-[0.22em] text-white/25">
                {group.label}
              </p>
              <div className="grid grid-cols-6 gap-px p-1">
                {group.icons.map((name) => {
                  const Icon = resolveIcon(name);
                  if (!Icon) return null;
                  return (
                    <button
                      key={name}
                      type="button"
                      role="option"
                      aria-selected={value === name}
                      title={name}
                      onClick={() => {
                        onChange(name);
                        setOpen(false);
                      }}
                      className={`flex aspect-square items-center justify-center transition-colors ${
                        value === name
                          ? 'bg-white text-black'
                          : 'text-white/45 hover:bg-white/[0.08] hover:text-white'
                      }`}
                    >
                      <Icon width={16} height={16} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
