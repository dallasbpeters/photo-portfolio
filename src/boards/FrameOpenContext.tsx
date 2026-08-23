import { createContext, type ReactNode, useContext } from "react";

/**
 * How a frame on a published board learns that it can be opened.
 *
 * A context rather than a prop, and the reason is the shape of what is being
 * asked. The frame's title is the only part of it that takes a pointer, which
 * puts the handle six levels down — page, canvas, item view, item content, frame
 * body — and neither the canvas nor the item view has any opinion about what
 * opening a frame *means*. Threading a callback through them would have made two
 * of the largest files in the project grow to carry something they do not use.
 *
 * Absent by default, which is the editor. A frame is only openable where
 * somebody has provided this, so the editor keeps its editable name field and
 * the published page gets a button, with no flag saying which is which.
 */

/** Opens the frame with this id, or null where frames do not open. */
type OpenFrame = ((frameId: string) => void) | null;

const FrameOpenContext = createContext<OpenFrame>(null);

export function FrameOpenProvider({
  children,
  onOpenFrame,
}: {
  children: ReactNode;
  onOpenFrame: (frameId: string) => void;
}) {
  return (
    <FrameOpenContext.Provider value={onOpenFrame}>
      {children}
    </FrameOpenContext.Provider>
  );
}

/**
 * The opener, or null.
 *
 * Null is the ordinary case — every board in the editor — so a caller treats it
 * as "frames are not openable here" rather than as anything missing.
 */
export const useFrameOpener = (): OpenFrame => useContext(FrameOpenContext);
