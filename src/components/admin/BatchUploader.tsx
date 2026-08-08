import { Check, Upload, WarningTriangle, Xmark } from "iconoir-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  extractPhotoMetadata,
  type PhotoMetadata,
} from "../../lib/photoMetadata";
import posthog from "../../lib/posthog";
import { portfolioService } from "../../services/portfolioService";
import type { Category } from "../../types";
import { Button } from "../ui/button";
import { CardHeader } from "../ui/card";

const ACCEPTED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

/** How many files transfer at once — enough to saturate a connection, not enough to stall the UI. */
const CONCURRENCY = 3;

interface Item {
  error?: string;
  file: File;
  id: string;
  meta?: PhotoMetadata;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  title: string;
}

/** Filename without extension, tidied into a human title. */
const titleFromFile = (name: string): string =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Untitled";

interface BatchUploaderProps {
  categories: Category[];
  /**
   * Category for the batch, supplied by the host form.
   *
   * This component no longer renders its own picker — it sits inside the Add
   * New Item card, which already has one. Falling back to the first category
   * instead would silently file a whole shoot under the wrong heading.
   */
  categoryId: string;
  reload: () => Promise<void>;
}

/**
 * Drag-and-drop batch upload.
 *
 * Files stream straight to Blob storage, so a whole shoot can be dropped at
 * once without the payload ceiling the old base64 path imposed. Each file
 * succeeds or fails independently — one bad file never abandons the rest of the
 * batch, and failures stay listed so they can be retried.
 */
