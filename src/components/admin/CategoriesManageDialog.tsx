import { Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Category } from "@/types";

export interface CategoriesManageDialogProps {
  categories: Category[];
  isCreating: boolean;
  loading: boolean;
  onCreate: (label: string) => Promise<string | null>;
  onDelete: (cat: Category) => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export const CategoriesManageDialog = ({
  open,
  onOpenChange,
  categories,
  loading,
  isCreating,
  onCreate,
  onDelete,
}: CategoriesManageDialogProps) => {
  const inputId = useId();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

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

  const renderCategories = () => {
    if (loading) {
      return (
        <p className="p-4 text-center text-white/90 text-xs uppercase tracking-widest">
          Loading…
        </p>
      );
    }
    if (filtered.length === 0) {
      return (
        <p className="p-4 text-center text-white/90 text-xs">
          {trimmed ? "No categories match." : "No categories yet."}
        </p>
      );
    }
    return (
      <ul aria-label="Categories" className="divide-y divide-white/5">
        {filtered.map((cat) => (
          <li
            className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm"
            key={cat.id}
          >
            <div className="min-w-0 flex-1">
              <span className="font-light text-white">{cat.label}</span>
              <span className="ml-2 text-[10px] text-white/90 uppercase tracking-wider">
                {cat.slug}
              </span>
              <span className="ml-2 text-white/90 text-xs">
                · {cat.photoCount} photos
              </span>
            </div>
            <Button
              aria-label={`Remove category ${cat.label}`}
              disabled={cat.photoCount > 0}
              onClick={() => void onDelete(cat)}
              size="icon"
              tone="danger"
              type="button"
              variant="ghost"
            >
              <Trash2 aria-hidden size={16} />
            </Button>
          </li>
        ))}
      </ul>
    );
  };

  const handleAdd = async () => {
    if (!trimmed || isCreating) {
      return;
    }
    const id = await onCreate(trimmed);
    if (id) {
      setQuery("");
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-h-[min(32rem,85dvh)] w-[calc(100vw-1.5rem)] max-w-md overflow-hidden border-white/10 bg-neutral-950 text-white sm:w-full"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="font-light text-white uppercase tracking-[0.2em]">
            Categories
          </DialogTitle>
          <DialogDescription className="text-white/90 text-xs uppercase tracking-widest">
            Search, add a new name, or remove categories that have no photos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label
              className="text-[10px] text-white/90 uppercase tracking-widest"
              htmlFor={inputId}
            >
              Find or add
            </Label>
            <Input
              autoComplete="off"
              className="border-white/10 bg-black/40 focus:border-white/40"
              disabled={loading}
              id={inputId}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter…"
              value={query}
            />
          </div>

          {showAddNew ? (
            <Button
              disabled={isCreating || loading}
              fullWidth
              onClick={() => void handleAdd()}
              type="button"
              variant="outline"
            >
              {isCreating ? "Adding…" : `Add category “${trimmed}”`}
            </Button>
          ) : null}

          <div className="max-h-52 overflow-y-auto rounded-md border border-white/10">
            {renderCategories()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
