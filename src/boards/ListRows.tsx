import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Delete02Icon } from "@hugeicons-pro/core-stroke-standard";
import {
  addItem,
  joinItems,
  MAX_LIST_ITEMS,
  moveItem,
  parseItems,
  removeItem,
  replaceItem,
} from "./listItems";

/**
 * The rows of a List node: one prompt each, editable and removable.
 *
 * An Iterate node computes its prompts from a template on every read, which is
 * right for writing fifty variations and wrong the moment three of them are not
 * what you wanted — the only edit available is to the rule that produced all
 * fifty. These are the prompts themselves, so a bad one is fixed or deleted
 * where it is.
 *
 * The count is on the node rather than left to be discovered, because what this
 * feeds is where the money goes: fifty rows is fifty paid runs, and the length
 * of the list is the most useful thing about it before pressing Run.
 */

export interface ListRowsProps {
  onChange: (items: string) => void;
  readOnly?: boolean;
  /** The stored value — one row per line. */
  value: unknown;
}

export function ListRows({ onChange, readOnly, value }: ListRowsProps) {
  const items = parseItems(value);
  const put = (next: string[]) => onChange(joinItems(next));

  return (
    <div className="flex min-h-0 flex-col gap-1">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[9px] text-board-ink/35 uppercase tracking-[0.18em]">
          {items.length === 1 ? "1 item" : `${items.length} items`}
        </span>
        {readOnly ? null : (
          <button
            aria-label="Add an item"
            className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-board-ink/55 uppercase tracking-[0.14em] hover:text-board-ink disabled:opacity-30"
            disabled={items.length >= MAX_LIST_ITEMS}
            onClick={() => put(addItem(items, "New item"))}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            <HugeiconsIcon icon={Add01Icon} size={12} />
            Add
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="px-1 py-2 text-[10px] text-board-ink/35">
          Empty. Wire something in and use Fill, or add a row.
        </p>
      ) : null}

      <div className="flex min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain">
        {items.map((item, index) => (
          <div
            className="group/row flex items-start gap-1 rounded border border-board-ink/10 bg-board-surface/40 px-1.5 py-1"
            // Position is the identity of a row here. Two rows may legitimately
            // hold the same text, and keying by content would make them the
            // same row — the failure this rule exists to prevent, arrived at
            // from the other direction.
            // biome-ignore lint/suspicious/noArrayIndexKey: explained above
            key={index}
          >
            <span className="w-5 shrink-0 pt-1 text-[9px] text-board-ink/30 tabular-nums">
              {index + 1}
            </span>
            <textarea
              className="min-h-6 flex-1 resize-y bg-transparent text-[11px] text-board-ink outline-none"
              onChange={(e) => put(replaceItem(items, index, e.target.value))}
              onPointerDown={(e) => e.stopPropagation()}
              readOnly={readOnly}
              rows={1}
              value={item}
            />
            {readOnly ? null : (
              <span className="flex shrink-0 flex-col opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
                <button
                  aria-label={`Move item ${index + 1} up`}
                  className="px-0.5 text-[9px] text-board-ink/40 hover:text-board-ink disabled:opacity-20"
                  disabled={index === 0}
                  onClick={() => put(moveItem(items, index, -1))}
                  onPointerDown={(e) => e.stopPropagation()}
                  type="button"
                >
                  ▲
                </button>
                <button
                  aria-label={`Move item ${index + 1} down`}
                  className="px-0.5 text-[9px] text-board-ink/40 hover:text-board-ink disabled:opacity-20"
                  disabled={index === items.length - 1}
                  onClick={() => put(moveItem(items, index, 1))}
                  onPointerDown={(e) => e.stopPropagation()}
                  type="button"
                >
                  ▼
                </button>
              </span>
            )}
            {readOnly ? null : (
              <button
                aria-label={`Delete item ${index + 1}`}
                className="shrink-0 pt-1 text-board-ink/30 opacity-0 transition-opacity hover:text-red-400 focus-visible:opacity-100 group-hover/row:opacity-100"
                onClick={() => put(removeItem(items, index))}
                onPointerDown={(e) => e.stopPropagation()}
                type="button"
              >
                <HugeiconsIcon icon={Delete02Icon} size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
