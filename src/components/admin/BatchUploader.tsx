import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  Cancel01Icon,
  Tick02Icon,
  Upload01Icon,
} from "@hugeicons-pro/core-stroke-standard";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { pickDriveImages } from "../../boards/googleDrive";
import {
  extractPhotoMetadata,
  type PhotoMetadata,
} from "../../lib/photoMetadata";
import posthog from "../../lib/posthog";
import { portfolioService } from "../../services/portfolioService";
import type { Category } from "../../types";
import { Button } from "../ui/button";
import { CardHeader } from "../ui/card";
import { GoogleDrive } from "./GoogleDriveLogo";

const FILE_EXTENSION = /\.[^.]+$/;
const SEPARATORS = /[_-]+/g;
const WHITESPACE_RUN = /\s+/g;

const ACCEPTED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

const CONCURRENCY = 3;

interface Item {
  error?: string;
  file: File;
  id: string;
  meta?: PhotoMetadata;
  previewUrl: string;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  title: string;
}

const titleFromFile = (name: string): string =>
  name
    .replace(FILE_EXTENSION, "")
    .replace(SEPARATORS, " ")
    .replace(WHITESPACE_RUN, " ")
    .trim()
    .slice(0, 120) || "Untitled";

interface Uploaded {
  meta: PhotoMetadata;
  url: string;
}

