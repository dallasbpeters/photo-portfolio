import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_IMAGE_HEIGHT,
  DEFAULT_IMAGE_WIDTH,
} from "../../../../config/canvas.js";
import { nodeTypeFor } from "../../../../config/nodeTypes.js";
import { renderHalftone } from "../../../boards/canvas/renderShaderNode";
import { renderShaderStack } from "../../../boards/canvas/renderShaderStack";
import { wiredImageFor } from "../../../boards/canvas/wiredPreviews";
import { downloadBlob } from "../../../boards/io/downloadImage";
import { newItemId } from "../../../boards/io/newItemId";
import { outputImageOf } from "../../../boards/itemOutput";
import { isShaderConfig } from "../../../boards/shaders/shaderConfig";
import { type BoardComment, commentsApi } from "../../../services/comments";
import { portfolioService } from "../../../services/portfolioService";
import type { BoardItem, BoardWire } from "../../../types";
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
  /** Places a finished picture on the board, as any other external image. */
  addExternal: (image: {
    altText: string | null;
    creditName: string | null;
    creditUrl: string | null;
    imageUrl: string;
    thumbUrl: string | null;
  }) => void;
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
  wires: BoardWire[];
}

export const useBoardItemActions = (deps: BoardItemActionDeps) => {
  const { addExternal, boardId, change, dropPoint, items, setComments, wires } =
    deps;

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

  /**
   * Renders the selected shader and puts the picture on the board.
   *
   * A shader is drawn live and has never been a file, so there is nothing to
   * copy — the stack is drawn again offscreen at export size, uploaded, and
   * placed as a picture. Landing it on the canvas rather than downloading it is
   * the point: what the shader made becomes something the rest of the graph can
   * wire out of, which is exactly the limitation config/nodeTypes.ts describes.
   */
  /**
   * The picture this item is drawing, whichever of the two kinds it is.
   *
   * A Halftone node is not a shader item and its config is not a shader stack,
   * so asking renderShaderStack for one handed back `{ layers: [] }` — an empty
   * stack, which renders nothing. Exporting a halftone produced a blank file.
   */
  const renderSelected = async (item: BoardItem): Promise<Blob> => {
    const source = wiredImageFor(item.id, { items, wires });
    if (item.nodeType === "standard") {
      return await renderHalftone(item.config ?? {}, source);
    }
    return await renderShaderStack(
      isShaderConfig(item.config) ? item.config : { layers: [] },
      source
    );
  };

  /** The same picture, saved to the machine rather than put on the board. */
  const downloadShader = async (item: BoardItem) => {
    const toastId = toast.loading("Rendering…");
    try {
      downloadBlob(
        await renderSelected(item),
        item.nodeType === "standard" ? "halftone" : "shader"
      );
      toast.dismiss(toastId);
      toast.success("Saved");
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(err instanceof Error ? err.message : "Could not render it");
    }
  };

  const exportShader = async (item: BoardItem) => {
    const toastId = toast.loading("Rendering the shader…");
    try {
      const blob = await renderSelected(item);
      const { url } = await portfolioService.uploadImageFile(
        new File([blob], "shader.png", { type: "image/png" }),
        undefined,
        "boards/shaders"
      );
      addExternal({
        altText: null,
        creditName: null,
        creditUrl: null,
        imageUrl: url,
        thumbUrl: url,
      });
      toast.dismiss(toastId);
      toast.success("Shader added to the board");
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(
        err instanceof Error ? err.message : "Could not render the shader"
      );
    }
  };

  return {
    bringToFront,
    canvaTarget,
    downloadShader,
    exportShader,
    openSendToCanva,
    resolveComment,
    sendToBack,
    sendVersions,
    setCanvaTarget,
  };
};
