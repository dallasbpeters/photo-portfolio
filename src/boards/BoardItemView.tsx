import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon } from "@hugeicons-pro/core-stroke-standard";
import { type RefObject, useEffect, useRef } from "react";
import { PORT_HIT_PX, PORT_RADIUS_PX } from "../../config/canvas.js";
import { inputPortsFor, outputPortsFor } from "../../config/graph.js";
import type { BoardItem } from "../types";
import { BoardTextTools } from "./BoardTextTools";
import { BoardToolBar } from "./BoardToolBar";
import type { ResizeHandle } from "./geometry/alignmentGuides";
import { inputPoints, outputPoints } from "./geometry/portGeometry";
import { itemBoxClassName } from "./itemBodies";
import { ItemContent } from "./nodes/ItemContent";
import { ResizeHandles } from "./ResizeHandles";
import type { BoardTools } from "./tools/useBoardTools";
import "./BoardItemView.css";

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
  onOpenInEditor?: (itemId: string) => void;
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
  /** Generations one press of Run buys. Shown on the node; see runPlanFor. */
  runs?: number;
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
            className="board-item__port"
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
              className="board-item__port-dot"
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
          ? "board-item__port-target--closed"
          : "";
        return (
          <button
            aria-label={`Connect to ${port.label}`}
            className="board-item__port"
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
              className={`board-item__port-target ${
                isOpen ? "board-item__port-target--open" : idle
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
    // Cmd, not shift: shift pans the board now, and one press cannot do both.
    onSelect(index, e.clientX, e.clientY, e.metaKey);
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
  onOpenInEditor,
  runs,
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
        chromeScale={chromeScale}
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
        runs={runs}
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
          className={`board-item__delete ${
            isSelected ? "board-item__delete--shown" : ""
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
          onOpenInEditor={onOpenInEditor}
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
        <span className="board-item__comment-count">{commentCount}</span>
      ) : null}
    </div>
  );
}
