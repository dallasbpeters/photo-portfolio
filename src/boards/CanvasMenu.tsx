import { HugeiconsIcon } from "@hugeicons/react";
import {
  CopyIcon,
  Download01Icon,
  FrameIcon,
} from "@hugeicons-pro/core-stroke-standard";
import { useEffect, useRef, useState } from "react";
import type { BoardItem, BoardWire } from "../types";
import { frameBoardTitle, frameSummary } from "./copyToBoard";

/**
 * What the canvas offers on a right-click.
 *
 * One menu rather than one per target, because the targets overlap: a board
 * usually has a frame spread under most of the work, so a menu that asked
 * "is there a frame here?" first could never reach the selection actions — the
 * frame always won, and grouping was unreachable on exactly the boards where
 * it was wanted.
 *
 * So both are offered together and the reader picks. Grouping comes first: it
 * acts on what you deliberately selected, while the frame is merely what
 * happens to be underneath.
 *
 * Positioned in screen pixels like PortMenu — it is chrome, so the zoom must
 * not change its size or where it sits.
 */

export interface CanvasMenuTarget {
  /** The frame under the pointer, if any. */
  frame: BoardItem | null;
  point: { x: number; y: number };
  /** What was selected when the menu opened. */
  selection: BoardItem[];
}

interface CanvasMenuProps {
  items: BoardItem[];
  menu: CanvasMenuTarget | null;
  onCopyFrame: (frame: BoardItem, title: string) => void;
  onDismiss: () => void;
  /** Downloads everything the frame holds, as one archive. */
  onExport: (itemId: string) => void;
  onGroup: (items: BoardItem[]) => void;
  wires: BoardWire[];
}

interface NamePanelProps {
  frame: BoardItem;
  onCancel: () => void;
  onConfirm: (frame: BoardItem, title: string) => void;
  onType: (title: string) => void;
  summary: { count: number; severed: number } | null;
  title: string;
}

/** The name a copied frame's board gets, and what the copy will contain. */
function NamePanel({
  frame,
  onCancel,
  onConfirm,
  onType,
  summary,
  title,
}: NamePanelProps) {
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Selected, not merely focused: the suggestion should be typed over.
    field.current?.select();
  }, []);
  const submit = () => onConfirm(frame, title.trim() || frameBoardTitle(frame));

  return (
    <div className="px-3 pt-2.5 pb-2.5">
      <span className="mb-1 block text-[9px] text-white/35 uppercase tracking-[0.18em]">
        New board name
      </span>
      <input
        aria-label="New board name"
        className="w-full rounded border border-white/15 bg-black/40 px-2 py-1.5 text-[12px] text-white outline-none focus:border-white/45"
        onChange={(e) => onType(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") {
            onCancel();
          }
        }}
        ref={field}
        value={title}
      />
      <p className="mt-1.5 text-[10px] text-white/40 leading-relaxed">
        {summary?.count === 1
          ? "The frame alone"
          : `${summary?.count ?? 0} items`}
        , copied. This board keeps its own.
        {summary && summary.severed > 0 ? (
          <span className="block text-amber-300/70">
            {summary.severed === 1
              ? "1 wire leaves the frame and will not come across."
              : `${summary.severed} wires leave the frame and will not come across.`}
          </span>
        ) : null}
      </p>
      <div className="mt-2 flex justify-end gap-1.5">
        <button
          className="rounded px-2 py-1 text-[11px] text-white/50 hover:text-white"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="rounded bg-white/15 px-2.5 py-1 text-[11px] text-white hover:bg-white/25"
          onClick={submit}
          type="button"
        >
          Create
        </button>
      </div>
    </div>
  );
}

/** How many pictures a node is holding, across every run it remembers. */
const countResults = (item: BoardItem): number => {
  const result = item.result as
    | { url?: string; variations?: unknown[] }
    | null
    | undefined;
  if (!result) {
    return 0;
  }
  if (Array.isArray(result.variations)) {
    return result.variations.filter(Boolean).length;
  }
  return result.url ? 1 : 0;
};

