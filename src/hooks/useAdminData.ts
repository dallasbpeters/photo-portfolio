import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import posthog from "../lib/posthog";
import { authStorage, portfolioService } from "../services/portfolioService";
import type { Category, Photo } from "../types";

const sortCategories = (list: Category[]): Category[] =>
  [...list].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)
  );

export interface AdminDataResult {
  categories: Category[];
  createCategoryFromLabel: (label: string) => Promise<string | null>;
  handleDeleteCategory: (cat: Category) => Promise<void>;
  isLoadingCategories: boolean;
  isLoadingPhotos: boolean;
  isSavingCategory: boolean;
  photos: Photo[];
  /** Reload both photos and categories, then fire change notifications. */
  reload: () => Promise<void>;
}

export const useAdminData = (isAuthenticated: boolean): AdminDataResult => {
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
    if (!confirm(`Delete category "${cat.label}"?`)) {
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
    categories,
    createCategoryFromLabel,
    handleDeleteCategory,
    isLoadingCategories,
    isLoadingPhotos,
    isSavingCategory,
    photos,
    reload,
  };
};
