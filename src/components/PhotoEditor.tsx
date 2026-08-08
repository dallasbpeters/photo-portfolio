import { toast } from "sonner";
import { PhotoEditorShell } from "../editor/ui/PhotoEditorShell";
import posthog from "../lib/posthog";
import { portfolioService } from "../services/portfolioService";
import type { Photo } from "../types";

interface PhotoEditorProps {
  onClose: () => void;
  /** Called after the edited image is uploaded and the photo record is updated. */
  onSaved: (updated: Photo) => void;
  photo: Photo;
}

/**
 * Adapter between the portfolio's photo record and the editor.
 *
 * The editor itself knows nothing about the API — it hands back a graded blob
 * and this decides where it goes.
 */
export function PhotoEditor({ photo, onClose, onSaved }: PhotoEditorProps) {
  const handleSave = async (blob: Blob, extension: string): Promise<void> => {
    const toastId = toast.loading("Saving changes…");
    try {
      const file = new File([blob], `${photo.id}.${extension}`, {
        type: blob.type,
      });
      const { url } = await portfolioService.uploadImageFile(file);
      const updated = await portfolioService.updatePhoto(photo.id, {
        categoryId: photo.categoryId,
        order: photo.order,
        title: photo.title,
        url,
      });
      posthog.capture("photo_edit_saved", {
        export_format: extension,
      });
      toast.success("Changes saved", { id: toastId });
      onSaved(updated);
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save changes",
        {
          id: toastId,
        }
      );
      // Rethrow so the editor stays open with the edit intact.
      throw error;
    }
  };

  return (
    <PhotoEditorShell
      imageUrl={photo.url}
      onClose={onClose}
      onSave={handleSave}
      title={photo.title}
    />
  );
}
