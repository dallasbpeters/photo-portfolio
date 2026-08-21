import { useCallback, useState } from "react";
import type { BoardItem, BoardItemResult } from "../../types";
import { BoardImageEditor } from "../BoardImageEditor";

/**
 * Holding the manual editor open over a board.
 *
 * A hook rather than state in `BoardEditor` for the reason `useAffinityBridge`
 * is one: which item is being edited, and the overlay showing it, are one fact
 * and belong together. The editor is a full-screen shell, so it is returned as
 * a node to render beside the canvas rather than inside it — mounted within the
 * transformed layer it would be scaled and panned along with the board.
 *
 * The writeback is the same one Affinity uses, deliberately: a hand-made edit
 * and a round-trip through a desktop app both end as a new version on the node,
 * and the canvas should not be able to tell which happened.
 */
export function useBoardImageEditor(
  boardId: string,
  onSaved: (itemId: string, writeback: { result: BoardItemResult }) => void
) {
  const [editing, setEditing] = useState<BoardItem | null>(null);

  const close = useCallback(() => setEditing(null), []);

  const editorNode = editing ? (
    <BoardImageEditor
      boardId={boardId}
      item={editing}
      onClose={close}
      onSaved={(result) => onSaved(editing.id, { result })}
    />
  ) : null;

  return { editorNode, openEditor: setEditing };
}
