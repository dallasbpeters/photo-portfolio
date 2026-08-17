import { toast } from "sonner";
import { PhotoEditorShell } from "../editor/ui/PhotoEditorShell";
import { boardsApi, portfolioService } from "../services/portfolioService";
import type { BoardItem, BoardItemResult } from "../types";
import { imageOf } from "./tools/itemContext";

/**
 * The photo editor, opened on a board item.
 *
 * A sibling of `src/components/PhotoEditor.tsx`, which does the same job for the
 * portfolio. The editor itself knows nothing about either: `PhotoEditorShell`
 * takes an address and hands back a graded blob, and the adapter decides where
 * that blob goes. Two adapters rather than one with a branch, because the two
 * destinations have nothing in common — a photo record gets a new `url`, a board
 * item gets a new version in its history.
 *
 * The manual counterpart to the AI tools. Rotate and Restyle describe what they
 * want and let a model do it; this is for the times when the answer is a curve
 * and a crop, and no description of it would be shorter than doing it.
 */

interface BoardImageEditorProps {
  boardId: string;
  item: BoardItem;
  onClose: () => void;
  /** The saved version, so the canvas can show it without a reload. */
  onSaved: (result: BoardItemResult) => void;
}

export function BoardImageEditor({
  boardId,
  item,
  onClose,
  onSaved,
}: BoardImageEditorProps) {
  // The newest version, not the original: opening the editor on an item a tool
  // has already changed should start from what is on screen. Same precedence
  // `ItemMedia` renders with and the executors read from.
  const source = imageOf(item);

  const save = async (blob: Blob, extension: string): Promise<void> => {
    const toastId = toast.loading("Saving the edit…");
    try {
      const file = new File([blob], `${item.id}.${extension}`, {
        type: blob.type,
      });
      const { url } = await portfolioService.uploadImageFile(file);
      // Through the result endpoint, not the board save: a board save never
      // writes `result` — it replaces the whole arrangement on a debounce, so
      // one in flight would put the pre-edit copy back. See
      // api/boards/[id]/result.ts.
      const { result } = await boardsApi.saveToolResult(boardId, item.id, {
        url,
      });
      toast.success("Saved", { id: toastId });
      onSaved(result);
      onClose();
    } catch (error) {
      // Rethrown as well as reported: the shell keeps itself open on a rejection,
      // which is what should happen — the grade is still in the editor, and
      // closing would throw the work away to show an error about losing it.
      toast.error(
        error instanceof Error ? error.message : "Could not save the edit",
        { id: toastId }
      );
      throw error;
    }
  };

  if (!source) {
    return null;
  }

  return (
    <PhotoEditorShell
      imageUrl={source}
      onClose={onClose}
      onSave={save}
      title={item.body?.trim() || "Board image"}
    />
  );
}
