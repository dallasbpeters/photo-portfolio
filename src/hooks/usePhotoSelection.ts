import { useEffect, useRef, useState } from 'react';
import type { Category, Photo } from '../types';
import { portfolioService } from '../services/portfolioService';
import { toast } from 'sonner';
import posthog from '../lib/posthog';

export type PhotoSelectionResult = {
  selectedIds: string[];
  batchCategoryId: string;
  setBatchCategoryId: (id: string) => void;
  isBatchUpdating: boolean;
  isBatchDeleting: boolean;
  allSelected: boolean;
  someSelected: boolean;
  selectAllRef: React.RefObject<HTMLInputElement | null>;
  toggle: (id: string) => void;
  toggleAll: () => void;
  clear: () => void;
  batchSetCategory: () => Promise<void>;
  batchDelete: () => Promise<void>;
  toggleCategoryGroup: (groupPhotos: Photo[]) => void;
  deletePhoto: (id: string) => Promise<void>;
};

export const usePhotoSelection = (
  photos: Photo[],
  categories: Category[],
  reload: () => Promise<void>,
): PhotoSelectionResult => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchCategoryId, setBatchCategoryId] = useState('');
  const [isBatchUpdating, setIsBatchUpdating] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const allSelected = photos.length > 0 && photos.every((p) => selectedIds.includes(p.id));
  const someSelected = selectedIds.length > 0;

  useEffect(() => {
    const indeterminate = someSelected && !allSelected;
    if (selectAllRef.current) selectAllRef.current.indeterminate = indeterminate;
  }, [someSelected, allSelected]);

  useEffect(() => {
    if (categories.length === 0) return;
    setBatchCategoryId((prev) => {
      if (prev && categories.some((c) => c.id === prev)) return prev;
      return categories[0].id;
    });
  }, [categories]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : photos.map((p) => p.id));
  };

  const clear = () => setSelectedIds([]);

  const toggleCategoryGroup = (groupPhotos: Photo[]) => {
    const ids = groupPhotos.map((p) => p.id);
    const allGroupSelected = ids.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) =>
      allGroupSelected ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])],
    );
  };

  const batchSetCategory = async (): Promise<void> => {
    if (selectedIds.length === 0 || !batchCategoryId) return;
    setIsBatchUpdating(true);
    try {
      const updated = await portfolioService.batchSetPhotoCategories(selectedIds, batchCategoryId);
      await reload();
      setSelectedIds([]);
      if (updated === 0) { toast.error('No photos were updated — check selections and try again.'); return; }
      posthog.capture('photos_category_updated', {
        category_id: batchCategoryId,
        photo_count: updated,
      });
      toast.success(`Updated ${updated} photo(s)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Batch update failed');
    } finally {
      setIsBatchUpdating(false);
    }
  };

  const batchDelete = async (): Promise<void> => {
    if (selectedIds.length === 0) return;
    const n = selectedIds.length;
    if (!confirm(`Delete ${n} photo${n === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setIsBatchDeleting(true);
    try {
      const deleted = await portfolioService.batchDeletePhotos(selectedIds);
      await reload();
      setSelectedIds([]);
      if (deleted === 0) { toast.error('No photos were deleted.'); return; }
      posthog.capture('photos_deleted', {
        photo_count: deleted,
        deletion_method: 'batch',
      });
      toast.success(`Deleted ${deleted} photo${deleted === 1 ? '' : 's'}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Batch delete failed');
    } finally {
      setIsBatchDeleting(false);
    }
  };

  const deletePhoto = async (id: string): Promise<void> => {
    if (!confirm('Are you sure?')) return;
    try {
      await portfolioService.deletePhoto(id);
      await reload();
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      posthog.capture('photos_deleted', {
        photo_count: 1,
        deletion_method: 'single',
      });
      toast.success('Photo deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error deleting photo');
    }
  };

  return {
    selectedIds,
    batchCategoryId,
    setBatchCategoryId,
    isBatchUpdating,
    isBatchDeleting,
    allSelected,
    someSelected,
    selectAllRef,
    toggle,
    toggleAll,
    clear,
    batchSetCategory,
    batchDelete,
    toggleCategoryGroup,
    deletePhoto,
  };
};
