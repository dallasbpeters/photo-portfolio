import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon } from "@hugeicons-pro/core-stroke-standard";
import { type RefObject, useEffect, useRef } from "react";
import { PORT_HIT_PX, PORT_RADIUS_PX } from "../../config/canvas.js";
import { inputPortsFor, outputPortsFor } from "../../config/graph.js";
import { textStyleCss } from "../../config/textStyle.js";
import type { BoardItem } from "../types";
import { BoardTextTools } from "./BoardTextTools";
import { BoardToolBar } from "./BoardToolBar";
import { DrawingView } from "./drawing/DrawingView";
import { isDrawingConfig } from "./drawing/drawing";
import { MaskOverlay } from "./drawing/MaskOverlay";
import { maskOf } from "./drawing/mask";
import type { ResizeHandle } from "./geometry/alignmentGuides";
import { inputPoints, outputPoints } from "./geometry/portGeometry";
import { ItemMedia } from "./ItemMedia";
import {
  ElementBody,
  FrameBody,
  itemBoxClassName,
  ShaderItem,
} from "./itemBodies";
import { BatchList } from "./nodes/BatchList";
import { OpNodeView } from "./nodes/OpNodeView";
import { ResizeHandles } from "./ResizeHandles";
import type { BoardTools } from "./tools/useBoardTools";
import { useTextFont } from "./useTextFont";

/**
 * Where a selected item sits while its chrome is open.
 *
 * Above any stored `z`, which the API bounds at 9999 (see `parseIncomingItem`),
 * and below the canvas's own overlays — the guides and the marquee sit at 9999
 * and should stay visible over a selected item.
 */
const CHROME_STACK = 9998;

/**
 * The input port closest to a point, in canvas units.
 *
 * Squared distances: the ordering is the same as with real distances and the
 * square roots would be work done once per pointer move for nothing.
 */
const nearestInput = (
  item: BoardItem,
  px: number,
  py: number
): string | null => {
  let nearest: string | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const [key, point] of inputPoints(item)) {
    const dx = point.x - px;
    const dy = point.y - py;
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = key;
    }
  }
  return nearest;
};

/**
 * Everything the item needs to take part in a wire drag.
 *
 * Passed as one object rather than five props because it is one concern, and
 * because it is absent as a unit: a published board has no wiring at all.
 */
export interface PortHandlers {
  canDropOn: (itemId: string, portKey: string) => boolean;
  isDragging: boolean;
  onPortDown: (
    itemId: string,
    portKey: string,
    screen: { x: number; y: number }
  ) => void;
  onPortEnter: (itemId: string, portKey: string) => void;
  onPortLeave: (itemId: string, portKey: string) => void;
}

interface BoardItemViewProps {
  /** Open comments pinned to this item, for the badge. */
  commentCount?: number;
  /** True when an operation node's prompt arrives down a wire. */
  hasWiredPrompt?: boolean;
  /** How many pictures are wired into this item's image input. */
  imageCount?: number;
  /** A picture wired into this item's image input, if it has one. */
  imageUrl?: string | null;
  index: number;
  /** True while this item's text is being typed into. */
  isEditing: boolean;
  isSelected: boolean;
  /**
   * True when this is the *only* thing selected.
   *
   * The text panel needs it: one panel per item would be a wall of controls
   * over a multi-selection, and a single panel editing one of several would be
   * worse — you would not find out which until later.
   */
  isSoleSelected?: boolean;
  item: BoardItem;
  /** Enters text editing — a second click, or a double click. */
  onBeginEdit: () => void;
  /** Stops a run in flight. */
  onCancel?: () => void;
  /** Called on a click when the board is in comment-targeting mode. */
  onCommentTarget?: () => void;
  onConfigChange?: (config: Record<string, unknown>) => void;
  onDelete: () => void;
  onEditBody: (body: string) => void;
  /** Opens the manual editor on this item, when there is a board to save to. */
  onEditManually?: () => void;
  /** Writes any field of this item back — how the text panel saves. */
  onPatch: (patch: Partial<BoardItem>) => void;
  onRemoveVersion?: (index: number) => void;
  onResizeStart: (
    index: number,
    clientX: number,
    clientY: number,
    handle: ResizeHandle
  ) => void;
  onRun?: (force: boolean) => void;
  onSelect: (
    index: number,
    clientX: number,
    clientY: number,
    additive: boolean
  ) => void;
  onSendVersions?: () => void;
  /** What a node computes from its inputs, for the kinds that show it. */
  outputText?: string | null;
  ports?: PortHandlers;
  /** The pictures a Batch node is holding, so it can list them. */
  previewImages?: string[];
  /** Viewing a published board: no controls at all, not merely disabled ones. */
  readOnly?: boolean;
  /** Current zoom, so chrome can cancel it out and stay a constant size. */
  scale: number;
  /** Runs tools on this item. One object: the bar needs both halves. */
  tools?: BoardTools;
  /** The rows a List node's Fill input is offering, so it can fill itself. */
  wiredItems?: readonly string[];
  /** The words arriving on this item's prompt input, if any. */
  wiredPrompt?: string | null;
}

