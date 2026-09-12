import type { RefObject } from "react";
import { textStyleCss } from "../../../config/textStyle.js";
import type { BoardItem } from "../../types";
import { DrawingView } from "../drawing/DrawingView";
import { isDrawingConfig } from "../drawing/drawing";
import { MaskOverlay } from "../drawing/MaskOverlay";
import { maskOf } from "../drawing/mask";
import { useTextFont } from "../hooks/useTextFont";
import { ItemMedia } from "../ItemMedia";
import { ElementBody, FrameBody, ShaderItem } from "../itemBodies";
import { BatchList } from "./BatchList";
import { OpNodeView } from "./OpNodeView";

/**
 * What goes inside an item's box, once the chrome around it is decided.
 *
 * Lifted out of BoardItemView.tsx, which was at the size ceiling and is the
 * second largest file in the project. The split is along a real seam: the view
 * owns the box — where it sits, whether it is selected, the handles on its
 * edges — and this owns what is drawn in it, which is a different question
 * answered per kind.
 */

interface BoardItemBodyProps {
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  isEditing: boolean;
  item: BoardItem;
  onEditBody: (body: string) => void;
}

/**
 * What the item actually shows: an editable field for a note or text, and
 * otherwise the image with its credit.
 *
 * Images are deliberately not <OptimizedImage>: an item is resized freely on
 * the canvas, so there is no stable render width to request, and re-requesting
 * a new size mid-drag would flicker. The board is an admin surface, so the cost
 * is paid by one person rather than every visitor.
 */
function BoardItemBody({
  fieldRef,
  isEditing,
  item,
  onEditBody,
}: BoardItemBodyProps) {
  const isNote = item.kind === "note";
  // Here rather than in the toolbar, so a published board a visitor is only
  // reading gets the family too.
  useTextFont(item.textStyle);

  if (isNote || item.kind === "text") {
    // Size, line-height and weight used to be literals here; they live in
    // textStyleCss now, which resolves a null property back to the value this
    // component hard-coded — so an unstyled item is set exactly as before.
    const css = textStyleCss(item);
    return (
      <textarea
        className={`text-body ${
          isNote ? "text-body--note" : "text-body--plain"
        }`}
        onChange={(e) => onEditBody(e.target.value)}
        placeholder={isNote ? "Note…" : "Type…"}
        // A note is covered edge to edge by its field, so while it is not
        // being edited the field must let pointers through — otherwise there
        // is nowhere on the item to grab, and it can never be dragged,
        // selected, or resized.
        readOnly={!isEditing}
        ref={fieldRef}
        style={{
          ...css,
          pointerEvents: isEditing ? "auto" : "none",
        }}
        value={item.body ?? ""}
      />
    );
  }

  // A photograph is cropped to fill its frame, which is what you want when the
  // frame is the composition. A generated icon is a shape on a transparent
  // ground, and cropping one just cuts the glyph in half — so icons are fitted
  // inside the frame instead.
  //
  // Keyed on where the file is stored rather than on the extension: an icon
  // comes back as a PNG whenever the vectoriser is unavailable, and it needs
  // fitting just as much as the SVG would have.
  const isIcon = item.imageUrl?.includes("/boards/icons/") ?? false;
  const mask = maskOf(item.config);

  return (
    <figure className="board-item__figure">
      {/* Lazy and async because a board is mostly off screen. A decoded
          1024-square bitmap is four megabytes whether or not it is in view, and
          a board of a hundred results was decoding all of them at once — which
          is felt as the canvas bogging down rather than as anything to do with
          pictures. */}
      <ItemMedia isIcon={isIcon} item={item} />

      {/* The mask, if this picture has one painted on it. Above the image and
          below the credit, because it annotates the picture and the credit
          annotates the item. */}
      {mask ? (
        <MaskOverlay height={item.height} mask={mask} width={item.width} />
      ) : null}
      {/* Unsplash's licence requires the photographer be credited wherever
          the image appears, so the credit renders with the item rather than
          living only in the database. */}
      {item.creditName ? (
        <figcaption className="board-item__caption">
          {item.creditName}
        </figcaption>
      ) : null}
    </figure>
  );
}

interface ItemContentProps {
  /** Cancels the canvas zoom for a frame's title row. */
  chromeScale?: { transform: string };
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  hasWiredPrompt: boolean;
  imageCount?: number;
  imageUrl?: string | null;
  isEditing: boolean;
  isSelected: boolean;
  item: BoardItem;
  onCancel?: () => void;
  onConfigChange?: (config: Record<string, unknown>) => void;
  onEditBody: (body: string) => void;
  onRemoveVersion?: (index: number) => void;
  onRun?: (force: boolean) => void;
  onSendVersions?: () => void;
  outputText?: string | null;
  /** The pictures a Batch node is holding, so it can list them. */
  previewImages?: string[];
  readOnly: boolean;
  /** Generations one press of Run buys. See runPlanFor. */
  runs?: number;
  wiredItems?: readonly string[];
  wiredPrompt?: string | null;
}

/**
 * What fills the item: a frame outline, an operation node, or the moodboard
 * body every other kind uses.
 *
 * One place that switches on kind, so the item wrapper stays about geometry,
 * selection and chrome rather than growing a branch per kind.
 */
export function ItemContent({
  chromeScale,
  fieldRef,
  hasWiredPrompt,
  imageCount,
  imageUrl,
  wiredPrompt,
  isEditing,
  item,
  onCancel,
  onConfigChange,
  onEditBody,
  onRemoveVersion,
  onRun,
  onSendVersions,
  outputText,
  previewImages,
  readOnly,
  runs,
  wiredItems,
}: ItemContentProps) {
  // A Batch node is a window onto whatever is wired into it: no run state, no
  // versions, nothing of its own. Answered here rather than inside OpNodeView,
  // which is about running things and has none of this to say.
  if (item.nodeType === "batch") {
    return (
      <BatchList
        images={previewImages ?? []}
        item={item}
        onConfigChange={onConfigChange}
        readOnly={readOnly}
      />
    );
  }
  if (item.nodeType === "element") {
    return <ElementBody item={item} />;
  }
  if (item.kind === "frame") {
    return <FrameBody {...{ chromeScale, item, onEditBody, readOnly }} />;
  }
  if (item.kind === "drawing") {
    return isDrawingConfig(item.config) ? (
      <DrawingView
        config={item.config}
        height={item.height}
        width={item.width}
      />
    ) : null;
  }
  if (item.kind === "shader") {
    return (
      <ShaderItem
        imageUrl={imageUrl}
        item={item}
        onConfigChange={onConfigChange}
        readOnly={readOnly}
      />
    );
  }
  if (item.kind === "op") {
    return (
      <OpNodeView
        hasWiredPrompt={hasWiredPrompt}
        imageCount={imageCount}
        imageUrl={imageUrl}
        item={item}
        onCancel={onCancel}
        onConfigChange={onConfigChange ?? (() => undefined)}
        onRemoveVersion={onRemoveVersion}
        onRun={onRun ?? (() => undefined)}
        onSendVersions={onSendVersions}
        outputText={outputText}
        readOnly={readOnly}
        runs={runs}
        wiredItems={wiredItems}
        wiredPrompt={wiredPrompt}
      />
    );
  }
  return (
    <BoardItemBody
      fieldRef={fieldRef}
      isEditing={isEditing}
      item={item}
      onEditBody={onEditBody}
    />
  );
}
