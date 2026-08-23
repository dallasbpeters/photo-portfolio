import { SendToCanvaModal } from "./SendToCanvaModal";
import { SvgImportDialog } from "./SvgImportDialog";

/**
 * The two dialogs that interrupt getting something out of, or into, the board.
 *
 * Split out of BoardEditor, which sat four lines under the 500-line ceiling and
 * so had no room for anything — the file-size rule doing exactly its job. These
 * two are the natural pair to leave: both are modal, both are about moving a
 * picture across a boundary, and neither touches the canvas, the graph or the
 * run loop that the rest of that file is about.
 */

export interface BoardEditorDialogsProps {
  /** The image being sent to Canva, or null when nothing is being sent. */
  canvaTarget: { imageUrl: string; name: string } | null;
  onCloseCanva: () => void;
  onDismissSvg: () => void;
  /** True keeps the vector; false rasterises on the way in. */
  onImportSvg: (keepSvg: boolean) => Promise<void> | void;
  /** The dropped SVGs awaiting a decision. */
  pendingSvg: { files: unknown[] } | null;
}

export function BoardEditorDialogs({
  canvaTarget,
  onCloseCanva,
  onDismissSvg,
  onImportSvg,
  pendingSvg,
}: BoardEditorDialogsProps) {
  return (
    <>
      {canvaTarget ? (
        <SendToCanvaModal
          imageUrl={canvaTarget.imageUrl}
          name={canvaTarget.name}
          onClose={onCloseCanva}
        />
      ) : null}

      {pendingSvg ? (
        <SvgImportDialog
          count={pendingSvg.files.length}
          onCancel={onDismissSvg}
          onConvertPng={() => void onImportSvg(false)}
          onKeepSvg={() => void onImportSvg(true)}
        />
      ) : null}
    </>
  );
}
