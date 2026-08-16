import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Delete02Icon,
  MinusSignIcon,
  Settings01Icon,
} from "@hugeicons-pro/core-stroke-standard";
import { type RefObject, useEffect, useRef, useState } from "react";
import {
  DEFAULT_NOTE_FONT_SIZE,
  DEFAULT_TEXT_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  PORT_HIT_PX,
  PORT_RADIUS_PX,
} from "../../config/canvas.js";
import { inputPortsFor, outputPortsFor } from "../../config/graph.js";
import type { BoardItem } from "../types";
import type { ResizeHandle } from "./alignmentGuides";
import { DrawingView } from "./DrawingView";
import { isDrawingConfig } from "./drawing";
import { MaskOverlay } from "./MaskOverlay";
import { maskOf } from "./mask";
import { BatchList, OpNodeView } from "./OpNodeView";
import { inputPoints, outputPoints } from "./portGeometry";
import { ResizeHandles } from "./ResizeHandles";
import { ShaderControls } from "./ShaderControls";
import { ShaderView } from "./ShaderView";
import {
  DEFAULT_SOURCE,
  isShaderConfig,
  newLayer,
  normalizeLayers,
  type ShaderConfig,
  type ShaderLayer,
} from "./shaderConfig";

/** One press changes the size by this much, in canvas units. */
const FONT_STEP = 4;

/**
 * Drops a default source into the named empty effect.
 *
 * Recursive because the effect that needs filling may be nested — an empty
 * Group two levels down is exactly the case the canvas button exists for.
 */
