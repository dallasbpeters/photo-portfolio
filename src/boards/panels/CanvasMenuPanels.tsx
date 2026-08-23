import { HugeiconsIcon } from "@hugeicons/react";
import {
  Album02Icon,
  MagicWand01Icon,
} from "@hugeicons-pro/core-stroke-standard";
import { useEffect, useRef } from "react";
import type { BoardItem } from "../../types";
import { frameBoardTitle } from "../io/copyToBoard";
import { toolContextOf } from "../tools/itemContext";
import { toolsForKind } from "../tools/registry";
import type { Tool } from "../tools/types";
import { ToolPicker } from "./ToolPicker";
import "../boardChrome.css";

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
    <div className="panel-section">
      <span className="panel-label">New board name</span>
      <input
        aria-label="New board name"
        className="panel-field"
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
      <p className="panel-hint">
        {summary?.count === 1
          ? "The frame alone"
          : `${summary?.count ?? 0} items`}
        , copied. This board keeps its own.
        {summary && summary.severed > 0 ? (
          <span className="panel-warning">
            {summary.severed === 1
              ? "1 wire leaves the frame and will not come across."
              : `${summary.severed} wires leave the frame and will not come across.`}
          </span>
        ) : null}
      </p>
      <div className="panel-actions">
        <button className="panel-button" onClick={onCancel} type="button">
          Cancel
        </button>
        <button
          className="panel-button panel-button--tinted"
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

/**
 * Opens the collection panel for the selection's pictures.
 *
 * Beside "save as an element", because both keep something — but an element is a
 * style distilled from pictures, where a collection is the pictures themselves,
 * kept as material for a page. Two rows rather than one with a choice, since the
 * two answers are not versions of each other.
 */
export function CollectionRow({
  className,
  count,
  onOpen,
}: {
  className: string;
  count: number;
  onOpen: () => void;
}) {
  return (
    <button className={className} onClick={onOpen} type="button">
      <HugeiconsIcon aria-hidden icon={Album02Icon} size={14} />
      <span>Save {count === 1 ? "it" : String(count)} to a collection</span>
    </button>
  );
}

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
      className="tool-picker--embedded"
      context={toolContextOf(item)}
      kind={item.kind}
      onClose={onClose}
      onPick={(tool) => onPick(item, tool)}
    />
  );
}