/** The two things a frame under the pointer can do. */
function FrameRows({
  canGroup,
  count,
  onCopy,
  onExport,
}: {
  canGroup: boolean;
  count: number;
  onCopy: () => void;
  onExport: () => void;
}) {
  return (
    <>
      <button
        className={`${rowClass} border-white/10 ${canGroup ? "border-t" : ""}`}
        onClick={onExport}
        type="button"
      >
        <HugeiconsIcon aria-hidden icon={Download01Icon} size={14} />
        <span>Download {count === 1 ? "it" : `all ${count}`}</span>
      </button>
      <button
        className={`${rowClass} border-white/10 border-t`}
        onClick={onCopy}
        type="button"
      >
        <HugeiconsIcon aria-hidden icon={CopyIcon} size={14} />
        <span>Copy frame to new board</span>
      </button>
    </>
  );
}

const rowClass =
  "flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12px] text-white/85 transition-colors hover:bg-white/10 hover:text-white";

export function CanvasMenu({
  items,
  menu,
  onCopyFrame,
  onDismiss,
  onExport,
  onGroup,
  wires,
}: CanvasMenuProps) {
  /**
   * Null until "Copy frame to new board" is chosen; then the typed name.
   *
   * Tagged with the menu it belongs to rather than reset by an effect: opening
   * a second frame's menu makes the stored name stale, and comparing is both
   * cheaper than an effect and impossible to forget.
   */
  const [naming, setNaming] = useState<{
    for: CanvasMenuTarget;
    title: string;
  } | null>(null);

  if (!menu) {
    return null;
  }

  const typed = naming?.for === menu ? naming.title : null;

  const { frame, point, selection } = menu;
  const canGroup = selection.length > 0;
  if (!(canGroup || frame)) {
    return null;
  }

  const summary = frame ? frameSummary(frame, items, wires) : null;

  // A single selected node that has produced something can hand over the whole
  // batch. More than one selected is a grouping gesture, not an export one.
  const onlyPicked = selection.length === 1 ? selection[0] : null;
  const madeCount = onlyPicked ? countResults(onlyPicked) : 0;

  return (
    <>
      <button
        aria-label="Dismiss"
        className="fixed inset-0 z-40 cursor-default"
        onClick={onDismiss}
        tabIndex={-1}
        type="button"
      />
      <div
        className="absolute z-50 w-60 overflow-hidden rounded-lg border border-white/15 bg-neutral-900/95 shadow-xl backdrop-blur"
        style={{ left: point.x + 10, top: point.y - 8 }}
      >
        {onlyPicked && madeCount > 0 && typed === null ? (
          <button
            className={rowClass}
            onClick={() => onExport(onlyPicked.id)}
            type="button"
          >
            <HugeiconsIcon aria-hidden icon={Download01Icon} size={14} />
            <span>Download {madeCount === 1 ? "it" : `all ${madeCount}`}</span>
          </button>
        ) : null}

        {canGroup && typed === null ? (
          <>
            <button
              className={rowClass}
              onClick={() => onGroup(selection)}
              type="button"
            >
              <HugeiconsIcon aria-hidden icon={FrameIcon} size={14} />
              <span>
                Group {selection.length === 1 ? "" : `${selection.length} `}
                into a frame
              </span>
            </button>
            <p className="px-3 pb-2 text-[10px] text-white/40 leading-relaxed">
              Arrange them inside, then wire the frame into a Composite node.
            </p>
          </>
        ) : null}

        {frame && typed === null ? (
          <FrameRows
            canGroup={canGroup}
            count={summary?.count ?? 0}
            onCopy={() =>
              setNaming({ for: menu, title: frameBoardTitle(frame) })
            }
            onExport={() => onExport(frame.id)}
          />
        ) : null}

        {frame && typed !== null ? (
          <NamePanel
            frame={frame}
            onCancel={onDismiss}
            onConfirm={onCopyFrame}
            onType={(title) => setNaming({ for: menu, title })}
            summary={summary}
            title={typed}
          />
        ) : null}
      </div>
    </>
  );
}
