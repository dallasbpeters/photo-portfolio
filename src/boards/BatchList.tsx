import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons-pro/core-stroke-standard";
import type { BoardItem } from "../types";
import { excludedFrom } from "./itemOutput";

/**
 * The pictures a Batch node is about to hand on, listed and counted.
 *
 * Thumbnails rather than a number, because "42 images" is not checkable and a
 * contact sheet is: a batch that quietly resolved to the wrong forty looked
 * exactly like one that worked, and there was no way to tell but to run it.
 */
export function BatchList({
  images,
  item,
  onConfigChange,
  readOnly,
}: {
  images: string[];
  item: BoardItem;
  onConfigChange?: (config: Record<string, unknown>) => void;
  readOnly?: boolean;
}) {
  const config = item.config ?? {};
  const excluded = excludedFrom(config);
  const limit = Number(config.limit) > 0 ? Number(config.limit) : 0;

  const strike = (url: string) =>
    onConfigChange?.({ ...config, excluded: [...excluded, url] });
  const restore = () => onConfigChange?.({ ...config, excluded: [] });

  return (
    <div className="flex h-full w-full flex-col gap-1.5 bg-board-panel p-2.5">
      <p className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] text-board-ink/70">
        <span className="font-medium text-board-ink tabular-nums">
          {images.length}
        </span>
        <span>{images.length === 1 ? "image" : "images"}</span>
        {limit > 0 ? (
          <span className="text-amber-300/80">· first {limit} only</span>
        ) : null}
        {excluded.size > 0 ? (
          <button
            className="text-sky-300/80 underline-offset-2 hover:underline"
            onClick={restore}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            · {excluded.size} removed, restore
          </button>
        ) : null}
      </p>

      {images.length === 0 ? (
        <p className="text-[11px] text-board-ink/35 leading-relaxed">
          Wire a frame in, or images directly. Everything here is sent onward
          one at a time.
        </p>
      ) : (
        <div className="grid grow auto-rows-min grid-cols-4 gap-1 overflow-y-auto">
          {images.map((url, index) => (
            <div
              className="group/b relative aspect-square overflow-hidden rounded border border-board-ink/10 bg-board-surface/40"
              // Position is the identity: the same picture may legitimately
              // appear twice in a batch.
              // biome-ignore lint/suspicious/noArrayIndexKey: a batch entry has no identity but its place
              key={`${url}-${index}`}
            >
              <img
                alt=""
                className="h-full w-full object-cover"
                decoding="async"
                height={64}
                loading="lazy"
                src={url}
                width={64}
              />
              <span className="absolute bottom-0 left-0 bg-board-surface/70 px-1 text-[8px] text-board-ink/70 tabular-nums">
                {index + 1}
              </span>
              {readOnly ? null : (
                <button
                  aria-label={`Remove image ${index + 1} from the batch`}
                  className="absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full bg-board-surface/80 text-board-ink/70 opacity-0 transition-opacity hover:text-red-300 focus-visible:opacity-100 group-hover/b:opacity-100"
                  onClick={() => strike(url)}
                  onPointerDown={(e) => e.stopPropagation()}
                  type="button"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={9} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
