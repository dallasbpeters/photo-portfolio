import type React from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Category } from "@/types";

export interface CategoryPickerProps {
  categories: Category[];
  className?: string;
  disabled?: boolean;
  id: string;
  isCreating?: boolean;
  label: string;
  onChange: (categoryId: string) => void;
  onCreate: (label: string) => Promise<string | null>;
  value: string;
}

export const CategoryPicker = ({
  id,
  label,
  categories,
  value,
  onChange,
  onCreate,
  disabled = false,
  isCreating = false,
  className,
}: CategoryPickerProps) => {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => categories.find((c) => c.id === value),
    [categories, value]
  );

  useEffect(() => {
    if (open) {
      return;
    }
    setQuery(selected?.label ?? "");
  }, [selected?.label, open]);

  const trimmed = query.trim();
  const qLower = trimmed.toLowerCase();

  const filtered = useMemo(() => {
    if (!trimmed) {
      return categories;
    }
    return categories.filter(
      (c) =>
        c.label.toLowerCase().includes(qLower) ||
        c.slug.toLowerCase().includes(qLower)
    );
  }, [categories, trimmed, qLower]);

  const hasExactLabel = useMemo(
    () => categories.some((c) => c.label.toLowerCase() === qLower),
    [categories, qLower]
  );

  const showAddNew = Boolean(trimmed) && !hasExactLabel;

  const pick = useCallback(
    (cat: Category) => {
      onChange(cat.id);
      setQuery(cat.label);
      setOpen(false);
    },
    [onChange]
  );

  const handleCreate = useCallback(async () => {
    if (!trimmed || isCreating) {
      return;
    }
    const newId = await onCreate(trimmed);
    if (newId) {
      onChange(newId);
      setQuery(trimmed);
      setOpen(false);
    }
  }, [trimmed, isCreating, onCreate, onChange]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (e.key === "Enter" && open) {
      e.preventDefault();
      if (filtered.length === 1) {
        pick(filtered[0]);
        return;
      }
      if (showAddNew) {
        void handleCreate();
      }
    }
  };

  return (
    <div
      className={cn("relative flex flex-col gap-3", className)}
      ref={containerRef}
    >
      <Label
        className="text-[10px] text-white/90 uppercase tracking-widest"
        htmlFor={id}
      >
        {label}
      </Label>
      <Input
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        autoComplete="off"
        className="min-h-11 border-white/10 bg-black/40 text-base focus:border-white/40 sm:text-sm"
        disabled={disabled}
        id={id}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search or add…"
        role="combobox"
        value={query}
      />
      {open && !disabled ? (
        <div
          className="absolute top-full z-200 mt-1 max-h-48 w-full min-w-60 overflow-auto rounded-md border border-white/10 bg-neutral-950 py-1 shadow-xl ring-1 ring-black/40"
          id={listboxId}
          role="listbox"
        >
          {filtered.length === 0 && !showAddNew ? (
            <p className="px-3 py-2 text-white/90 text-xs">No matches</p>
          ) : null}
          {filtered.map((cat) => (
            <button
              aria-selected={cat.id === value}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10"
              key={cat.id}
              onClick={() => pick(cat)}
              onMouseDown={(e) => e.preventDefault()}
              role="option"
              type="button"
            >
              <span>{cat.label}</span>
              <span className="shrink-0 text-[10px] text-white/35 uppercase tracking-wider">
                {cat.slug}
              </span>
            </button>
          ))}
          {showAddNew ? (
            <div className="border-white/10 border-t p-2">
              <Button
                className="w-full border-white/20 text-[10px] text-white uppercase tracking-widest hover:bg-white/10"
                disabled={isCreating}
                onClick={() => void handleCreate()}
                onMouseDown={(e) => e.preventDefault()}
                size="sm"
                type="button"
                variant="outline"
              >
                {isCreating ? "Adding…" : `Add “${trimmed}”`}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
