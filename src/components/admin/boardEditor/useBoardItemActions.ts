import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_IMAGE_HEIGHT,
  DEFAULT_IMAGE_WIDTH,
} from "../../../../config/canvas.js";
import { nodeTypeFor } from "../../../../config/nodeTypes.js";
import { outputImageOf } from "../../../boards/itemOutput";
import { newItemId } from "../../../boards/newItemId";
import { type BoardComment, commentsApi } from "../../../services/comments";
import type { BoardItem } from "../../../types";
import { BLANK_ITEM } from "./placement";

/**
 * Acting on one item: stacking, sending it somewhere, clearing a comment.
 *
 * Lifted out of BoardEditor.tsx, which had no room left to grow. These share a
 * shape rather than a subject — each takes an id, does one thing, and says so —
 * which is exactly the kind of code that disappears when it is buried in a
 * two-thousand-line component.
 */
export interface BoardItemActionDeps {
  boardId: string;
  change: (next: BoardItem[]) => void;
  /** Somewhere free for a new item, near where you are looking. */
  dropPoint: (
    list: BoardItem[],
    width: number,
    height: number
  ) => { x: number; y: number };
  items: BoardItem[];
  setComments: React.Dispatch<React.SetStateAction<BoardComment[]>>;
}

export const useBoardItemActions = (deps: BoardItemActionDeps) => {
  const { boardId, change, dropPoint, items, setComments } = deps;

  /**
   * Moves one item to the very top of the stack.
   *
   * The canvas already raises whatever you grab; this is the explicit, reliable
   * version — the layers panel's drag is the same thing made reorderable, and a
   * right-click gives it a target that cannot miss.
   */
  const bringToFront = (itemId: string) => {
    const highest = items.reduce((max, item) => Math.max(max, item.z), 0);
    change(
      items.map((item) =>
        item.id === itemId ? { ...item, z: highest + 1 } : item
      )
    );
  };

  /** Moves one item to the very bottom of the stack, above the frames. */
  const sendToBack = (itemId: string) => {
    const lowest = items.reduce((min, item) => Math.min(min, item.z), 0);
    change(
      items.map((item) =>
        item.id === itemId ? { ...item, z: lowest - 1 } : item
      )
    );
  };

  /** The image being sent to Canva, or null while the modal is closed. */
  const [canvaTarget, setCanvaTarget] = useState<{
    imageUrl: string;
    name: string;
  } | null>(null);

  const openSendToCanva = (item: BoardItem) => {
    const url = outputImageOf(item, items);
    if (!url) {
      toast.error("That item has no picture to send");
      return;
    }
    const label =
      item.kind === "op" ? (nodeTypeFor(item.nodeType)?.label ?? null) : null;
    setCanvaTarget({
      imageUrl: url,
      name: label ?? "Board image",
    });
  };

  const resolveComment = async (commentId: string, resolved: boolean) => {
    try {
      const updated = await commentsApi.resolve(boardId, commentId, resolved);
      setComments((current) =>
        current.map((comment) => (comment.id === commentId ? updated : comment))
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update the comment"
      );
    }
  };

  /**
   * Puts every version a node has made onto the board as its own image.
   *
   * A node's gallery is for comparing; once you have compared, the usual next
   * move is to get them out where they can be arranged and drawn on.
   */
  const sendVersions = (itemId: string) => {
    const node = items.find((item) => item.id === itemId);
    const versions = node?.result?.history ?? [];
    if (versions.length === 0) {
      return;
    }
    const origin = dropPoint(items, DEFAULT_IMAGE_WIDTH, DEFAULT_IMAGE_HEIGHT);
    change([
      ...items,
      ...versions.map((image, index) => ({
        ...BLANK_ITEM,
        height: DEFAULT_IMAGE_HEIGHT,
        id: newItemId(),
        imageUrl: image.url,
        kind: "reference" as const,
        thumbUrl: image.url,
        width: DEFAULT_IMAGE_WIDTH,
        // Laid out in a row so a set arrives comparable rather than stacked.
        x: Math.round(origin.x + index * (DEFAULT_IMAGE_WIDTH + 24)),
        y: origin.y,
        z: items.length + index + 1,
      })),
    ]);
    toast.success(
      versions.length === 1
        ? "1 image added"
        : `${versions.length} images added`
    );
  };

  return {
    bringToFront,
    canvaTarget,
    openSendToCanva,
    resolveComment,
    sendToBack,
    sendVersions,
    setCanvaTarget,
  };
};
