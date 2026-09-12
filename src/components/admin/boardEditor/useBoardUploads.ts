import { useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_IMAGE_HEIGHT,
  DEFAULT_IMAGE_WIDTH,
} from "../../../../config/canvas.js";
import { isSvgFile, svgToPng } from "../../../boards/drawing/svgToRaster";
import { newItemId } from "../../../boards/io/newItemId";
import { isPsdFile, psdToPng } from "../../../boards/io/psdPreview";
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

  /**
   * Photoshop files: the picture the board shows, and the document behind it.
   *
   * Both are uploaded. The PNG is what every other part of the app already
   * knows how to show, wire and export; the PSD is the file somebody actually
   * works in, and it is remembered on the item so it can be opened later
   * rather than re-found by hand.
   *
   * One at a time, unlike the plain upload path. Reading a PSD means holding
   * the file, its composite and a canvas in memory at once, and doing four of
   * those together is how a tab runs out of room — where four ordinary images
   * are only four transfers.
   */
  const placePsds = async (files: File[], point: { x: number; y: number }) => {
    const toastId = toast.loading(
      files.length === 1
        ? "Reading Photoshop file…"
        : `Reading ${files.length} Photoshop files…`
    );
    const added: BoardItem[] = [];
    for (const [index, file] of files.entries()) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: sequential on purpose — see above
        const preview = await psdToPng(file);
        const [shown, source] = await Promise.all([
          portfolioService.uploadImageFile(
            preview,
            undefined,
            "boards/uploads"
          ),
          portfolioService.uploadImageFile(file, undefined, "boards/uploads"),
        ]);
        added.push({
          ...BLANK_ITEM,
          body: file.name,
          /*
           * Where the document lives, kept on the item.
           *
           * `config` is an op node's field by convention, but it is stored and
           * returned for every kind — see boardDto — and this is exactly the
           * thing it is for: something the board must remember that has no
           * column of its own. The editor link reads it.
           */
          config: { sourceKind: "psd", sourceUrl: source.url },
          height: DEFAULT_IMAGE_HEIGHT,
          id: newItemId(),
          imageUrl: shown.url,
          kind: "reference",
          thumbUrl: shown.url,
          width: DEFAULT_IMAGE_WIDTH,
          x: Math.round(point.x - DEFAULT_IMAGE_WIDTH / 2 + index * DROP_FAN),
          y: Math.round(point.y - DEFAULT_IMAGE_HEIGHT / 2 + index * DROP_FAN),
          z: items.length + index + 1,
        });
      } catch (err) {
        // Named, because every reason this fails is one the dropper can act on:
        // too large, unreadable, or saved without a flattened preview.
        toast.error(
          err instanceof Error ? err.message : `Could not read ${file.name}`
        );
      }
    }
    toast.dismiss(toastId);
    if (added.length > 0) {
      change([...items, ...added]);
      toast.success(
        added.length === 1
          ? "Photoshop file added"
          : `${added.length} Photoshop files added`
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
    // A PSD gets no say: nothing can draw one, so it is flattened or it is
    // nothing. Everything else goes straight in.
    const svgs = files.filter(isSvgFile);
    const psds = files.filter(isPsdFile);
    const rest = files.filter((file) => !(isSvgFile(file) || isPsdFile(file)));
    if (svgs.length > 0) {
      setPendingSvg({ files: svgs, point });
    }
    await Promise.all([
      placeUploaded(rest, point),
      psds.length > 0 ? placePsds(psds, point) : Promise.resolve(),
    ]);
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