interface PortHandlesProps {
  handlers: PortHandlers;
  item: BoardItem;
  scale: number;
}

/**
 * The little circles a wire is dragged between.
 *
 * Sized in screen pixels and divided by the zoom, like every other piece of
 * canvas chrome: a handle that scaled would be untappable on a board fitted to
 * the window and absurd at 300%.
 *
 * The hit target is far larger than the visible dot — the button is the target,
 * the dot is drawn inside it — so a wire can be landed on an input without
 * pixel-perfect aim, which was the friction that made connecting images to
 * nodes a matter of luck.
 *
 * Positions come from portGeometry, the same module the wires themselves use,
 * so a curve always terminates exactly on its handle.
 */
function PortHandles({ handlers, item, scale }: PortHandlesProps) {
  const hit = PORT_HIT_PX / scale;
  const dot = (PORT_RADIUS_PX * 2) / scale;
  const inputs = inputPoints(item);
  const outputs = outputPoints(item);

  const style = (point: { x: number; y: number }) => ({
    height: hit,
    left: point.x - item.x,
    marginLeft: -hit / 2,
    marginTop: -hit / 2,
    top: point.y - item.y,
    width: hit,
  });

  return (
    <>
      {outputPortsFor(item).map((port) => {
        const point = outputs.get(port.key);
        return point ? (
          <button
            aria-label={`Drag a connection from ${port.label}`}
            className="absolute grid place-items-center rounded-full"
            data-port={port.key}
            key={`out-${port.key}`}
            onPointerDown={(e) => {
              // The surface would read this as "pick the item up and drag it".
              e.stopPropagation();
              handlers.onPortDown(item.id, port.key, {
                x: e.clientX,
                y: e.clientY,
              });
            }}
            style={style(point)}
            type="button"
          >
            <span
              aria-hidden
              className="block rounded-full border border-sky-300/70 bg-sky-400/80 hover:bg-sky-300"
              style={{ height: dot, width: dot }}
            />
          </button>
        ) : null;
      })}

      {inputPortsFor(item).map((port) => {
        const point = inputs.get(port.key);
        if (!point) {
          return null;
        }
        // Only lights up for a wire that could actually land here, so a refusal
        // is visible during the drag rather than at the drop.
        const isOpen =
          handlers.isDragging && handlers.canDropOn(item.id, port.key);
        const idle = handlers.isDragging
          ? "border-board-ink/20 bg-board-panel"
          : "border-board-ink/40 bg-board-panel";
        return (
          <button
            aria-label={`Connect to ${port.label}`}
            className="absolute grid place-items-center rounded-full"
            data-port={port.key}
            key={`in-${port.key}`}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerEnter={() => handlers.onPortEnter(item.id, port.key)}
            onPointerLeave={() => handlers.onPortLeave(item.id, port.key)}
            style={style(point)}
            type="button"
          >
            <span
              aria-hidden
              className={`block rounded-full border p-2 ${
                isOpen
                  ? "border-emerald-300 bg-emerald-400 ring-1 ring-blue-400 -ring-offset-2"
                  : idle
              }`}
              style={{ height: dot, width: dot }}
            />
          </button>
        );
      })}
    </>
  );
}

