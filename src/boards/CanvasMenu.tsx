import { HugeiconsIcon } from "@hugeicons/react";
import {
  Album02Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  CopyIcon,
  Download01Icon,
  FrameIcon,
  GridIcon,
  Image01Icon,
  MagicWand01Icon,
  PenTool01Icon,
} from "@hugeicons-pro/core-stroke-standard";
import { useState } from "react";
import type { BoardItem, BoardWire } from "../types";
import { isSvgUrl } from "./affinity";
import { hasTools, NamePanel, ToolsPanel, ToolsRow } from "./CanvasMenuPanels";
import { frameBoardTitle, frameSummary } from "./copyToBoard";
import { outputImageOf, outputImagesOf } from "./itemOutput";
import type { Tool } from "./tools/types";

/**
 * What the canvas offers on a right-click.
 *
 * One menu rather than one per target, because the targets overlap: a board
 * usually has a frame spread under most of the work, so a menu that asked
 * "is there a frame here?" first could never reach the selection actions — the
 * frame always won, and grouping was unreachable on exactly the boards where
 * it was wanted.
 *
 * So both are offered together and the reader picks. Grouping comes first: it
 * acts on what you deliberately selected, while the frame is merely what
 * happens to be underneath.
 *
 * Positioned in screen pixels like PortMenu — it is chrome, so the zoom must
 * not change its size or where it sits.
 */

export interface CanvasMenuTarget {
  /** The frame under the pointer, if any. */
  frame: BoardItem | null;
  point: { x: number; y: number };
  /** What was selected when the menu opened. */
  selection: BoardItem[];
}

interface CanvasMenuProps {
  items: BoardItem[];
  menu: CanvasMenuTarget | null;
  /** Lays the frame's contents out in a grid, keeping their order. */
  onArrange: (itemId: string) => void;
  /** Brings one item to the very front of the stack. */
  onBringToFront: (itemId: string) => void;
  onCopyFrame: (frame: BoardItem, title: string) => void;
  onDismiss: () => void;
  /** Downloads everything the frame holds, as one archive. */
  onExport: (itemId: string) => void;
  onGroup: (items: BoardItem[]) => void;
  /** Opens a node's SVG in Affinity, and syncs its edits back. */
  onOpenInAffinity?: (itemId: string) => void;
  /**
   * Runs a registry tool on the one selected item.
   *
   * Handed up rather than run here: the menu is dismissed the moment a tool is
   * picked, and a run that lived in this component would be aborted by its own
   * unmount. Omit it and the Tools row is absent.
   */
  onRunTool?: (item: BoardItem, tool: Tool) => void;
  /** Keeps the selection's pictures in the element library. */
  onSaveElement: (items: BoardItem[]) => void;
  /** Sends one item to the very back of the stack, above the frames. */
  onSendToBack: (itemId: string) => void;
  /** Sends one item's picture into a Canva design. */
  onSendToCanva?: (item: BoardItem) => void;
  /** Runs the Recraft vectorizer on a placed image, via a fresh node. */
  onVectorize?: (itemId: string) => void;
  wires: BoardWire[];
}

/** How many pictures a node is holding, across every run it remembers. */
const countResults = (item: BoardItem): number => {
  const result = item.result as
    | { url?: string; variations?: unknown[] }
    | null
    | undefined;
  if (!result) {
    return 0;
  }
  if (Array.isArray(result.variations)) {
    return result.variations.filter(Boolean).length;
  }
  return result.url ? 1 : 0;
};

/** What a single selected node that has produced something can do. */
function NodeRow({ count, onExport }: { count: number; onExport: () => void }) {
  return (
    <button className={rowClass} onClick={onExport} type="button">
      <HugeiconsIcon aria-hidden icon={Download01Icon} size={14} />
      <span>Download {count === 1 ? "it" : `all ${count}`}</span>
    </button>
  );
}

/** Sends a node's SVG to Affinity, where it can be edited and saved back. */
function AffinityRow({ onOpen }: { onOpen: () => void }) {
  return (
    <button className={rowClass} onClick={onOpen} type="button">
      <HugeiconsIcon aria-hidden icon={PenTool01Icon} size={14} />
      <span>Open in Affinity</span>
    </button>
  );
}

