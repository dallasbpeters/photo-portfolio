import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { createNeutralEdit, type EditState } from "./adjustments";
import {
  DEFAULT_EXPORT,
  type ExportSettings,
  encodeCanvas,
  fileExtension,
  formatBytes,
  MAX_UPLOAD_BYTES,
} from "./engine/export";

/** Debounce before re-encoding for the size estimate. */
const ESTIMATE_DELAY_MS = 350;

export type EditorExport = {
  settings: ExportSettings;
  setSettings: (next: ExportSettings) => void;
  /** Encoded size in bytes, or null before the first estimate lands. */
  estimatedSize: number | null;
  isSaving: boolean;
  save: () => Promise<void>;
};

/**
 * Export settings, the size estimate, and saving.
 *
 * The estimate is debounced and only computed while the export panel is open,
 * because each one re-encodes the full image — doing that per slider tick would
 * stall the editor on a large photograph.
 */
export const useEditorExport = (
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  edit: EditState,
  showOriginal: boolean,
  isReady: boolean,
  isEstimating: boolean,
  render: (edit: EditState) => void,
  onSave: (blob: Blob, extension: string) => Promise<void>
): EditorExport => {
  const [settings, setSettings] = useState<ExportSettings>(DEFAULT_EXPORT);
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!(isReady && isEstimating)) {
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        const canvas = canvasRef.current;
        if (!canvas) {
          return;
        }
        const blob = await encodeCanvas(canvas, settings);
        setEstimatedSize(blob?.size ?? null);
      })();
    }, ESTIMATE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [canvasRef, isEstimating, isReady, settings]);

  const save = useCallback(async () => {
    setIsSaving(true);
    try {
      // Render the real edit first: the canvas may currently be showing the
      // original because compare is held down.
      render(edit);

      const canvas = canvasRef.current;
      if (!canvas) {
        throw new Error("Canvas is unavailable");
      }

      const blob = await encodeCanvas(canvas, settings);
      if (!blob) {
        throw new Error("Could not encode the image");
      }
      if (blob.size > MAX_UPLOAD_BYTES) {
        throw new Error(
          `${formatBytes(blob.size)} exceeds the ${formatBytes(MAX_UPLOAD_BYTES)} upload limit. Lower the quality or the maximum size.`
        );
      }

      await onSave(blob, fileExtension(settings.format));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setIsSaving(false);
      // Restore whatever the viewer was looking at.
      render(showOriginal ? createNeutralEdit() : edit);
    }
  }, [canvasRef, edit, onSave, render, settings, showOriginal]);

  return { estimatedSize, isSaving, save, setSettings, settings };
};
