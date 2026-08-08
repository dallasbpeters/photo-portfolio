import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { extractPhotoMetadata } from "../lib/photoMetadata";
import posthog from "../lib/posthog";
import { portfolioService } from "../services/portfolioService";
import type { Category } from "../types";

interface PhotoForm {
  categoryId: string;
  title: string;
}

export interface NewPhotoResult {
  form: PhotoForm;
  handleAdd: (e: FormEvent) => Promise<void>;
  imageFileInputRef: React.RefObject<HTMLInputElement | null>;
  isUploading: boolean;
  newlyAddedPhotoId: string | null;
  setForm: React.Dispatch<React.SetStateAction<PhotoForm>>;
  setUploadDraftFile: (f: File | null) => void;
  uploadDraftFile: File | null;
}

export const useNewPhoto = (
  categories: Category[],
  reload: () => Promise<void>
): NewPhotoResult => {
  const [form, setForm] = useState<PhotoForm>({ categoryId: "", title: "" });
  const [uploadDraftFile, setUploadDraftFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [newlyAddedPhotoId, setNewlyAddedPhotoId] = useState<string | null>(
    null
  );
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (categories.length === 0) {
      return;
    }
    setForm((prev) => {
      if (prev.categoryId && categories.some((c) => c.id === prev.categoryId)) {
        return prev;
      }
      return { ...prev, categoryId: categories[0].id };
    });
  }, [categories]);

  const handleAdd = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!form.categoryId) {
      toast.error("Choose a category");
      return;
    }
    if (!uploadDraftFile) {
      toast.error("Choose an image file to upload");
      return;
    }

    setIsUploading(true);
    let url: string;
    let meta: Awaited<ReturnType<typeof extractPhotoMetadata>> = {};
    try {
      meta = await extractPhotoMetadata(uploadDraftFile);
      const { url: uploaded } =
        await portfolioService.uploadImageFile(uploadDraftFile);
      url = uploaded;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
      return;
    } finally {
      setIsUploading(false);
    }

    try {
      const added = await portfolioService.addPhoto({
        ...form,
        exif: meta.exif,
        height: meta.height,
        lqip: meta.lqip,
        url,
        width: meta.width,
      });
      await reload();
      setUploadDraftFile(null);
      if (imageFileInputRef.current) {
        imageFileInputRef.current.value = "";
      }
      setForm((prev) => ({ categoryId: prev.categoryId, title: "" }));
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
      setNewlyAddedPhotoId(added.id);
      highlightTimerRef.current = setTimeout(
        () => setNewlyAddedPhotoId(null),
        3000
      );
      posthog.capture("photo_created", {
        category_id: added.categoryId,
      });
      toast.success("Photo added successfully");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error adding photo"
      );
    }
  };

  return {
    form,
    handleAdd,
    imageFileInputRef,
    isUploading,
    newlyAddedPhotoId,
    setForm,
    setUploadDraftFile,
    uploadDraftFile,
  };
};