/**
 * Keeps the caret in the item's field whenever editing begins.
 *
 * Entering edit mode has to move focus as well as unlock the field; without
 * this, double-clicking a note made it editable but keystrokes went nowhere.
 */
function useEditingCaret(
  isEditing: boolean
): RefObject<HTMLTextAreaElement | null> {
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);

  // Deferred by a frame on purpose. Double-click is how you enter editing, and
  // the browser follows it by selecting the word under the pointer — so placing
  // the caret synchronously loses to that, and the first keystroke replaces a
  // word instead of appending. Running after the native selection wins.
  useEffect(() => {
    if (!isEditing) {
      return;
    }
    // Focus at once, so a keystroke arriving before the next frame still
    // reaches the field rather than the document.
    fieldRef.current?.focus();

    const frame = requestAnimationFrame(() => {
      const field = fieldRef.current;
      field?.focus();
      const caret = field?.value.length ?? 0;
      field?.setSelectionRange(caret, caret);
    });
    return () => cancelAnimationFrame(frame);
  }, [isEditing]);

  return fieldRef;
}

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
        className={
          isNote
            ? "h-full w-full resize-none bg-amber-100/95 p-3 text-neutral-900 outline-none"
            : // Plain text: no card, no background — just words on the board.
              "h-full w-full resize-none border-0 bg-transparent p-1 text-board-ink outline-none placeholder:text-board-ink/30"
        }
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
    <figure className="h-full w-full">
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
        <figcaption className="absolute inset-x-0 bottom-0 truncate bg-board-surface/60 px-2 py-1 text-[10px] text-board-ink/80">
          {item.creditName}
        </figcaption>
      ) : null}
    </figure>
  );
}

