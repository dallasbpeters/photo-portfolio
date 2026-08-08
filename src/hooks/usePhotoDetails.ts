import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import posthog from "../lib/posthog";
import { portfolioService } from "../services/portfolioService";
import type { Photo } from "../types";

export interface PhotoDetailsResult {
  close: () => void;
  detailsCategoryId: string;
  detailsOrder: number;
  detailsPhoto: Photo | null;
  detailsTitle: string;
  isSaving: boolean;
  open: (photo: Photo) => void;
  save: (e: FormEvent) => Promise<void>;
  setDetailsCategoryId: (id: string) => void;
  setDetailsOrder: (o: number) => void;
  setDetailsTitle: (t: string) => void;
}

export const usePhotoDetails = (
  reload: () => Promise<void>
): PhotoDetailsResult => {
  const [detailsPhoto, setDetailsPhoto] = useState<Photo | null>(null);
  const [detailsTitle, setDetailsTitle] = useState("");
  const [detailsCategoryId, setDetailsCategoryId] = useState("");
  const [detailsOrder, setDetailsOrder] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const open = (photo: Photo) => {
    setDetailsPhoto(photo);
    setDetailsTitle(photo.title);
    setDetailsCategoryId(photo.categoryId);
    setDetailsOrder(photo.order);
  };

  const close = () => setDetailsPhoto(null);

  const save = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!detailsPhoto) {
      return;
    }
    if (!detailsCategoryId) {
      toast.error("Choose a category");
      return;
    }
    setIsSaving(true);
    try {
      await portfolioService.updatePhoto(detailsPhoto.id, {
        categoryId: detailsCategoryId,
        order: detailsOrder,
        title: detailsTitle.trim(),
      });
      await reload();
      posthog.capture("photo_details_updated", {
        category_id: detailsCategoryId,
      });
      toast.success("Details saved");
      close();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save details"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return {
    close,
    detailsCategoryId,
    detailsOrder,
    detailsPhoto,
    detailsTitle,
    isSaving,
    open,
    save,
    setDetailsCategoryId,
    setDetailsOrder,
    setDetailsTitle,
  };
};