export function BatchUploader({
  categories,
  reload,
  categoryId,
}: BatchUploaderProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Drag events fire for every child element; count them so leaving a child
  // does not clear the highlight.
  const dragDepth = useRef(0);

  const effectiveCategory = categoryId || categories[0]?.id || "";

  const addFiles = useCallback((files: FileList | File[]) => {
    const accepted: Item[] = [];
    let rejected = 0;

    for (const file of Array.from(files)) {
      if (!ACCEPTED.includes(file.type)) {
        rejected += 1;
        continue;
      }
      accepted.push({
        file,
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        progress: 0,
        status: "queued",
        title: titleFromFile(file.name),
      });
    }

    if (rejected > 0) {
      toast.error(
        `${rejected} file${rejected === 1 ? "" : "s"} skipped — JPEG, PNG, WebP, AVIF or GIF only`
      );
    }
    if (accepted.length > 0) {
      setItems((prev) => [...prev, ...accepted]);
    }
  }, []);

  const update = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const transfer = async (
    item: Item
  ): Promise<{ url: string; meta: PhotoMetadata } | null> => {
    update(item.id, { progress: 0, status: "uploading" });
    try {
      // Read dimensions, EXIF and the blur placeholder from the local file —
      // the bytes are already here, so doing it server-side would ship them twice.
      const meta = await extractPhotoMetadata(item.file);
      const { url } = await portfolioService.uploadImageFile(
        item.file,
        (percent) => update(item.id, { progress: percent })
      );
      return { meta, url };
    } catch (err) {
      update(item.id, {
        error: err instanceof Error ? err.message : "Upload failed",
        status: "error",
      });
      return null;
    }
  };

  const start = async (): Promise<void> => {
    if (!effectiveCategory) {
      toast.error("Choose a category first");
      return;
    }

    const pending = items.filter(
      (i) => i.status === "queued" || i.status === "error"
    );
    if (pending.length === 0) {
      return;
    }

    setIsRunning(true);
    let succeeded = 0;

    // Phase 1 — transfer bytes concurrently. Simple worker pool: each worker
    // pulls the next file until the queue drains.
    const uploaded = new Map<string, { url: string; meta: PhotoMetadata }>();
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const item = pending[cursor];
        cursor += 1;
        if (!item) {
          break;
        }
        const result = await transfer(item);
        if (result) {
          uploaded.set(item.id, result);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker)
    );

    // Phase 2 — create rows sequentially, in reverse. Each POST inserts at
    // position 0 and shifts the rest up, so reversing here leaves the gallery
    // reading in the order the files were dropped.
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      const item = pending[i];
      if (!item) {
        continue;
      }
      const result = uploaded.get(item.id);
      if (!result) {
        continue;
      }
      try {
        await portfolioService.addPhoto({
          categoryId: effectiveCategory,
          exif: result.meta.exif,
          height: result.meta.height,
          lqip: result.meta.lqip,
          title: item.title,
          url: result.url,
          width: result.meta.width,
        });
        update(item.id, { progress: 100, status: "done" });
        succeeded += 1;
      } catch (err) {
        update(item.id, {
          error: err instanceof Error ? err.message : "Could not add photo",
          status: "error",
        });
      }
    }

    setIsRunning(false);
    await reload();

    if (succeeded > 0) {
      posthog.capture("photos_batch_uploaded", { count: succeeded });
      toast.success(`${succeeded} photo${succeeded === 1 ? "" : "s"} added`);
    }
    const failed = pending.length - succeeded;
    if (failed > 0) {
      toast.error(`${failed} failed — they stay listed so you can retry`);
    }
  };

  const doneCount = items.filter((i) => i.status === "done").length;
  const pendingCount = items.filter(
    (i) => i.status === "queued" || i.status === "error"
  ).length;

  return (
    <>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        {items.length > 0 ? (
          <button
            className="text-[10px] text-white/35 uppercase tracking-[0.18em] transition-colors hover:text-white disabled:opacity-30"
            disabled={isRunning}
            onClick={() => setItems([])}
            type="button"
          >
            Clear
          </button>
        ) : null}
      </CardHeader>

      <div className="space-y-5">
        <div
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed py-10 transition-colors ${
            isDragging
              ? "border-white/50 bg-white/6"
              : "border-white/15 hover:border-white/30 hover:bg-white/2"
          }`}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault();
            dragDepth.current += 1;
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            dragDepth.current -= 1;
            if (dragDepth.current <= 0) {
              setIsDragging(false);
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            dragDepth.current = 0;
            setIsDragging(false);
            if (e.dataTransfer.files.length) {
              addFiles(e.dataTransfer.files);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              // Same reason as the title inputs: this sits inside a form.
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          role="button"
          tabIndex={0}
        >
          <Upload
            aria-hidden
            className="text-white/30"
            height={20}
            width={20}
          />
          <p className="text-[11px] text-white/50 uppercase tracking-[0.18em]">
            Drop photos here
          </p>
          <p className="text-[10px] text-white/25">
            or click to browse — JPEG, PNG, WebP, AVIF, GIF
          </p>
        </div>

        <input
          accept={ACCEPTED.join(",")}
          className="hidden"
          multiple
          onChange={(e) => {
            if (e.target.files?.length) {
              addFiles(e.target.files);
            }
            e.target.value = "";
          }}
          ref={inputRef}
          type="file"
        />

        {items.length > 0 ? (
          <>
            <ul className="max-h-72 divide-y divide-white/6 overflow-y-auto">
              {items.map((item) => (
                <li className="flex items-center gap-3 py-2.5" key={item.id}>
                  <span className="w-5 shrink-0">
                    {item.status === "done" ? (
                      <Check
                        className="text-emerald-400/80"
                        height={14}
                        width={14}
                      />
                    ) : null}
                    {item.status === "error" ? (
                      <WarningTriangle
                        className="text-red-400/80"
                        height={14}
                        width={14}
                      />
                    ) : null}
                  </span>

                  <div className="min-w-0 flex-1">
                    <input
                      aria-label={`Title for ${item.file.name}`}
                      className="w-full bg-transparent text-sm text-white/85 focus:outline-none disabled:text-white/40"
                      disabled={isRunning || item.status === "done"}
                      onChange={(e) =>
                        update(item.id, { title: e.target.value })
                      }
                      onKeyDown={(e) => {
                        // This input lives inside the Add New Item form; Enter
                        // would otherwise submit that form mid-batch.
                        if (e.key === "Enter") {
                          e.preventDefault();
                        }
                      }}
                      value={item.title}
                    />
                    {item.status === "uploading" ? (
                      <div className="mt-1.5 h-px w-full bg-white/10">
                        <div
                          className="h-px bg-white/70 transition-all duration-200"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    ) : null}
                    {item.error ? (
                      <p className="mt-1 text-[10px] text-red-400/70">
                        {item.error}
                      </p>
                    ) : null}
                  </div>

                  <span className="shrink-0 font-mono text-[10px] text-white/25 tabular-nums">
                    {(item.file.size / 1024 / 1024).toFixed(1)}MB
                  </span>

                  {!isRunning && item.status !== "done" ? (
                    <button
                      aria-label={`Remove ${item.file.name}`}
                      className="shrink-0 text-white/25 transition-colors hover:text-white"
                      onClick={() =>
                        setItems((prev) => prev.filter((i) => i.id !== item.id))
                      }
                      type="button"
                    >
                      <Xmark height={13} width={13} />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                className="min-h-11 border-white/20 text-[10px] uppercase tracking-[0.18em] hover:bg-white hover:text-black"
                disabled={isRunning || pendingCount === 0 || !effectiveCategory}
                onClick={() => void start()}
                type="button"
                variant="outline"
              >
                {isRunning ? "Uploading…" : `Upload ${pendingCount}`}
              </Button>
              {doneCount > 0 ? (
                <span className="text-[10px] text-white/35 uppercase tracking-[0.16em]">
                  {doneCount} of {items.length} done
                </span>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
