import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "../components/admin/ConfirmProvider";
import posthog from "../lib/posthog";
import { portfolioService } from "../services/portfolioService";
import type { Category, Photo } from "../types";

export interface PhotoSelectionResult {
  allSelected: boolean;
  batchCategoryId: string;
  batchDelete: () => Promise<void>;
  batchSetCategory: () => Promise<void>;
  clear: () => void;
  deletePhoto: (id: string) => Promise<void>;
  isBatchDeleting: boolean;
  isBatchUpdating: boolean;
  selectAllRef: React.RefObject<HTMLInputElement | null>;
  selectedIds: string[];
  setBatchCategoryId: (id: string) => void;
  someSelected: boolean;
  toggle: (id: string) => void;
  toggleAll: () => void;
  toggleCategoryGroup: (groupPhotos: Photo[]) => void;
}

export const usePhotoSelection = (
  photos: Photo[],
  categories: Category[],
  /**
   * Local edits to the library, in place of refetching it.
   *
   * Batch changes already know their outcome — which ids went, and which
   * category the rest moved to — so the list can be brought up to date without
   * the whole grid repainting.
   */
  edit: {
    removePhotos: (ids: string[]) => void;
    replacePhotos: (photos: Photo[]) => void;
  }
): PhotoSelectionResult => {
  const { confirm } = useConfirm();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchCategoryId, setBatchCategoryId] = useState("");
  const [isBatchUpdating, setIsBatchUpdating] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const allSelected =
    photos.length > 0 && photos.every((p) => selectedIds.includes(p.id));
  const someSelected = selectedIds.length > 0;

  useEffect(() => {
    const indeterminate = someSelected && !allSelected;
    // biome-ignore lint/suspicious/noUnnecessaryConditions: React assigns ref.current through the ref prop, which the checker cannot see — the guard is required before mount
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = indeterminate;
    }
  }, [someSelected, allSelected]);

  useEffect(() => {
    if (categories.length === 0) {
      return;
    }
    setBatchCategoryId((prev) => {
      if (prev && categories.some((c) => c.id === prev)) {
        return prev;
      }
      return categories[0].id;
    });
  }, [categories]);

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : photos.map((p) => p.id));
  };

  const clear = () => setSelectedIds([]);

  const toggleCategoryGroup = (groupPhotos: Photo[]) => {
    const ids = groupPhotos.map((p) => p.id);
    const allGroupSelected = ids.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) =>
      allGroupSelected
        ? prev.filter((id) => !ids.includes(id))
        : [...new Set([...prev, ...ids])]
    );
  };

  const batchSetCategory = async (): Promise<void> => {
    if (selectedIds.length === 0 || !batchCategoryId) {
      return;
    }
    setIsBatchUpdating(true);
    try {
      const updated = await portfolioService.batchSetPhotoCategories(
        selectedIds,
        batchCategoryId
      );
      // The endpoint answers with a count, but the destination category is
      // already in hand, so the moved rows can be rewritten here.
      const moved = new Set(selectedIds);
      const target = categories.find((c) => c.id === batchCategoryId);
      if (target) {
        edit.replacePhotos(
          photos.map((p) =>
            moved.has(p.id)
              ? {
                  ...p,
                  category: target.slug,
                  categoryId: target.id,
                  categoryLabel: target.label,
                }
              : p
          )
        );
      }
      setSelectedIds([]);
      if (updated === 0) {
        toast.error("No photos were updated — check selections and try again.");
        return;
      }
      posthog.capture("photos_category_updated", {
        category_id: batchCategoryId,
        photo_count: updated,
      });
      toast.success(`Updated ${updated} photo(s)`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Batch update failed"
      );
    } finally {
      setIsBatchUpdating(false);
    }
  };

  const batchDelete = async (): Promise<void> => {
    if (selectedIds.length === 0) {
      return;
    }
    const n = selectedIds.length;
    const ok = await confirm({
      confirmLabel: "Delete",
      description:
        "The photographs are removed from the portfolio. This cannot be undone.",
      destructive: true,
      title: `Delete ${n} photo${n === 1 ? "" : "s"}?`,
    });
    if (!ok) {
      return;
    }
    setIsBatchDeleting(true);
    try {
      const deleted = await portfolioService.batchDeletePhotos(selectedIds);
      edit.removePhotos(selectedIds);
      setSelectedIds([]);
      if (deleted === 0) {
        toast.error("No photos were deleted.");
        return;
      }
      posthog.capture("photos_deleted", {
        deletion_method: "batch",
        photo_count: deleted,
      });
      toast.success(`Deleted ${deleted} photo${deleted === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Batch delete failed"
      );
    } finally {
      setIsBatchDeleting(false);
    }
  };

  const deletePhoto = async (id: string): Promise<void> => {
    const ok = await confirm({
      confirmLabel: "Delete",
      description:
        "The photograph is removed from the portfolio. This cannot be undone.",
      destructive: true,
      title: "Delete this photograph?",
    });
    if (!ok) {
      return;
    }
    try {
      await portfolioService.deletePhoto(id);
      edit.removePhotos([id]);
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      posthog.capture("photos_deleted", {
        deletion_method: "single",
        photo_count: 1,
      });
      toast.success("Photo deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error deleting photo"
      );
    }
  };

  return {
    allSelected,
    batchCategoryId,
    batchDelete,
    batchSetCategory,
    clear,
    deletePhoto,
    isBatchDeleting,
    isBatchUpdating,
    selectAllRef,
    selectedIds,
    setBatchCategoryId,
    someSelected,
    toggle,
    toggleAll,
    toggleCategoryGroup,
  };
};
