import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { BrandKitDoc, LogoEntry } from "../../../config/brandKit.js";
import { boardsApi, portfolioService } from "../../services/portfolioService";
import { drawProofSheet, proofBoardTitle, proofItems } from "./buildProofBoard";

/**
 * Making a proof board, from a logo in the kit panel.
 *
 * Two calls rather than one, the same shape copyFrameToBoard uses: boards are
 * created empty and the arrangement follows in the save every board already
 * does. If the second fails the board still exists, empty, which is why the
 * error says so rather than claiming nothing happened.
 *
 * A new board every time, never an update in place. Kits are versioned and a
 * version is never rewritten, so the sheet should behave the same way — a
 * sheet made in March keeps showing March's mark, and the before-and-after is
 * half the value the first time somebody changes a logo.
 */

/** The artwork, loaded so a canvas can draw it. */
const loadMark = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    /*
     * Deliberately asking for CORS here, unlike measureRaster.
     *
     * The opposite call, for the opposite reason: this one *does* read pixels
     * — every tile draws the mark into a canvas and reads it back — and a
     * tainted canvas makes toBlob throw. The blob store serves
     * Access-Control-Allow-Origin, and a logo adopted into it before the kit
     * version was written is the only kind that gets here.
     */
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("That logo could not be loaded to draw from"));
    image.src = url;
  });

export const useProofBoard = () => {
  const navigate = useNavigate();

  const makeProofBoard = async (
    kit: { doc: BrandKitDoc; name: string; version: number | null },
    logo: LogoEntry
  ) => {
    const title = proofBoardTitle(kit.name, logo.label, kit.version);
    const toastId = toast.loading("Drawing the proof sheet…");
    try {
      const mark = await loadMark(logo.url);
      const sheet = await drawProofSheet(mark, kit.doc, logo, kit.name);

      toast.loading(`Uploading ${sheet.length} tiles…`, { id: toastId });
      // Together: the bytes go straight to blob storage without touching a
      // function, so fifteen at once is the ordinary case rather than a queue.
      const uploaded = await Promise.all(
        sheet.map(async (tile) => {
          const file = new File([tile.blob], `${tile.label}.png`, {
            type: "image/png",
          });
          const { url } = await portfolioService.uploadImageFile(
            file,
            undefined,
            "boards/proof"
          );
          return { caption: tile.caption, label: tile.label, url };
        })
      );

      const created = await boardsApi.create(title);
      await boardsApi.update(created.id, {
        items: proofItems(uploaded),
        wires: [],
      });

      toast.dismiss(toastId);
      toast.success(`${uploaded.length} tiles on "${title}"`, {
        action: {
          label: "Open",
          onClick: () => navigate(`/admin/boards/${created.id}`),
        },
      });
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(
        err instanceof Error ? err.message : "Could not make a proof board"
      );
    }
  };

  /**
   * The handler for one kit, or nothing when there is nothing to name.
   *
   * The rule lives here rather than at the button: a sheet is titled after the
   * kit version it was drawn against, so a kit with no saved version has no
   * sheet to make — and the panel should not have to know that to decide
   * whether to show a button.
   */
  const proofHandlerFor = (kit: {
    name: string;
    resolvedDoc: BrandKitDoc;
    version: number | null;
    versionId: string | null;
  }): ((logo: LogoEntry) => void) | undefined =>
    kit.versionId
      ? (logo) =>
          void makeProofBoard(
            { doc: kit.resolvedDoc, name: kit.name, version: kit.version },
            logo
          )
      : undefined;

  return { makeProofBoard, proofHandlerFor };
};
