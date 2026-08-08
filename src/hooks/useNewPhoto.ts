import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Category } from '../types';
import { portfolioService } from '../services/portfolioService';
import { toast } from 'sonner';
import posthog from '../lib/posthog';
import { extractPhotoMetadata } from '../lib/photoMetadata';

type PhotoForm = { title: string; categoryId: string };

export type NewPhotoResult = {
  form: PhotoForm;
  setForm: React.Dispatch<React.SetStateAction<PhotoForm>>;
  uploadDraftFile: File | null;
  setUploadDraftFile: (f: File | null) => void;
  isUploading: boolean;
  newlyAddedPhotoId: string | null;
  imageFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleAdd: (e: FormEvent) => Promise<void>;
};

export const useNewPhoto = (categories: Category[], reload: () => Promise<void>): NewPhotoResult => {
  const [form, setForm] = useState<PhotoForm>({ title: '', categoryId: '' });
  const [uploadDraftFile, setUploadDraftFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [newlyAddedPhotoId, setNewlyAddedPhotoId] = useState<string | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (categories.length === 0) return;
    setForm((prev) => {
      if (prev.categoryId && categories.some((c) => c.id === prev.categoryId)) return prev;
      return { ...prev, categoryId: categories[0].id };
    });
  }, [categories]);

  const handleAdd = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!form.categoryId) { toast.error('Choose a category'); return; }
    if (!uploadDraftFile) { toast.error('Choose an image file to upload'); return; }

    setIsUploading(true);
    let url: string;
    let meta: Awaited<ReturnType<typeof extractPhotoMetadata>> = {};
    try {
      meta = await extractPhotoMetadata(uploadDraftFile);
      const { url: uploaded } = await portfolioService.uploadImageFile(uploadDraftFile);
      url = uploaded;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
      return;
    } finally {
      setIsUploading(false);
    }

    try {
      const added = await portfolioService.addPhoto({
        ...form,
        url,
        width: meta.width,
        height: meta.height,
        lqip: meta.lqip,
        exif: meta.exif,
      });
      await reload();
      setUploadDraftFile(null);
      if (imageFileInputRef.current) imageFileInputRef.current.value = '';
      setForm((prev) => ({ title: '', categoryId: prev.categoryId }));
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      setNewlyAddedPhotoId(added.id);
      highlightTimerRef.current = setTimeout(() => setNewlyAddedPhotoId(null), 3000);
      posthog.capture('photo_created', {
        category_id: added.categoryId,
      });
      toast.success('Photo added successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error adding photo');
    }
  };

  return { form, setForm, uploadDraftFile, setUploadDraftFile, isUploading, newlyAddedPhotoId, imageFileInputRef, handleAdd };
};
