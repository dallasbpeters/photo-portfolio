import { HugeiconsIcon } from "@hugeicons/react";
import { MagicWand01Icon } from "@hugeicons-pro/core-stroke-standard";
import { useEffect, useRef } from "react";
import type { BoardItem } from "../types";
import { frameBoardTitle } from "./copyToBoard";
import { ToolPicker } from "./ToolPicker";
import { toolContextOf } from "./tools/itemContext";
import { toolsForKind } from "./tools/registry";
import type { Tool } from "./tools/types";

/**
 * The two things the canvas menu turns itself into.
 *
 * Both replace the row list rather than opening beside it, because the menu is
 * 240px of chrome floating over a board and a second popup hanging off it would
 * be two things to dismiss. Extracted from CanvasMenu because each is a panel
 * with its own state, and the menu was heading past its size ceiling one panel
 * at a time.
 */

interface NamePanelProps {
  frame: BoardItem;
  onCancel: () => void;
  onConfirm: (frame: BoardItem, title: string) => void;
  onType: (title: string) => void;
  summary: { count: number; severed: number } | null;
  title: string;
}

/** The name a copied frame's board gets, and what the copy will contain. */
export function NamePanel({
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
      <span className="mb-1 block text-[9px] text-board-ink/35 uppercase tracking-[0.18em]">
        New board name
      </span>
      <input
        aria-label="New board name"
        className="w-full rounded border border-board-ink/15 bg-board-surface/40 px-2 py-1.5 text-[12px] text-board-ink outline-none focus:border-board-ink/45"
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
      <p className="mt-1.5 text-[10px] text-board-ink/40 leading-relaxed">
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
          className="rounded px-2 py-1 text-[11px] text-board-ink/50 hover:text-board-ink"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="rounded bg-board-ink/15 px-2.5 py-1 text-[11px] text-board-ink hover:bg-board-ink/25"
          onClick={submit}
          type="button"
        >
          Create
        </button>
      </div>
    </div>
  );
}

/**
 * Whether opening the picker on this item would show anything.
 *
 * Every kind has at least one tool by design (see `Tool.appliesTo`), so this is
 * really asking whether the item is a kind the registry knows at all — a wire
 * or a comment is not.
 */
export const hasTools = (item: BoardItem): boolean =>
  toolsForKind(item.kind).length > 0;

/** Opens the tool list for the one selected item. */
export function ToolsRow({
  className,
  onOpen,
}: {
  className: string;
  onOpen: () => void;
}) {
  return (
    <button className={className} onClick={onOpen} type="button">
      <HugeiconsIcon aria-hidden icon={MagicWand01Icon} size={14} />
      <span>Tools…</span>
    </button>
  );
}

/**
 * The picker, wearing the menu's own chrome rather than its own.
 *
 * The context comes from `toolContextOf`, which is also what the runner checks
 * before spending — so a row that is enabled here is a row that will run, and a
 * disabled one carries the sentence the runner would have refused with.
 */
export function ToolsPanel({
  item,
  onClose,
  onPick,
}: {
  item: BoardItem;
  onClose: () => void;
  onPick: (item: BoardItem, tool: Tool) => void;
}) {
  return (
    <ToolPicker
      className="w-full rounded-none border-0 bg-transparent shadow-none backdrop-blur-none"
      context={toolContextOf(item)}
      kind={item.kind}
      onClose={onClose}
      onPick={(tool) => onPick(item, tool)}
    />
  );
}
