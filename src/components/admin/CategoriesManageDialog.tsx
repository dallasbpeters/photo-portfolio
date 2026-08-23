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
import "../../styles/primitives.css";
import "../../styles/adminChrome.css";
import "./CategoriesManageDialog.css";

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
        <p className="categories-dialog__state categories-dialog__state--caps">
          Loading…
        </p>
      );
    }
    if (filtered.length === 0) {
      return (
        <p className="categories-dialog__state">
          {trimmed ? "No categories match." : "No categories yet."}
        </p>
      );
    }
    return (
      <ul aria-label="Categories" className="admin-list">
        {filtered.map((cat) => (
          <li className="admin-list__row" key={cat.id}>
            <div className="admin-row__body">
              <span className="categories-dialog__label">{cat.label}</span>
              <span className="categories-dialog__slug">{cat.slug}</span>
              <span className="categories-dialog__count">
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
        className="admin-dialog admin-dialog--wide"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="admin-dialog__heading">
            Categories
          </DialogTitle>
          <DialogDescription className="admin-dialog__subtitle">
            Search, add a new name, or remove categories that have no photos.
          </DialogDescription>
        </DialogHeader>

        <div className="stack stack--mid">
          <div className="stack stack--tight">
            <Label className="admin-caps" htmlFor={inputId}>
              Find or add
            </Label>
            <Input
              autoComplete="off"
              className="admin-control"
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

          <div className="admin-inset-list">{renderCategories()}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