/** Traces a placed picture into vector art with the Recraft vectorizer. */
function VectorizeRow({ onVectorize }: { onVectorize: () => void }) {
  return (
    <button className={rowClass} onClick={onVectorize} type="button">
      <HugeiconsIcon aria-hidden icon={MagicWand01Icon} size={14} />
      <span>Vectorize</span>
    </button>
  );
}

/** The two ends of the stack, for an item buried (or lost) in the middle. */
function StackRows({
  onBringToFront,
  onSendToBack,
}: {
  onBringToFront: () => void;
  onSendToBack: () => void;
}) {
  return (
    <>
      <button className={rowClass} onClick={onBringToFront} type="button">
        <HugeiconsIcon aria-hidden icon={ArrowUp01Icon} size={14} />
        <span>Bring to front</span>
      </button>
      <button className={rowClass} onClick={onSendToBack} type="button">
        <HugeiconsIcon aria-hidden icon={ArrowDown01Icon} size={14} />
        <span>Send to back</span>
      </button>
    </>
  );
}

/** Sends the picture into a Canva design the admin can carry on editing. */
function CanvaRow({ onSend }: { onSend: () => void }) {
  return (
    <button className={rowClass} onClick={onSend} type="button">
      <HugeiconsIcon aria-hidden icon={Image01Icon} size={14} />
      <span>Send to Canva</span>
    </button>
  );
}

/**
 * The actions that only make sense for one picked item: hand over its results,
 * edit it in Affinity, vectorize it, or move it through the stack.
 *
 * Split out of MenuRows because each is its own boolean of conditions, and the
 * menu was heading past the complexity ceiling one row at a time.
 */
function SingleItemRows({
  items,
  onBringToFront,
  onExport,
  onOpenInAffinity,
  onSendToCanva,
  onSendToBack,
  onVectorize,
  onlyPicked,
}: {
  items: BoardItem[];
  onBringToFront: (itemId: string) => void;
  onExport: (itemId: string) => void;
  onOpenInAffinity?: (itemId: string) => void;
  onSendToCanva?: (item: BoardItem) => void;
  onSendToBack: (itemId: string) => void;
  onVectorize?: (itemId: string) => void;
  onlyPicked: BoardItem | null;
}) {
  // A single selected node that has produced something can hand over the whole
  // batch. More than one selected is a grouping gesture, not an export one.
  const madeCount = onlyPicked ? countResults(onlyPicked) : 0;
  // A node's SVG is what Affinity edits, and only an actual vector is worth
  // offering that move for — a raster cannot be handed over as an SVG at all.
  const pickedSvg = onlyPicked
    ? isSvgUrl(outputImageOf(onlyPicked, items))
    : false;

  // A placed picture — photo or reference — is a raster waiting to be traced.
  // The Recraft vectorizer needs a source, so a node with no image would have
  // nothing to offer it. An SVG is already vector art, so offering to trace it
  // is offering to fail.
  const placedImage =
    onlyPicked &&
    (onlyPicked.kind === "photo" || onlyPicked.kind === "reference") &&
    Boolean(onlyPicked.imageUrl) &&
    !isSvgUrl(onlyPicked.imageUrl);

  return (
    <>
      {onlyPicked && madeCount > 0 ? (
        <NodeRow count={madeCount} onExport={() => onExport(onlyPicked.id)} />
      ) : null}

      {onlyPicked && pickedSvg && onOpenInAffinity ? (
        <AffinityRow onOpen={() => onOpenInAffinity(onlyPicked.id)} />
      ) : null}

      {onlyPicked && placedImage && onVectorize ? (
        <VectorizeRow onVectorize={() => onVectorize(onlyPicked.id)} />
      ) : null}

      {onlyPicked && onSendToCanva && outputImageOf(onlyPicked, items) ? (
        <CanvaRow onSend={() => onSendToCanva(onlyPicked)} />
      ) : null}

      {onlyPicked && onlyPicked.kind !== "frame" ? (
        <StackRows
          onBringToFront={() => onBringToFront(onlyPicked.id)}
          onSendToBack={() => onSendToBack(onlyPicked.id)}
        />
      ) : null}
    </>
  );
}