const transferAll = async (
  pending: Item[],
  transfer: (item: Item) => Promise<Uploaded | null>
): Promise<Map<string, Uploaded>> => {
  const uploaded = new Map<string, Uploaded>();
  let cursor = 0;
  const worker = async () => {
    while (cursor < pending.length) {
      const item = pending[cursor];
      cursor += 1;
      if (!item) {
        break;
      }
      // biome-ignore lint/performance/noAwaitInLoops: each worker processes items sequentially; concurrency comes from multiple workers
      const result = await transfer(item);
      if (result) {
        uploaded.set(item.id, result);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker)
  );
  return uploaded;
};

const createRows = async (
  pending: Item[],
  uploaded: Map<string, Uploaded>,
  categoryId: string,
  update: (id: string, patch: Partial<Item>) => void
): Promise<number> => {
  let succeeded = 0;
  for (let i = pending.length - 1; i >= 0; i -= 1) {
    const item = pending[i];
    const result = item && uploaded.get(item.id);
    if (!(item && result)) {
      continue;
    }
    try {
      // biome-ignore lint/performance/noAwaitInLoops: rows are created sequentially to preserve gallery order
      await portfolioService.addPhoto({
        categoryId,
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
  return succeeded;
};

interface BatchUploaderProps {
  categories: Category[];
  categoryId: string;
  reload: () => Promise<void>;
}

export function BatchUploader({
  categories,
  reload,
  categoryId,
}: BatchUploaderProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isPickingDrive, setIsPickingDrive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const effectiveCategory = categoryId || categories[0]?.id || "";

  useEffect(
    () => () => {
      for (const item of items) {
        URL.revokeObjectURL(item.previewUrl);
      }
    },
    [items]
  );

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
        previewUrl: URL.createObjectURL(file),
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

  const pickFromDrive = async () => {
    setIsPickingDrive(true);
    try {
      const files = await pickDriveImages();
      if (files.length > 0) {
        addFiles(files);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not open Google Drive"
      );
    } finally {
      setIsPickingDrive(false);
    }
  };

  const update = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const removeItem = (id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return prev.filter((i) => i.id !== id);
    });
  };

  const transfer = async (
    item: Item
  ): Promise<{ url: string; meta: PhotoMetadata } | null> => {
    update(item.id, { progress: 0, status: "uploading" });
    try {
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

    const uploaded = await transferAll(pending, transfer);
    const succeeded = await createRows(
      pending,
      uploaded,
      effectiveCategory,
      update
    );

    setIsRunning(false);
    await reload();

    // Drop what actually landed. A finished upload is a row in the library now,
    // so leaving it queued here only makes the next batch harder to read — and
    // re-running would silently re-upload it. Failures stay put, which is what
    // the toast below promises.
    //
    // Revoking on the way out matters: every accepted file holds an object URL
    // for its preview, and this panel survives many batches without remounting,
    // so without this the blobs accumulate for the life of the admin session.
    setItems((prev) => {
      const remaining: Item[] = [];
      for (const item of prev) {
        if (item.status === "done") {
          URL.revokeObjectURL(item.previewUrl);
        } else {
          remaining.push(item);
        }
      }
      return remaining;
    });

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
        <Button
          disabled={isPickingDrive}
          onClick={() => void pickFromDrive()}
          type="button"
          variant="outline"
        >
          <GoogleDrive {...{ height: 16, width: 16 }} />
          {isPickingDrive ? "Waiting for Google…" : "Upload from Google"}
        </Button>
        {items.length > 0 ? (
          <button
            className="text-[10px] text-white/90 uppercase tracking-[0.18em] transition-colors hover:text-white disabled:opacity-30"
            disabled={isRunning}
            onClick={() => {
              for (const item of items) {
                URL.revokeObjectURL(item.previewUrl);
              }
              setItems([]);
            }}
            type="button"
          >
            Clear
          </button>
        ) : null}
      </CardHeader>

      <div className="space-y-5">
        <button
          className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 border border-dashed py-10 transition-colors ${
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
          type="button"
        >
          <HugeiconsIcon
            aria-hidden
            className="text-white/90"
            icon={Upload01Icon}
            size={20}
          />
          <p className="text-[11px] text-white/90 uppercase tracking-[0.18em]">
            Drop photos here
          </p>
          <p className="text-[10px] text-white/80">
            or click to browse — JPEG, PNG, WebP, AVIF, GIF
          </p>
        </button>

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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {items.map((item) => (
                <div
                  className="group relative aspect-square overflow-hidden rounded-lg bg-white/5"
                  key={item.id}
                >
                  <img
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    height={200}
                    src={item.previewUrl}
                    width={200}
                  />

                  {item.status === "uploading" && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
                      <div className="h-px w-3/4 bg-white/10">
                        <div
                          className="h-px bg-white/70 transition-all duration-200"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="absolute right-0 bottom-0 left-0 z-10 bg-linear-to-t from-black/95 via-black/60 to-transparent p-2">
                    <input
                      aria-label={`Title for ${item.file.name}`}
                      className="w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none disabled:text-white/90"
                      disabled={isRunning}
                      onChange={(e) =>
                        update(item.id, { title: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                        }
                      }}
                      placeholder="Title"
                      value={item.title}
                    />
                  </div>

                  <button
                    aria-label={`Remove ${item.file.name}`}
                    className="absolute top-1 right-1 z-20 flex size-8 items-center justify-center rounded-full bg-black/60 text-white/80 opacity-0 transition-opacity hover:bg-black/80 hover:text-white group-hover:opacity-100"
                    disabled={isRunning || item.status === "done"}
                    onClick={() => removeItem(item.id)}
                    type="button"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={14} />
                  </button>

                  <div className="absolute top-1 left-1 z-20 flex items-center gap-1">
                    {item.status === "done" && (
                      <HugeiconsIcon
                        className="text-emerald-400/90 drop-shadow"
                        icon={Tick02Icon}
                        size={14}
                      />
                    )}
                    {item.status === "error" && (
                      <HugeiconsIcon
                        className="text-red-400/90 drop-shadow"
                        icon={Alert02Icon}
                        size={14}
                      />
                    )}
                  </div>

                  {item.error ? (
                    <div className="absolute right-2 bottom-6 left-2 z-10 truncate whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[9px] text-red-300/90">
                      {item.error}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                disabled={isRunning || pendingCount === 0 || !effectiveCategory}
                onClick={() => void start()}
                type="button"
                variant="outline"
              >
                {isRunning ? "Uploading…" : `Upload ${pendingCount}`}
              </Button>
              {doneCount > 0 ? (
                <span className="text-[10px] text-white/90 uppercase tracking-[0.16em]">
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
