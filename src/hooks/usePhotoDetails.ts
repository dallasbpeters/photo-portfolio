import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Photo } from '../types';
import { portfolioService } from '../services/portfolioService';
import { toast } from 'sonner';
import posthog from '../lib/posthog';

export type PhotoDetailsResult = {
  detailsPhoto: Photo | null;
  detailsTitle: string;
  setDetailsTitle: (t: string) => void;
  detailsCategoryId: string;
  setDetailsCategoryId: (id: string) => void;
  detailsOrder: number;
  setDetailsOrder: (o: number) => void;
  isSaving: boolean;
  open: (photo: Photo) => void;
  close: () => void;
  save: (e: FormEvent) => Promise<void>;
};

export const usePhotoDetails = (reload: () => Promise<void>): PhotoDetailsResult => {
  const [detailsPhoto, setDetailsPhoto] = useState<Photo | null>(null);
  const [detailsTitle, setDetailsTitle] = useState('');
  const [detailsCategoryId, setDetailsCategoryId] = useState('');
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
    if (!detailsPhoto) return;
    if (!detailsCategoryId) { toast.error('Choose a category'); return; }
    setIsSaving(true);
    try {
      await portfolioService.updatePhoto(detailsPhoto.id, {
        title: detailsTitle.trim(),
        categoryId: detailsCategoryId,
        order: detailsOrder,
      });
      await reload();
      posthog.capture('photo_details_updated', {
        category_id: detailsCategoryId,
      });
      toast.success('Details saved');
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save details');
    } finally {
      setIsSaving(false);
    }
  };

  return {
    detailsPhoto,
    detailsTitle,
    setDetailsTitle,
    detailsCategoryId,
    setDetailsCategoryId,
    detailsOrder,
    setDetailsOrder,
    isSaving,
    open,
    close,
    save,
  };
};
