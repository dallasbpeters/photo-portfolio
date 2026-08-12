import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "../components/admin/ConfirmProvider";
import posthog from "../lib/posthog";
import { authStorage, portfolioService } from "../services/portfolioService";
import type { Category, Photo } from "../types";

const sortCategories = (list: Category[]): Category[] =>
  [...list].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)
  );

export interface AdminDataResult {
  /**
   * Puts one photograph back after an edit, in place.
   *
   * The alternative — refetching the library after every change — repainted
   * every card, dropped scroll position and made the admin flicker on each
   * rename. The server has already returned the saved row, so the list can
   * simply take it.
   */
  applyPhotoUpdate: (photo: Photo) => void;
  categories: Category[];
  createCategoryFromLabel: (label: string) => Promise<string | null>;
  handleDeleteCategory: (cat: Category) => Promise<void>;
  /** Adds a freshly uploaded photograph without refetching. */
  insertPhoto: (photo: Photo) => void;
  isLoadingCategories: boolean;
  isLoadingPhotos: boolean;
  isSavingCategory: boolean;
  photos: Photo[];
  /** Reload both photos and categories, then fire change notifications. */
  reload: () => Promise<void>;
  /** Drops deleted photographs from the list. */
  removePhotos: (ids: string[]) => void;
  /**
   * Replaces the whole list, for a change that touches many rows at once —
   * a reorder, or moving a selection to another category.
   */
  replacePhotos: (photos: Photo[]) => void;
}

export const useAdminData = (isAuthenticated: boolean): AdminDataResult => {
  const { confirm } = useConfirm();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  const loadPhotos = useCallback(async () => {
    if (!authStorage.getToken()) {
      return;
    }
    setIsLoadingPhotos(true);
    try {
      setPhotos(await portfolioService.getPhotos());
    } catch {
      toast.error("Could not load photos");
      setPhotos([]);
    } finally {
      setIsLoadingPhotos(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    if (!authStorage.getToken()) {
      return;
    }
    setIsLoadingCategories(true);
    try {
      setCategories(sortCategories(await portfolioService.getCategories()));
    } catch {
      toast.error("Could not load categories");
      setCategories([]);
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  const reload = useCallback(async () => {
    await Promise.all([loadPhotos(), loadCategories()]);
    portfolioService.notifyPhotosChanged();
    portfolioService.notifyCategoriesChanged();
  }, [loadPhotos, loadCategories]);

  /**
   * Local edits to the list, used instead of a full reload.
   *
   * Deliberately silent: `notifyPhotosChanged` is a same-document CustomEvent
   * that this hook itself listens for, so announcing a change here would call
   * loadPhotos and refetch the whole library — precisely the reload these
   * exist to avoid. It cannot reach another tab either, and the public gallery
   * is not mounted inside the admin, so there is nobody else to tell.
   */
  const applyPhotoUpdate = useCallback((photo: Photo) => {
    setPhotos((current) => current.map((p) => (p.id === photo.id ? photo : p)));
  }, []);

  const insertPhoto = useCallback((photo: Photo) => {
    // Newest first, and every other position moved up one, because that is
    // exactly what the API did: it runs `sort_order = sort_order + 1` over the
    // whole table before inserting at 0 (api/photos/index.ts). Without the
    // shift the new photograph appears in the right place while every card
    // below it shows a position one lower than the server holds.
    setPhotos((current) => [
      photo,
      ...current.map((p) => ({ ...p, order: p.order + 1 })),
    ]);
  }, []);

  const removePhotos = useCallback((ids: string[]) => {
    const gone = new Set(ids);
    setPhotos((current) => current.filter((p) => !gone.has(p.id)));
  }, []);

  const replacePhotos = useCallback((next: Photo[]) => {
    setPhotos(next);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    void loadPhotos();
    void loadCategories();
  }, [isAuthenticated, loadPhotos, loadCategories]);

  useEffect(() => {
    window.addEventListener("cyan-photos-changed", loadPhotos);
    window.addEventListener("cyan-categories-changed", loadCategories);
    return () => {
      window.removeEventListener("cyan-photos-changed", loadPhotos);
      window.removeEventListener("cyan-categories-changed", loadCategories);
    };
  }, [loadPhotos, loadCategories]);

  const createCategoryFromLabel = useCallback(
    async (label: string): Promise<string | null> => {
      const trimmed = label.trim();
      if (!trimmed) {
        return null;
      }
      const maxOrder = Math.max(...categories.map((c) => c.sortOrder), -1);
      setIsSavingCategory(true);
      try {
        const cat = await portfolioService.createCategory({
          label: trimmed,
          sortOrder: maxOrder + 1,
        });
        await loadCategories();
        portfolioService.notifyCategoriesChanged();
        posthog.capture("category_created");
        toast.success(`Added "${cat.label}"`);
        return cat.id;
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Could not create category"
        );
        return null;
      } finally {
        setIsSavingCategory(false);
      }
    },
    [categories, loadCategories]
  );

  const handleDeleteCategory = async (cat: Category): Promise<void> => {
    const ok = await confirm({
      confirmLabel: "Delete",
      description: "Categories in use by a photograph cannot be deleted.",
      destructive: true,
      title: `Delete category "${cat.label}"?`,
    });
    if (!ok) {
      return;
    }
    try {
      await portfolioService.deleteCategory(cat.id);
      await loadCategories();
      portfolioService.notifyCategoriesChanged();
      posthog.capture("category_deleted");
      toast.success("Category deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete category"
      );
    }
  };

  return {
    applyPhotoUpdate,
    categories,
    createCategoryFromLabel,
    handleDeleteCategory,
    insertPhoto,
    isLoadingCategories,
    isLoadingPhotos,
    isSavingCategory,
    photos,
    reload,
    removePhotos,
    replacePhotos,
  };
};
