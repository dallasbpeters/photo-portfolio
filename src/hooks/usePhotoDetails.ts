import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { formatShutter, parseShutter } from "../lib/photoMetadata";
import posthog from "../lib/posthog";
import { portfolioService } from "../services/portfolioService";
import type { Photo, PhotoExifData } from "../types";

/**
 * The EXIF form, held as text rather than numbers.
 *
 * A number input bound to a number has no way to say "empty" — it reads back as
 * 0 or NaN, and 0 is a real f-number to nobody but is still a value. Keeping
 * the raw text means a blank box stays blank, and the conversion happens once,
 * on save.
 */
export interface ExifForm {
  aperture: string;
  focalLength: string;
  iso: string;
  lens: string;
  make: string;
  model: string;
  /** As the photographer writes it: "1/250" or "2s". */
  shutter: string;
  /** `datetime-local` value, i.e. local time with no zone. */
  takenAt: string;
}

const EMPTY_EXIF: ExifForm = {
  aperture: "",
  focalLength: "",
  iso: "",
  lens: "",
  make: "",
  model: "",
  shutter: "",
  takenAt: "",
};

const numberText = (value: number | undefined): string =>
  typeof value === "number" && Number.isFinite(value) ? String(value) : "";

/** ISO instant → the local "YYYY-MM-DDTHH:mm" a datetime-local input wants. */
const toLocalInput = (iso: string | undefined): string => {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  // Shifted by the zone offset because toISOString always renders UTC, and the
  // input expects wall-clock time — without this a photo taken at 18:00 shows
  // as 23:00 to anyone west of Greenwich.
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};

const toForm = (exif: PhotoExifData | null): ExifForm => ({
  aperture: numberText(exif?.aperture),
  focalLength: numberText(exif?.focalLength),
  iso: numberText(exif?.iso),
  lens: exif?.lens ?? "",
  make: exif?.make ?? "",
  model: exif?.model ?? "",
  shutter: formatShutter(exif?.exposureTime) ?? "",
  takenAt: toLocalInput(exif?.takenAt),
});

/** A positive number typed into a box, or undefined for blank and nonsense. */
const positive = (value: string): number | undefined => {
  const n = Number(value.trim());
  return value.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * The form as the API takes it, or null when nothing was filled in.
 *
 * Null rather than an empty object so clearing every box actually clears the
 * stored EXIF instead of leaving `{}` behind.
 */
const toPayload = (form: ExifForm): PhotoExifData | null => {
  const takenAtDate = form.takenAt ? new Date(form.takenAt) : null;

  const exif: PhotoExifData = {
    aperture: positive(form.aperture),
    exposureTime: parseShutter(form.shutter),
    focalLength: positive(form.focalLength),
    iso: positive(form.iso),
    lens: form.lens.trim() || undefined,
    make: form.make.trim() || undefined,
    model: form.model.trim() || undefined,
    takenAt:
      takenAtDate && !Number.isNaN(takenAtDate.getTime())
        ? takenAtDate.toISOString()
        : undefined,
  };

  const kept = Object.fromEntries(
    Object.entries(exif).filter(([, v]) => v !== undefined)
  ) as PhotoExifData;

  return Object.keys(kept).length > 0 ? kept : null;
};

export interface PhotoDetailsResult {
  close: () => void;
  detailsCategoryId: string;
  detailsChromeUrl: string;
  detailsExif: ExifForm;
  detailsOrder: number;
  detailsPhoto: Photo | null;
  detailsShowChrome: boolean;
  detailsTitle: string;
  isSaving: boolean;
  open: (photo: Photo) => void;
  save: (e: FormEvent) => Promise<void>;
  setDetailsCategoryId: (id: string) => void;
  setDetailsChromeUrl: (u: string) => void;
  setDetailsExifField: (field: keyof ExifForm, value: string) => void;
  setDetailsOrder: (o: number) => void;
  setDetailsShowChrome: (v: boolean) => void;
  setDetailsTitle: (t: string) => void;
}

export const usePhotoDetails = (
  /** Hands the saved row back so the list can patch it in without refetching. */
  onSaved: (photo: Photo) => void
): PhotoDetailsResult => {
  const [detailsPhoto, setDetailsPhoto] = useState<Photo | null>(null);
  const [detailsTitle, setDetailsTitle] = useState("");
  const [detailsCategoryId, setDetailsCategoryId] = useState("");
  const [detailsOrder, setDetailsOrder] = useState(0);
  const [detailsExif, setDetailsExif] = useState<ExifForm>(EMPTY_EXIF);
  const [detailsShowChrome, setDetailsShowChrome] = useState(false);
  const [detailsChromeUrl, setDetailsChromeUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const open = (photo: Photo) => {
    setDetailsPhoto(photo);
    setDetailsTitle(photo.title);
    setDetailsCategoryId(photo.categoryId);
    setDetailsOrder(photo.order);
    setDetailsExif(toForm(photo.exif));
    setDetailsShowChrome(photo.showChrome);
    setDetailsChromeUrl(photo.chromeUrl ?? "");
  };

  const close = () => setDetailsPhoto(null);

  const setDetailsExifField = (field: keyof ExifForm, value: string) =>
    setDetailsExif((current) => ({ ...current, [field]: value }));

  const save = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!detailsPhoto) {
      return;
    }
    if (!detailsCategoryId) {
      toast.error("Choose a category");
      return;
    }
    // Caught before saving, since the box would otherwise silently empty
    // itself: an unreadable shutter speed is dropped by the conversion above.
    if (detailsExif.shutter.trim() && !parseShutter(detailsExif.shutter)) {
      toast.error('Shutter speed should look like "1/250" or "2s"');
      return;
    }
    setIsSaving(true);
    try {
      const saved = await portfolioService.updatePhoto(detailsPhoto.id, {
        categoryId: detailsCategoryId,
        // Always sent, so clearing the address actually clears the column --
        // the API distinguishes an absent key from an empty one.
        chromeUrl: detailsChromeUrl.trim(),
        exif: toPayload(detailsExif),
        order: detailsOrder,
        showChrome: detailsShowChrome,
        title: detailsTitle.trim(),
      });
      onSaved(saved);
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
    detailsChromeUrl,
    detailsExif,
    detailsOrder,
    detailsPhoto,
    detailsShowChrome,
    detailsTitle,
    isSaving,
    open,
    save,
    setDetailsCategoryId,
    setDetailsChromeUrl,
    setDetailsExifField,
    setDetailsOrder,
    setDetailsShowChrome,
    setDetailsTitle,
  };
};
