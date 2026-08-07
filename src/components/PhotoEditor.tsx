import { useEffect, useRef } from 'react';
import CreativeEditorSDK from '@cesdk/cesdk-js';
import { toast } from 'sonner';
import { initPhotoEditor } from '../imgly';
import { portfolioService } from '../services/portfolioService';
import type { Photo } from '../types';
import { X } from 'lucide-react';
import { site } from '../site';

interface PhotoEditorProps {
  photo: Photo;
  onClose: () => void;
  /** Called after the edited image is uploaded and the photo record is updated. */
  onSaved: (updated: Photo) => void;
}

export function PhotoEditor({ photo, onClose, onSaved }: PhotoEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cesdkRef = useRef<CreativeEditorSDK | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;

    const config = {
      userId: `${site.key}-photo-editor`,
    };

    const handleSave = async (blob: Blob) => {
      const toastId = toast.loading('Saving changes…');
      try {
        const file = new File([blob], `${photo.id}.png`, { type: 'image/png' });
        const { url } = await portfolioService.uploadImageFile(file);
        const updated = await portfolioService.updatePhoto(photo.id, {
          title: photo.title,
          categoryId: photo.categoryId,
          order: photo.order,
          url,
        });
        toast.success('Changes saved', { id: toastId });
        onSaved(updated);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not save changes', {
          id: toastId,
        });
      }
    };

    CreativeEditorSDK.create(containerRef.current, config)
      .then(async (cesdk) => {
        if (disposed) {
          cesdk.dispose();
          return;
        }

        cesdkRef.current = cesdk;

        try {
          await initPhotoEditor(cesdk, { onSave: handleSave });

          // Resolve natural image dimensions before creating the scene
          const { width: imgW, height: imgH } = await new Promise<{ width: number; height: number }>(
            (resolve) => {
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
              img.onerror = () => resolve({ width: 1080, height: 1080 }); // fallback
              img.src = photo.url;
            },
          );

          await cesdk.actions.run('scene.create', {
            page: { width: imgW, height: imgH, unit: 'Pixel' },
          });

          const engine = cesdk.engine;
          const page = engine.block.findByType('page')[0];

          if (page != null) {
            const imageFill = engine.block.createFill('image');
            engine.block.setString(imageFill, 'fill/image/imageFileURI', photo.url);
            engine.block.setFill(page, imageFill);
            engine.block.setContentFillMode(page, 'Cover');

            await engine.scene.zoomToBlock(page, 40, 40, 40, 40);
          }
        } catch (error) {
          console.error('[CE.SDK init] Failed:', error);
        }
      })
      .catch((error) => {
        console.error('Failed to initialize CE.SDK:', error);
      });

    return () => {
      disposed = true;
      if (cesdkRef.current) {
        cesdkRef.current.dispose();
        cesdkRef.current = null;
      }
    };
  }, [photo.id]);

  return (
    <div className="fixed inset-0 z-100 bg-black flex flex-col">
      <div className="flex items-center justify-between px-6 h-14 bg-black border-b border-white/10 shrink-0">
        <h2 className="text-sm font-light uppercase tracking-[0.3em] text-white/60">
          Photo Editor
        </h2>
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-white/40 hover:text-white transition-colors text-[10px] uppercase tracking-[0.2em]"
        >
          <X size={16} />
          Close
        </button>
      </div>
      <div
        ref={containerRef}
        className="flex-1"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}
