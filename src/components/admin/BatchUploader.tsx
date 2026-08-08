import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, Xmark, Check, WarningTriangle } from 'iconoir-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { CategoryPicker } from './CategoryPicker';
import { portfolioService } from '../../services/portfolioService';
import type { Category } from '../../types';
import posthog from '../../lib/posthog';
import { extractPhotoMetadata, type PhotoMetadata } from '../../lib/photoMetadata';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

/** How many files transfer at once — enough to saturate a connection, not enough to stall the UI. */
const CONCURRENCY = 3;

type Item = {
  id: string;
  file: File;
  title: string;
  status: 'queued' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
  meta?: PhotoMetadata;
};

/** Filename without extension, tidied into a human title. */
const titleFromFile = (name: string): string =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Untitled';

interface BatchUploaderProps {
  categories: Category[];
  reload: () => Promise<void>;
  onCreateCategory: (label: string) => Promise<string | null>;
}

/**
 * Drag-and-drop batch upload.
 *
 * Files stream straight to Blob storage, so a whole shoot can be dropped at
 * once without the payload ceiling the old base64 path imposed. Each file
 * succeeds or fails independently — one bad file never abandons the rest of the
 * batch, and failures stay listed so they can be retried.
 */
export function BatchUploader({ categories, reload, onCreateCategory }: BatchUploaderProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Drag events fire for every child element; count them so leaving a child
  // does not clear the highlight.
  const dragDepth = useRef(0);

  const effectiveCategory = categoryId || categories[0]?.id || '';

  const addFiles = useCallback((files: FileList | File[]) => {
    const accepted: Item[] = [];
    let rejected = 0;

    for (const file of Array.from(files)) {
      if (!ACCEPTED.includes(file.type)) {
        rejected += 1;
        continue;
      }
      accepted.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        title: titleFromFile(file.name),
        status: 'queued',
        progress: 0,
      });
    }

    if (rejected > 0) {
      toast.error(`${rejected} file${rejected === 1 ? '' : 's'} skipped — JPEG, PNG, WebP, AVIF or GIF only`);
    }
    if (accepted.length > 0) setItems((prev) => [...prev, ...accepted]);
  }, []);

  const update = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const transfer = async (item: Item): Promise<{ url: string; meta: PhotoMetadata } | null> => {
    update(item.id, { status: 'uploading', progress: 0 });
    try {
      // Read dimensions, EXIF and the blur placeholder from the local file —
      // the bytes are already here, so doing it server-side would ship them twice.
      const meta = await extractPhotoMetadata(item.file);
      const { url } = await portfolioService.uploadImageFile(item.file, (percent) =>
        update(item.id, { progress: percent }),
      );
      return { url, meta };
    } catch (err) {
      update(item.id, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Upload failed',
      });
      return null;
    }
  };

  const start = async (): Promise<void> => {
    if (!effectiveCategory) {
      toast.error('Choose a category first');
      return;
    }

    const pending = items.filter((i) => i.status === 'queued' || i.status === 'error');
    if (pending.length === 0) return;

    setIsRunning(true);
    let succeeded = 0;

    // Phase 1 — transfer bytes concurrently. Simple worker pool: each worker
    // pulls the next file until the queue drains.
    const uploaded = new Map<string, { url: string; meta: PhotoMetadata }>();
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const item = pending[cursor++];
        if (!item) break;
        const result = await transfer(item);
        if (result) uploaded.set(item.id, result);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));

    // Phase 2 — create rows sequentially, in reverse. Each POST inserts at
    // position 0 and shifts the rest up, so reversing here leaves the gallery
    // reading in the order the files were dropped.
    for (let i = pending.length - 1; i >= 0; i--) {
      const item = pending[i];
      if (!item) continue;
      const result = uploaded.get(item.id);
      if (!result) continue;
      try {
        await portfolioService.addPhoto({
          title: item.title,
          categoryId: effectiveCategory,
          url: result.url,
          width: result.meta.width,
          height: result.meta.height,
          lqip: result.meta.lqip,
          exif: result.meta.exif,
        });
        update(item.id, { status: 'done', progress: 100 });
        succeeded += 1;
      } catch (err) {
        update(item.id, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Could not add photo',
        });
      }
    }

    setIsRunning(false);
    await reload();

    if (succeeded > 0) {
      posthog.capture('photos_batch_uploaded', { count: succeeded });
      toast.success(`${succeeded} photo${succeeded === 1 ? '' : 's'} added`);
    }
    const failed = pending.length - succeeded;
    if (failed > 0) toast.error(`${failed} failed — they stay listed so you can retry`);
  };

  const doneCount = items.filter((i) => i.status === 'done').length;
  const pendingCount = items.filter((i) => i.status === 'queued' || i.status === 'error').length;

  return (
    <Card className="bg-white/[0.02] border-white/10">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-sm font-light uppercase tracking-[0.2em] text-white/70">
          <Upload width={16} height={16} aria-hidden />
          Batch upload
        </CardTitle>
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => setItems([])}
            disabled={isRunning}
            className="text-[10px] uppercase tracking-[0.18em] text-white/35 transition-colors hover:text-white disabled:opacity-30"
          >
            Clear
          </button>
        )}
      </CardHeader>

      <CardContent className="space-y-5">
        <CategoryPicker
          id="batch-category"
          label="Category"
          categories={categories}
          value={effectiveCategory}
          onChange={setCategoryId}
          onCreate={onCreateCategory}
          disabled={categories.length === 0 || isRunning}
        />

        <div
          onDragEnter={(e) => {
            e.preventDefault();
            dragDepth.current += 1;
            setIsDragging(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            e.preventDefault();
            dragDepth.current -= 1;
            if (dragDepth.current <= 0) setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            dragDepth.current = 0;
            setIsDragging(false);
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed py-10 transition-colors ${
            isDragging
              ? 'border-white/50 bg-white/[0.06]'
              : 'border-white/15 hover:border-white/30 hover:bg-white/[0.02]'
          }`}
        >
          <Upload width={20} height={20} className="text-white/30" aria-hidden />
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">
            Drop photos here
          </p>
          <p className="text-[10px] text-white/25">or click to browse — JPEG, PNG, WebP, AVIF, GIF</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED.join(',')}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {items.length > 0 && (
          <>
            <ul className="max-h-72 divide-y divide-white/[0.06] overflow-y-auto">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-5 shrink-0">
                    {item.status === 'done' && (
                      <Check width={14} height={14} className="text-emerald-400/80" />
                    )}
                    {item.status === 'error' && (
                      <WarningTriangle width={14} height={14} className="text-red-400/80" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <input
                      value={item.title}
                      onChange={(e) => update(item.id, { title: e.target.value })}
                      disabled={isRunning || item.status === 'done'}
                      aria-label={`Title for ${item.file.name}`}
                      className="w-full bg-transparent text-sm text-white/85 focus:outline-none disabled:text-white/40"
                    />
                    {item.status === 'uploading' && (
                      <div className="mt-1.5 h-px w-full bg-white/10">
                        <div
                          className="h-px bg-white/70 transition-all duration-200"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}
                    {item.error && (
                      <p className="mt-1 text-[10px] text-red-400/70">{item.error}</p>
                    )}
                  </div>

                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-white/25">
                    {(item.file.size / 1024 / 1024).toFixed(1)}MB
                  </span>

                  {!isRunning && item.status !== 'done' && (
                    <button
                      type="button"
                      onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                      aria-label={`Remove ${item.file.name}`}
                      className="shrink-0 text-white/25 transition-colors hover:text-white"
                    >
                      <Xmark width={13} height={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={() => void start()}
                disabled={isRunning || pendingCount === 0 || !effectiveCategory}
                variant="outline"
                className="min-h-11 border-white/20 text-[10px] uppercase tracking-[0.18em] hover:bg-white hover:text-black"
              >
                {isRunning ? 'Uploading…' : `Upload ${pendingCount}`}
              </Button>
              {doneCount > 0 && (
                <span className="text-[10px] uppercase tracking-[0.16em] text-white/35">
                  {doneCount} of {items.length} done
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
