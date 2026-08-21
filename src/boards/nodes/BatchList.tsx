import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons-pro/core-stroke-standard";
import type { BoardItem } from "../../types";
import { excludedFrom } from "../itemOutput";
import "./BatchList.css";

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
    <div className="batch-list">
      <p className="batch-list__summary">
        <span className="batch-list__count">{images.length}</span>
        <span>{images.length === 1 ? "image" : "images"}</span>
        {limit > 0 ? (
          <span className="batch-list__limit">· first {limit} only</span>
        ) : null}
        {excluded.size > 0 ? (
          <button
            className="batch-list__restore"
            onClick={restore}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            · {excluded.size} removed, restore
          </button>
        ) : null}
      </p>

      {images.length === 0 ? (
        <p className="batch-list__empty">
          Wire a frame in, or images directly. Everything here is sent onward
          one at a time.
        </p>
      ) : (
        <div className="batch-list__sheet">
          {images.map((url, index) => (
            <div
              className="batch-list__frame"
              // Position is the identity: the same picture may legitimately
              // appear twice in a batch.
              // biome-ignore lint/suspicious/noArrayIndexKey: a batch entry has no identity but its place
              key={`${url}-${index}`}
            >
              <img
                alt=""
                className="batch-list__thumb"
                decoding="async"
                height={64}
                loading="lazy"
                src={url}
                width={64}
              />
              <span className="batch-list__index">{index + 1}</span>
              {readOnly ? null : (
                <button
                  aria-label={`Remove image ${index + 1} from the batch`}
                  className="batch-list__strike"
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