const fillEmptyEffect = (
  layers: ShaderLayer[],
  layerId: string
): ShaderLayer[] =>
  layers.map((layer) =>
    layer.id === layerId
      ? { ...layer, children: [newLayer(DEFAULT_SOURCE)] }
      : { ...layer, children: fillEmptyEffect(layer.children ?? [], layerId) }
  );

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
  /** A picture wired into this item's image input, if it has one. */
  imageUrl?: string | null;
  index: number;
  /** True while this item's text is being typed into. */
  isEditing: boolean;
  isSelected: boolean;
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
  onFontSize: (fontSize: number) => void;
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
              className={`block rounded-full border ${
                isOpen ? "border-emerald-300 bg-emerald-400" : idle
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
  fontSize: number;
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
  fontSize,
  isEditing,
  item,
  onEditBody,
}: BoardItemBodyProps) {
  const isNote = item.kind === "note";

  if (isNote || item.kind === "text") {
    return (
      <textarea
        className={
          isNote
            ? "h-full w-full resize-none bg-amber-100/95 p-3 text-neutral-900 outline-none"
            : // Plain text: no card, no background — just words on the board.
              "h-full w-full resize-none border-0 bg-transparent p-1 font-light text-board-ink outline-none placeholder:text-board-ink/30"
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
          fontSize,
          // Follows the text rather than the browser default, which would
          // leave lines overlapping at large sizes.
          lineHeight: 1.25,
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
      <img
        alt=""
        className={`h-full w-full ${isIcon ? "object-contain" : "object-cover"}`}
        decoding="async"
        draggable={false}
        height={item.height}
        loading="lazy"
        src={item.imageUrl ?? ""}
        width={item.width}
      />
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

/**
 * The smaller/larger control for a note or a text item.
 *
 * Its own component only to keep the item's render readable — it is three
 * buttons that belong to one another and to nothing else.
 */
function FontSizeControl({
  chromeScale,
  fontSize,
  onStep,
}: {
  chromeScale: { transform: string };
  fontSize: number;
  onStep: (delta: number) => void;
}) {
  return (
    <div
      className="absolute bottom-full left-0 flex origin-bottom-left items-center gap-1 rounded-full border border-board-ink/20 bg-board-surface/90 p-1"
      style={chromeScale}
    >
      <button
        aria-label="Smaller text"
        className="flex size-7 items-center justify-center text-board-ink/70 hover:text-board-ink"
        onClick={() => onStep(-FONT_STEP)}
        onPointerDown={(e) => e.stopPropagation()}
        type="button"
      >
        <HugeiconsIcon icon={MinusSignIcon} size={13} />
      </button>
      <span className="min-w-6 text-center text-[10px] text-board-ink/50 tabular-nums">
        {Math.round(fontSize)}
      </span>
      <button
        aria-label="Larger text"
        className="flex size-7 items-center justify-center text-board-ink/70 hover:text-board-ink"
        onClick={() => onStep(FONT_STEP)}
        onPointerDown={(e) => e.stopPropagation()}
        type="button"
      >
        <HugeiconsIcon icon={Add01Icon} size={13} />
      </button>
    </div>
  );
}

/**
 * A frame: a labelled rectangle that groups whatever sits on it.
 *
 * Drawn as an outline so its contents stay readable through the middle, and
 * transparent to the pointer everywhere except its title — a frame that took
 * clicks across its whole area would swallow every item inside it.
 */
function FrameBody({
  item,
  onEditBody,
  readOnly,
}: {
  item: BoardItem;
  onEditBody: (body: string) => void;
  readOnly: boolean;
}) {
  return (
    <div className="pointer-events-none h-full w-full rounded-lg border-2 border-blue-500/50 border-dashed bg-board-ink/2">
      <input
        aria-label="Frame name"
        className="pointer-events-auto w-full bg-transparent px-2 py-1 font-light text-[13px] text-board-ink uppercase tracking-[0.18em] outline-none placeholder:text-board-ink"
        disabled={readOnly}
        onChange={(e) => onEditBody(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        placeholder="Frame"
        value={item.body ?? ""}
      />
    </div>
  );
}

/**
 * An element on the board: the style's cover, its name, and the words it
 * carries into a prompt.
 *
 * Nothing here is editable. The library row is the authority — the copy kept on
 * the node exists only so a board still shows and still runs after the element
 * is deleted out from under it — so a field to type over it here would be a
 * second copy, free to disagree with the library. See withElements in
 * api/boards/[id]/run.ts.
 */
function ElementBody({ item }: { item: BoardItem }) {
  const config = item.config ?? {};
  const stored = typeof config.imageUrl === "string" ? config.imageUrl : null;
  // The same picture the wire hands over, so what is on the canvas and what is
  // sent are never two different things. See resolvedImageUrl in itemOutput.ts.
  const cover = stored || item.imageUrl;
  const name = typeof config.name === "string" ? config.name : null;
  const storedWords =
    typeof config.description === "string" ? config.description : null;
  const words = item.body ?? storedWords;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-board-panel">
      {cover ? (
        <img
          alt=""
          className="min-h-0 w-full grow object-cover"
          decoding="async"
          draggable={false}
          height={item.height}
          loading="lazy"
          src={cover}
          width={item.width}
        />
      ) : (
        <div className="flex min-h-0 grow items-center justify-center text-[11px] text-board-ink/35">
          No cover yet
        </div>
      )}
      <div className="shrink-0 px-2 py-1.5">
        <p className="truncate font-medium text-[11px] text-board-ink">
          {name ?? "Element"}
        </p>
        {/* The description is the substance of an element — it rides the wire
            into the prompt — so it is shown rather than left to a side panel,
            but clamped: this is a node on a canvas, not the library. */}
        {words ? (
          <p className="line-clamp-2 text-[10px] text-board-ink/60 leading-snug">
            {words}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A shader on the board: the effect running live, with its parameters behind a
 * toggle.
 *
 * The controls are hidden until asked for because a shader is something you
 * look at — 1,668 parameters across the library means the panel would otherwise
 * bury the thing it configures.
 */
function ShaderItem({
  imageUrl,
  isSelected,
  item,
  onConfigChange,
  readOnly,
}: {
  imageUrl?: string | null;
  isSelected: boolean;
  item: BoardItem;
  onConfigChange?: (config: Record<string, unknown>) => void;
  readOnly: boolean;
}) {
  // Selecting a shader is the act of saying "I want to work on this one", so
  // the controls come with it. The gear stays as a way to fold them away while
  // keeping the item selected — a shader is a picture, and sometimes the point
  // is to look at it. Collapsing is remembered only until the selection moves.
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isEditing = isSelected && !isCollapsed;

  useEffect(() => {
    if (!isSelected) {
      setIsCollapsed(false);
    }
  }, [isSelected]);
  // A stack saved before layers carried identity gets one here, so the panel
  // has a stable key to work from without the server having to be involved.
  const config: ShaderConfig = isShaderConfig(item.config)
    ? {
        ...item.config,
        layers: item.config.layers.map((layer, index) => ({
          ...layer,
          id: layer.id ?? `legacy-${index}-${layer.name}`,
        })),
      }
    : { layers: [] };

  return (
    <div className="relative h-full w-full">
      <ShaderView
        config={config}
        imageUrl={imageUrl}
        onAddSource={
          readOnly
            ? undefined
            : (layerId) =>
                onConfigChange?.({
                  ...config,
                  layers: fillEmptyEffect(
                    normalizeLayers(config.layers),
                    layerId
                  ),
                } as unknown as Record<string, unknown>)
        }
      />

      {readOnly || !isSelected ? null : (
        <button
          aria-label={isEditing ? "Hide shader settings" : "Shader settings"}
          className="absolute top-1 right-1 rounded bg-board-surface/60 p-1 text-board-ink/60 backdrop-blur hover:text-board-ink"
          onClick={() => setIsCollapsed((folded) => !folded)}
          onPointerDown={(e) => e.stopPropagation()}
          type="button"
        >
          <HugeiconsIcon icon={Settings01Icon} size={13} />
        </button>
      )}

      {isEditing && !readOnly ? (
        // overscroll-contain so reaching the end of the settings does not hand
        // the wheel back to the canvas and start zooming mid-scroll.
        <div className="absolute inset-x-0 bottom-0 max-h-[85%] overflow-y-auto overscroll-contain border-board-ink/10 border-t bg-board-surface/90 p-2 backdrop-blur">
          <ShaderControls
            config={config}
            onChange={(next) =>
              onConfigChange?.(next as unknown as Record<string, unknown>)
            }
          />
        </div>
      ) : null}
    </div>
  );
}

interface ItemContentProps {
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  fontSize: number;
  hasWiredPrompt: boolean;
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
  fontSize,
  hasWiredPrompt,
  imageUrl,
  wiredPrompt,
  isEditing,
  isSelected,
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
        isSelected={isSelected}
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
        item={item}
        onCancel={onCancel}
        onConfigChange={onConfigChange ?? (() => undefined)}
        onRemoveVersion={onRemoveVersion}
        onRun={onRun ?? (() => undefined)}
        onSendVersions={onSendVersions}
        outputText={outputText}
        readOnly={readOnly}
        wiredPrompt={wiredPrompt}
      />
    );
  }
  return (
    <BoardItemBody
      fieldRef={fieldRef}
      fontSize={fontSize}
      isEditing={isEditing}
      item={item}
      onEditBody={onEditBody}
    />
  );
}

/** One item on the board. */
export function BoardItemView({
  hasWiredPrompt = false,
  imageUrl,
  onCancel,
  onRemoveVersion,
  onSendVersions,
  outputText,
  previewImages,
  wiredPrompt,
  index,
  isEditing,
  isSelected,
  onBeginEdit,
  item,
  onConfigChange,
  onDelete,
  onEditBody,
  onFontSize,
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

  // Controls live inside the scaled canvas, so without this they would grow and
  // shrink with the zoom — unusably small when zoomed out to see the whole
  // board, absurd when zoomed in. Cancelling the scale keeps them thumb-sized
  // at every zoom level.
  const chromeScale = { transform: `scale(${1 / scale})` };

  const fontSize =
    item.fontSize ?? (isNote ? DEFAULT_NOTE_FONT_SIZE : DEFAULT_TEXT_FONT_SIZE);

  const stepFont = (delta: number) =>
    onFontSize(
      Math.min(Math.max(fontSize + delta, MIN_FONT_SIZE), MAX_FONT_SIZE)
    );

  const fieldRef = useEditingCaret(isEditing);

  // While a wire is being dragged, the whole item body is a drop target for its
  // nearest input port, so landing a connection does not demand a 14-pixel aim
  // at the port circle — the friction that made rewiring a node that already
  // had a connection a matter of luck. The exact port buttons still win when
  // the pointer is over one; this only claims the spaces between them.
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

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the board is a canvas of individually addressable items; the click only matters in comment mode
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: same — the click aims a comment at the item, and the drag already uses pointer events the same way
    // biome-ignore lint/a11y/useKeyWithClickEvents: same — an item is a canvas surface, not a button
    <div
      className={`group absolute ${isText ? "" : "select-none"} ${
        isSelected ? "ring-2 ring-blue-500" : "ring-1 ring-board-ink/10"
      } ${isText && !isSelected ? "ring-0" : ""}`}
      onClick={
        onCommentTarget
          ? (e) => {
              e.stopPropagation();
              onCommentTarget();
            }
          : undefined
      }
      onPointerDown={(e) => {
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
      }}
      onPointerLeave={handleDragLeave}
      onPointerMove={handleDragHover}
      style={{
        height: item.height,
        left: item.x,
        top: item.y,
        width: item.width,
        // A frame is a backdrop: pinned below everything so items sitting on
        // it stay clickable, whatever stacking order they were given.
        //
        // Below the wires too, hence negative. At zero it tied with the wire
        // layer and won on DOM order, so a frame drawn over a wire swallowed
        // the clicks meant for it — and a node inside a frame could not have
        // its connections removed at all.
        zIndex: item.kind === "frame" ? -1 : item.z + 1,
      }}
    >
      <ItemContent
        fieldRef={fieldRef}
        fontSize={fontSize}
        hasWiredPrompt={hasWiredPrompt}
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

      {isSelected && isWritable && !readOnly ? (
        <FontSizeControl
          chromeScale={chromeScale}
          fontSize={fontSize}
          onStep={stepFont}
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