interface ItemContentProps {
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
function ItemContent({
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
    return (
      <FrameBody item={item} onEditBody={onEditBody} readOnly={readOnly} />
    );
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

/**
 * Makes the whole item body a drop target for its nearest input port.
 *
 * While a wire is being dragged, landing a connection should not demand a
 * 14-pixel aim at the port circle — the friction that made rewiring a node
 * that already had a connection a matter of luck. The exact port buttons still
 * win when the pointer is over one; this only claims the spaces between them.
 */
function useNearestInputDrop(
  item: BoardItem,
  scale: number,
  ports?: PortHandlers
) {
  const hoveredInput = useRef<string | null>(null);
  const handleDragHover = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ports?.isDragging) {
      return;
    }
    // A port button is an exact target; the body only claims the spaces
    // between them, so an overlapping row of inputs cannot argue with itself.
    if ((e.target as Element).closest("[data-port]")) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const px = item.x + (e.clientX - rect.left) / scale;
    const py = item.y + (e.clientY - rect.top) / scale;
    const nearest = nearestInput(item, px, py);
    if (nearest && nearest !== hoveredInput.current) {
      hoveredInput.current = nearest;
      ports.onPortEnter(item.id, nearest);
    }
  };
  const handleDragLeave = () => {
    if (!ports?.isDragging) {
      return;
    }
    if (hoveredInput.current !== null) {
      ports.onPortLeave(item.id, hoveredInput.current);
      hoveredInput.current = null;
    }
  };
  return { handleDragHover, handleDragLeave };
}

type PointerDownRules = Pick<
  BoardItemViewProps,
  | "index"
  | "isEditing"
  | "isSelected"
  | "onBeginEdit"
  | "onCommentTarget"
  | "onSelect"
> & { isWritable: boolean };

/**
 * The press that picks an item up — and the several cases where it must not.
 *
 * Each refusal has its own reason, spelled out below; together they were long
 * enough to bury the markup they were written inside.
 */
function itemPointerDown({
  index,
  isEditing,
  isSelected,
  isWritable,
  onBeginEdit,
  onCommentTarget,
  onSelect,
}: PointerDownRules) {
  return (e: React.PointerEvent<HTMLDivElement>) => {
    // Only the primary button picks an item up. A right-click emits
    // pointerdown too, and letting it begin a drag meant the context menu
    // opened over a gesture holding everyone's old positions — which were
    // written back the moment it ended, undoing whatever the menu had just
    // done. The press still passes through, so the menu sees the selection.
    if (e.button !== 0) {
      return;
    }
    // Comment targeting: the press belongs to the item, not to a pan —
    // without stopping it the canvas would read it as panning and the
    // click that aims the comment would never fire.
    if (onCommentTarget) {
      e.stopPropagation();
      return;
    }
    // While editing, the press belongs to the field — placing a caret or
    // selecting text must not start a drag, and must not reach the
    // background handler, which would clear the selection and pan.
    if (isEditing) {
      e.stopPropagation();
      return;
    }
    onSelect(index, e.clientX, e.clientY, e.shiftKey || e.metaKey);
    // Already selected, so this is the second press: start typing.
    if (isWritable && isSelected) {
      onBeginEdit();
    }
  };
}

/** One item on the board. */
export function BoardItemView({
  hasWiredPrompt = false,
  imageCount,
  imageUrl,
  onCancel,
  onRemoveVersion,
  onSendVersions,
  outputText,
  previewImages,
  wiredItems,
  wiredPrompt,
  index,
  isEditing,
  isSelected,
  isSoleSelected = false,
  onEditManually,
  tools,
  onBeginEdit,
  item,
  onConfigChange,
  onDelete,
  onEditBody,
  onPatch,
  onResizeStart,
  onRun,
  onSelect,
  ports,
  readOnly = false,
  scale,
  commentCount = 0,
  onCommentTarget,
}: BoardItemViewProps) {
  const isNote = item.kind === "note";
  const isText = item.kind === "text";
  // An operation node is never typed into directly — its settings are its own
  // fields, handled inside OpNodeView.
  const isWritable = isNote || isText;
  /**
   * True while this item carries chrome that must not be covered.
   *
   * A frame is excluded: it is a backdrop by definition, and lifting one over
   * the items sitting on it would make them unclickable — the exact bug the
   * negative z-index below exists to prevent.
   */
  const chromeOnTop = isSoleSelected && !readOnly && item.kind !== "frame";

  // Controls live inside the scaled canvas, so without this they would grow and
  // shrink with the zoom — unusably small when zoomed out to see the whole
  // board, absurd when zoomed in. Cancelling the scale keeps them thumb-sized
  // at every zoom level.
  const chromeScale = { transform: `scale(${1 / scale})` };

  // Handed to the text panel, which reads this box's position off the DOM to
  // decide whether it fits above the item. The canvas viewport lives in a ref
  // so that panning does not re-render, so there is nothing else to ask.
  const boxRef = useRef<HTMLDivElement>(null);

  const fieldRef = useEditingCaret(isEditing);

  const { handleDragHover, handleDragLeave } = useNearestInputDrop(
    item,
    scale,
    ports
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the board is a canvas of individually addressable items; the click only matters in comment mode
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: same — the click aims a comment at the item, and the drag already uses pointer events the same way
    // biome-ignore lint/a11y/useKeyWithClickEvents: same — an item is a canvas surface, not a button
    <div
      className={itemBoxClassName(item, isSelected)}
      onClick={
        onCommentTarget
          ? (e) => {
              e.stopPropagation();
              onCommentTarget();
            }
          : undefined
      }
      onPointerDown={itemPointerDown({
        index,
        isEditing,
        isSelected,
        isWritable,
        onBeginEdit,
        onCommentTarget,
        onSelect,
      })}
      onPointerLeave={handleDragLeave}
      onPointerMove={handleDragHover}
      ref={boxRef}
      style={{
        height: item.height,
        left: item.x,
        top: item.y,
        width: item.width,
        // A frame is a backdrop: below everything so items on it stay
        // clickable, and below the wires too, hence negative — at zero it tied
        // with the wire layer and won on DOM order, swallowing the clicks meant
        // for a wire, so a node inside a frame could not be disconnected.
        //
        // The item holding the chrome comes to the front while it holds it. A
        // panel is a child of the item and cannot escape its parent's place in
        // the stack, so a neighbour with a higher `z` drew over the tool bar
        // whatever z-index the bar used. Raising the *item* is the only thing
        // that works, and only while the chrome shows: `item.z` is untouched.
        zIndex: chromeOnTop ? CHROME_STACK : item.z + 1,
      }}
    >
      <ItemContent
        fieldRef={fieldRef}
        hasWiredPrompt={hasWiredPrompt}
        imageCount={imageCount}
        imageUrl={imageUrl}
        isEditing={isEditing}
        isSelected={isSelected}
        item={item}
        onCancel={onCancel}
        onConfigChange={onConfigChange}
        onEditBody={onEditBody}
        onRemoveVersion={onRemoveVersion}
        onRun={onRun}
        onSendVersions={onSendVersions}
        outputText={outputText}
        previewImages={previewImages}
        readOnly={readOnly}
        wiredItems={wiredItems}
        wiredPrompt={wiredPrompt}
      />

      {/* Absent as a unit on a published board, which has no wiring at all. */}
      {ports ? (
        <PortHandles handlers={ports} item={item} scale={scale} />
      ) : null}

      {/* Revealed on hover, and kept visible while selected so it does not
          vanish mid-interaction on a touch screen, which has no hover. Absent
          entirely when viewing: the API refuses the call anyway, but offering a
          control that cannot work is its own bug. */}
      {readOnly ? null : (
        <button
          aria-label="Remove from board"
          className={`absolute top-0 left-full flex size-8 origin-top-left items-center justify-center rounded-full border border-board-ink/20 bg-board-surface text-board-ink/80 transition-opacity hover:text-board-ink focus-visible:opacity-100 group-hover:opacity-100 ${
            isSelected ? "opacity-100" : "opacity-0"
          }`}
          onClick={onDelete}
          onPointerDown={(e) => e.stopPropagation()}
          style={chromeScale}
          type="button"
        >
          <HugeiconsIcon icon={Delete02Icon} size={14} />
        </button>
      )}

      {/* Text has its own panel, below; everything else gets the tools. */}
      {isSoleSelected && !(isWritable || readOnly) && tools ? (
        <BoardToolBar
          anchor={boxRef}
          chromeScale={chromeScale}
          isRunning={tools.isRunning(item.id)}
          item={item}
          onEditManually={onEditManually}
          onRun={(tool, prompt, config) =>
            tools.run(item, tool, prompt, config)
          }
        />
      ) : null}

      {isSoleSelected && isWritable && !readOnly ? (
        <BoardTextTools
          anchor={boxRef}
          chromeScale={chromeScale}
          item={item}
          onPatch={onPatch}
        />
      ) : null}

      {isSelected && !readOnly ? (
        <ResizeHandles
          chromeScale={chromeScale}
          onStart={(handle, clientX, clientY) =>
            onResizeStart(index, clientX, clientY, handle)
          }
        />
      ) : null}

      {/* Open comments pinned to this item: the count, so a visitor can see at
          a glance what has feedback on it. */}
      {commentCount > 0 ? (
        <span className="absolute -top-2 -right-2 grid min-w-5 place-items-center rounded-full bg-amber-300 px-1.5 py-0.5 font-semibold text-[10px] text-black shadow">
          {commentCount}
        </span>
      ) : null}
    </div>
  );
}
