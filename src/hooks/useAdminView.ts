import { useMemo, useState } from "react";
import type { Photo } from "../types";

interface CategoryGroup {
  categoryId: string;
  categoryLabel: string;
  photos: Photo[];
}

export interface AdminViewResult {
  categorizedPhotos: CategoryGroup[];
  stackedView: boolean;
  toggleView: () => void;
}

export const useAdminView = (photos: Photo[]): AdminViewResult => {
  const [stackedView, setStackedView] = useState<boolean>(() => {
    try {
      return localStorage.getItem("admin_view") === "stacked";
    } catch {
      return false;
    }
  });

  const toggleView = () => {
    setStackedView((v) => {
      const next = !v;
      try {
        localStorage.setItem("admin_view", next ? "stacked" : "grid");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const categorizedPhotos = useMemo<CategoryGroup[]>(() => {
    const map = new Map<string, CategoryGroup>();
    for (const photo of photos) {
      if (!map.has(photo.categoryId)) {
        map.set(photo.categoryId, {
          categoryId: photo.categoryId,
          categoryLabel: photo.categoryLabel,
          photos: [],
        });
      }
      map.get(photo.categoryId)?.photos.push(photo);
    }
    return Array.from(map.values());
  }, [photos]);

  return { categorizedPhotos, stackedView, toggleView };
};