/** What a selection can be turned into. */
function GroupRows({ count, onGroup }: { count: number; onGroup: () => void }) {
  return (
    <>
      <button className={rowClass} onClick={onGroup} type="button">
        <HugeiconsIcon aria-hidden icon={FrameIcon} size={14} />
        <span>
          Group {count === 1 ? "" : `${count} `}
          into a frame
        </span>
      </button>
      <p className="px-3 pb-2 text-[10px] text-board-ink/40 leading-relaxed">
        Arrange them inside, then wire the frame into a Composite node.
      </p>
    </>
  );
}

/** The things a frame under the pointer can do. */
function FrameRows({
  canArrange,
  canGroup,
  count,
  onArrange,
  onCopy,
  onExport,
}: {
  canArrange: boolean;
  canGroup: boolean;
  count: number;
  onArrange: () => void;
  onCopy: () => void;
  onExport: () => void;
}) {
  return (
    <>
      {canArrange ? (
        <button
          className={`${rowClass} border-board-ink/10 ${canGroup ? "border-t" : ""}`}
          onClick={onArrange}
          type="button"
        >
          <HugeiconsIcon aria-hidden icon={GridIcon} size={14} />
          <span>Arrange {count} into a grid</span>
        </button>
      ) : null}
      <button
        className={`${rowClass} border-board-ink/10 ${canGroup || canArrange ? "border-t" : ""}`}
        onClick={onExport}
        type="button"
      >
        <HugeiconsIcon aria-hidden icon={Download01Icon} size={14} />
        <span>Download {count === 1 ? "it" : `all ${count}`}</span>
      </button>
      <button
        className={`${rowClass} border-board-ink/10 border-t`}
        onClick={onCopy}
        type="button"
      >
        <HugeiconsIcon aria-hidden icon={CopyIcon} size={14} />
        <span>Copy frame to new board</span>
      </button>
    </>
  );
}

const rowClass =
  "flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12px] text-board-ink/85 transition-colors hover:bg-board-ink/10 hover:text-board-ink";

/** Everything on offer before a name is being typed. */
function MenuRows({
  items,
  menu,
  onArrange,
  onBringToFront,
  onCopy,
  onExport,
  onGroup,
  onSaveElement,
  onOpenInAffinity,
  onSendToCanva,
  onSendToBack,
  onTools,
  onVectorize,
  wires,
}: {
  items: BoardItem[];
  menu: CanvasMenuTarget;
  onArrange: (itemId: string) => void;
  onBringToFront: (itemId: string) => void;
  onCopy: (frame: BoardItem) => void;
  onExport: (itemId: string) => void;
  onGroup: (items: BoardItem[]) => void;
  onSaveElement: (items: BoardItem[]) => void;
  onOpenInAffinity?: (itemId: string) => void;
  onSendToCanva?: (item: BoardItem) => void;
  onSendToBack: (itemId: string) => void;
  /** Opens the tool picker on the one selected item. Absent, the row is too. */
  onTools?: (item: BoardItem) => void;
  onVectorize?: (itemId: string) => void;
  wires: BoardWire[];
}) {
  const { frame, selection } = menu;
  const canGroup = selection.length > 0;
  const summary = frame ? frameSummary(frame, items, wires) : null;

  // A single selected node that has produced something can hand over the whole
  // batch. More than one selected is a grouping gesture, not an export one.
  const onlyPicked = selection.length === 1 ? selection[0] : null;

  // Every picture the selection can hand over, resolved the way a wire would
  // resolve it — so selecting a frame offers the pictures sitting on it, and
  // selecting a node offers the version chosen on it, rather than nothing.
  const pictures = selection.flatMap((item) =>
    outputImagesOf(item, { items, wires })
  );

  return (
    <>
      {/* First, because it is the only row that leads anywhere rather than
          doing something — and because the tools are what the item *is* for. */}
      {onlyPicked && onTools && hasTools(onlyPicked) ? (
        <ToolsRow className={rowClass} onOpen={() => onTools(onlyPicked)} />
      ) : null}

      <SingleItemRows
        items={items}
        onBringToFront={onBringToFront}
        onExport={onExport}
        onlyPicked={onlyPicked}
        onOpenInAffinity={onOpenInAffinity}
        onSendToBack={onSendToBack}
        onSendToCanva={onSendToCanva}
        onVectorize={onVectorize}
      />

      {canGroup ? (
        <GroupRows
          count={selection.length}
          onGroup={() => onGroup(selection)}
        />
      ) : null}

      {/* Offered only when there is something to keep. An element is its
          pictures, so a selection of notes and wires has nothing to save. */}
      {pictures.length > 0 ? (
        <button
          className={`${rowClass} border-board-ink/10 border-t`}
          onClick={() => onSaveElement(selection)}
          type="button"
        >
          <HugeiconsIcon aria-hidden icon={Album02Icon} size={14} />
          <span>
            Save {pictures.length === 1 ? "it" : `${pictures.length}`} as an
            element
          </span>
        </button>
      ) : null}

      {frame ? (
        <FrameRows
          canArrange={(summary?.count ?? 0) > 1}
          canGroup={canGroup}
          count={summary?.count ?? 0}
          onArrange={() => onArrange(frame.id)}
          onCopy={() => onCopy(frame)}
          onExport={() => onExport(frame.id)}
        />
      ) : null}
    </>
  );
}

