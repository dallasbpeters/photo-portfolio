import { useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_IMAGE_HEIGHT,
  DEFAULT_IMAGE_WIDTH,
} from "../../../../config/canvas.js";
import { isSvgFile, svgToPng } from "../../../boards/drawing/svgToRaster";
import { newItemId } from "../../../boards/newItemId";
import { portfolioService } from "../../../services/portfolioService";
import type { BoardItem } from "../../../types";
import { BLANK_ITEM, DROP_FAN } from "./placement";

/**
 * Files arriving on the board, and the one question an SVG raises.
 *
 * Lifted out of BoardEditor.tsx, which had no room left to grow. These four
 * belong together because they are one path with a fork in it: a drop either
 * uploads straight away or stops to ask whether a vector should stay a vector,
 * and both ends have to land the picture identically.
 *
 * Pinning a picture to a board is deliberately not publishing it. A photograph
 * reaches the site only through a `photos` row, which nothing here writes.
 */
export interface BoardUploadDeps {
  /** Replaces the whole item list, recording a history step. */
  change: (next: BoardItem[]) => void;
  items: BoardItem[];
}

export const useBoardUploads = (deps: BoardUploadDeps) => {
  const { change, items } = deps;

  /**
   * Images dragged onto the board: working material, pinned to the board and
   * nothing else. Publishing is a separate act — a photograph reaches the site
   * only through a `photos` row, which this deliberately never writes.
   */
  /** Uploads prepared files and places them. Shared by the immediate path
   * (non-SVG drops) and the SVG chooser, so both land the same. */
  const placeUploaded = async (
    files: File[],
    point: { x: number; y: number }
  ) => {
    if (files.length === 0) {
      return;
    }
    const toastId = toast.loading(
      files.length === 1 ? "Uploading image…" : `Uploading ${files.length}…`
    );
    // Transferred together rather than one after another: the bytes go straight
    // to blob storage and never touch a function, so several at once is the
    // normal case and a queue would only make a folder of images slower.
    const results = await Promise.allSettled(
      files.map((file) =>
        portfolioService.uploadImageFile(file, undefined, "boards/uploads")
      )
    );

    const added: BoardItem[] = [];
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const reason: unknown = result.reason;
        toast.error(
          reason instanceof Error
            ? reason.message
            : `Could not upload ${files[index]?.name ?? "image"}`
        );
        return;
      }
      const { url } = result.value;
      added.push({
        ...BLANK_ITEM,
        height: DEFAULT_IMAGE_HEIGHT,
        id: newItemId(),
        imageUrl: url,
        kind: "reference",
        thumbUrl: url,
        width: DEFAULT_IMAGE_WIDTH,
        // Fanned out from the drop so several files do not land in a stack.
        x: Math.round(point.x - DEFAULT_IMAGE_WIDTH / 2 + index * DROP_FAN),
        y: Math.round(point.y - DEFAULT_IMAGE_HEIGHT / 2 + index * DROP_FAN),
        z: items.length + index + 1,
      });
    });

    toast.dismiss(toastId);
    if (added.length > 0) {
      change([...items, ...added]);
      toast.success(
        added.length === 1 ? "Image added" : `${added.length} images added`
      );
    }
  };

  /** An SVG waiting for the user to say whether to keep it vector. */
  const [pendingSvg, setPendingSvg] = useState<{
    files: File[];
    point: { x: number; y: number };
  } | null>(null);

  const dropFiles = async (files: File[], point: { x: number; y: number }) => {
    // An SVG gets a say — vector or raster is the dragger's call, not ours.
    // Everything else goes straight in.
    const svgs = files.filter(isSvgFile);
    const rest = files.filter((file) => !isSvgFile(file));
    if (svgs.length > 0) {
      setPendingSvg({ files: svgs, point });
    }
    await placeUploaded(rest, point);
  };

  /** Applies the SVG drop choice, then uploads the resulting files. */
  const importSvg = async (keepSvg: boolean) => {
    if (!pendingSvg) {
      return;
    }
    const { files, point } = pendingSvg;
    setPendingSvg(null);
    const prepared = keepSvg
      ? files
      : await Promise.all(files.map((file) => svgToPng(file)));
    await placeUploaded(prepared, point);
  };

  return { dropFiles, importSvg, pendingSvg, placeUploaded, setPendingSvg };
};
