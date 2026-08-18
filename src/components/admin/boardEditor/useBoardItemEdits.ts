import type React from "react";
import { toast } from "sonner";
import {
  DEFAULT_IMAGE_HEIGHT,
  DEFAULT_IMAGE_WIDTH,
} from "../../../../config/canvas.js";
import type { Box } from "../../../boards/BoardCanvas";
import { copyOfFrame } from "../../../boards/copyToBoard";
import { type DrawingConfig, isFreehand } from "../../../boards/drawing";
import { type MaskConfig, type MaskStroke, maskOf } from "../../../boards/mask";
import { newItemId } from "../../../boards/newItemId";
import { boardsApi } from "../../../services/portfolioService";
import type { BoardItem, BoardWire } from "../../../types";
import { BLANK_ITEM } from "./placement";

/**
 * Editing what is already on the board.
 *
 * Masks, drawings, dropped pictures, copying a frame elsewhere, and removing a
 * version. Lifted out of BoardEditor.tsx, which had no room left to grow.
 *
 * Two of these carry a rule that is easy to lose. A mask edit always drops
 * `maskUrl`: that is the *rendered* mask, and a stale bitmap sent with freshly
 * painted strokes repaints the wrong part of the picture — the worst failure
 * available here, because it still returns a plausible image. And removing a
 * version goes through its own endpoint, because `result` is not the canvas's
 * to write (see api/boards/[id]/version.ts).
 */
export interface BoardItemEditDeps {
  boardId: string;
  change: (next: BoardItem[]) => void;
  items: BoardItem[];
  navigate: (to: string) => void;
  setDrawTool: (tool: null) => void;
  setIsDirty: (dirty: boolean) => void;
  setItems: React.Dispatch<React.SetStateAction<BoardItem[]>>;
  wires: BoardWire[];
}

export const useBoardItemEdits = (deps: BoardItemEditDeps) => {
  const {
    boardId,
    change,
    items,
    navigate,
    setDrawTool,
    setIsDirty,
    setItems,
    wires,
  } = deps;

  /**
   * A stroke painted onto a picture with the mask brush.
   *
   * Appended to that item's config rather than kept anywhere of its own, so it
   * is saved, undone and copied by the machinery that already handles every
   * other setting. `maskUrl` is dropped on every edit: it is the *rendered*
   * mask, and a stale bitmap sent with freshly painted strokes would repaint
   * the wrong part of the picture — the worst kind of failure here, because it
   * still returns a plausible image.
   */
  const addMaskStroke = (itemId: string, stroke: MaskStroke) => {
    change(
      items.map((item) => {
        if (item.id !== itemId) {
          return item;
        }
        const config = item.config ?? {};
        const existing = maskOf(config);
        return {
          ...item,
          config: {
            ...config,
            mask: {
              invert: existing?.invert ?? false,
              strokes: [...(existing?.strokes ?? []), stroke],
            },
            maskUrl: null,
          },
        };
      })
    );
  };

  /** Replaces a picture's mask wholesale — cleared, or inverted. */
  const changeMask = (itemId: string, next: MaskConfig | null) => {
    change(
      items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              config: { ...(item.config ?? {}), mask: next, maskUrl: null },
            }
          : item
      )
    );
  };

  /**
   * A frame, and everything sitting on it, copied to a board of its own.
   *
   * Two calls rather than one: boards are created empty, so the arrangement
   * follows in the save that every board already uses. If that second call
   * fails the board still exists — empty — which is why the error says so
   * rather than claiming nothing happened.
   *
   * Nothing here touches this board. A copy that also deleted would be a move,
   * and a mis-aimed right-click would then cost work.
   */
  const copyFrameToBoard = async (frame: BoardItem, title: string) => {
    const copy = copyOfFrame(frame, items, wires);
    const toastId = toast.loading(`Creating "${title}"…`);
    try {
      const created = await boardsApi.create(title);
      await boardsApi.update(created.id, {
        items: copy.items,
        wires: copy.wires,
      });
      toast.dismiss(toastId);
      toast.success(
        `Copied ${copy.items.length} item${copy.items.length === 1 ? "" : "s"} to "${title}"`,
        {
          action: {
            label: "Open",
            onClick: () => navigate(`/admin/boards/${created.id}`),
          },
        }
      );
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(
        err instanceof Error ? err.message : "Could not copy to a new board"
      );
    }
  };

  /**
   * A result dragged off a node and dropped on the canvas.
   *
   * Nothing is uploaded and nothing is copied: the picture already lives in our
   * blob storage, so this pins the URL where it landed. The node keeps its own
   * copy in its history — pulling one out is taking a print, not moving the
   * original.
   */
  const dropImage = (
    image: { url: string },
    point: { x: number; y: number }
  ) => {
    change([
      ...items,
      {
        ...BLANK_ITEM,
        height: DEFAULT_IMAGE_HEIGHT,
        id: newItemId(),
        imageUrl: image.url,
        kind: "reference",
        thumbUrl: image.url,
        width: DEFAULT_IMAGE_WIDTH,
        x: Math.round(point.x - DEFAULT_IMAGE_WIDTH / 2),
        y: Math.round(point.y - DEFAULT_IMAGE_HEIGHT / 2),
        z: items.length + 1,
      },
    ]);
  };

  /**
   * A finished mark becomes an item.
   *
   * The tool stays selected afterwards: drawing one shape almost always means
   * drawing several, and dropping back to the pointer after every stroke would
   * make the toolbar the thing you interact with most.
   */
  const addDrawing = (config: DrawingConfig, box: Box) => {
    // A shape is usually placed once, so the pointer comes back afterwards and
    // the new shape can be moved straight away. Pen and brush stay chosen,
    // because sketching is many strokes in a row.
    if (!isFreehand(config.tool)) {
      setDrawTool(null);
    }
    change([
      ...items,
      {
        ...BLANK_ITEM,
        config: config as unknown as Record<string, unknown>,
        height: Math.round(box.height),
        id: newItemId(),
        kind: "drawing",
        width: Math.round(box.width),
        x: Math.round(box.x),
        y: Math.round(box.y),
        z: items.length + 1,
      },
    ]);
  };

  /**
   * Deletes one version of a node's output, for good.
   *
   * Through its own endpoint because `result` is not written by the board save
   * — see api/boards/[id]/version.ts. The selection lives in `config`, which
   * the canvas does own, so it is clamped here rather than there.
   */
  const removeVersion = async (itemId: string, index: number) => {
    try {
      const result = await boardsApi.deleteVersion(boardId, itemId, index);
      setItems((current) =>
        current.map((item) => {
          if (item.id !== itemId) {
            return item;
          }
          const selected = Number(item.config?.selectedVersion ?? 0);
          return {
            ...item,
            config: {
              ...item.config,
              // A version below the one removed keeps its place; the one
              // removed and anything after it shifts down.
              selectedVersion: Math.max(
                0,
                Math.min(
                  selected > index ? selected - 1 : selected,
                  (result?.history?.length ?? 1) - 1
                )
              ),
            },
            result,
          };
        })
      );
      setIsDirty(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove that");
    }
  };

  return {
    addDrawing,
    addMaskStroke,
    changeMask,
    copyFrameToBoard,
    dropImage,
    removeVersion,
  };
};