export function CanvasMenu({
  items,
  menu,
  onArrange,
  onBringToFront,
  onCopyFrame,
  onDismiss,
  onExport,
  onGroup,
  onOpenInAffinity,
  onRunTool,
  onSaveElement,
  onSendToCanva,
  onSendToBack,
  onVectorize,
  wires,
}: CanvasMenuProps) {
  /**
   * Null until "Copy frame to new board" is chosen; then the frame being
   * copied and the name typed for it.
   *
   * Tagged with the menu it belongs to rather than reset by an effect: opening
   * a second frame's menu makes the stored name stale, and comparing is both
   * cheaper than an effect and impossible to forget. The frame rides along so
   * the panel has one without asking the menu again.
   */
  const [naming, setNaming] = useState<{
    for: CanvasMenuTarget;
    frame: BoardItem;
    title: string;
  } | null>(null);

  /**
   * Null until "Tools…" is chosen; then the item whose tools are on offer.
   * Tagged with its menu for the same reason the name is.
   */
  const [picking, setPicking] = useState<{
    for: CanvasMenuTarget;
    item: BoardItem;
  } | null>(null);

  if (!menu) {
    return null;
  }

  const typing = naming?.for === menu ? naming : null;
  const picked = picking?.for === menu ? picking : null;

  const { frame, point, selection } = menu;
  const canGroup = selection.length > 0;
  if (!(canGroup || frame)) {
    return null;
  }

  // The picker sits on top of the rows it was opened from: picking a tool is a
  // step on the way to a run, not a way back to the rest of the menu.
  const rows = picked ? (
    <ToolsPanel
      item={picked.item}
      onClose={onDismiss}
      onPick={(item, tool) => {
        onRunTool?.(item, tool);
        // Dismissed immediately: the run outlives this menu, and a menu left
        // open over the item would hide the change it is making.
        onDismiss();
      }}
    />
  ) : (
    <MenuRows
      items={items}
      menu={menu}
      onArrange={onArrange}
      onBringToFront={onBringToFront}
      onCopy={(frameToCopy) =>
        setNaming({
          for: menu,
          frame: frameToCopy,
          title: frameBoardTitle(frameToCopy),
        })
      }
      onExport={onExport}
      onGroup={onGroup}
      onOpenInAffinity={onOpenInAffinity}
      onSaveElement={onSaveElement}
      onSendToBack={onSendToBack}
      onSendToCanva={onSendToCanva}
      onTools={
        onRunTool ? (item) => setPicking({ for: menu, item }) : undefined
      }
      onVectorize={onVectorize}
      wires={wires}
    />
  );

  return (
    <>
      <button
        aria-label="Dismiss"
        className="fixed inset-0 z-40 cursor-default"
        onClick={onDismiss}
        tabIndex={-1}
        type="button"
      />
      <div
        className="absolute z-50 w-60 overflow-hidden rounded-lg border border-board-ink/15 bg-board-panel/95 shadow-xl backdrop-blur"
        style={{ left: point.x + 10, top: point.y - 8 }}
      >
        {typing ? (
          <NamePanel
            frame={typing.frame}
            onCancel={onDismiss}
            onConfirm={onCopyFrame}
            onType={(title) => setNaming({ ...typing, title })}
            summary={frameSummary(typing.frame, items, wires)}
            title={typing.title}
          />
        ) : (
          rows
        )}
      </div>
    </>
  );
}
