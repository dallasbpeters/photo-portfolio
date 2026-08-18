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
  RepeatIcon,
} from "@hugeicons-pro/core-stroke-standard";
import type { BoardItem, BoardWire } from "../../types";
import { isSvgUrl } from "../affinity";
import type { CanvasMenuTarget } from "../CanvasMenu";
import { CollectionRow, hasTools, ToolsRow } from "../CanvasMenuPanels";
import { frameSummary } from "../copyToBoard";
import { outputImageOf, outputImagesOf } from "../itemOutput";

/**
 * Every row the canvas menu can offer, and the rules for which apply.
 *
 * Split out of CanvasMenu.tsx, which had grown past the 500-line limit and needs
 * room for a "Save as recipe" row. The division is deliberate: CanvasMenu is
 * where the menu *is* — placement against the pointer, dismissal, the naming
 * step — and this is what it *contains*.
 *
 * Each row is its own component rather than a branch in one list, because what
 * makes a row applicable differs per row: a node that has produced something can
 * be downloaded, an SVG can be opened in Affinity, a raster can be vectorised,
 * and a frame can be arranged. Written as one list those conditions collapse
 * into a chain nobody can read.
 */

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
export function MenuRows({
  items,
  menu,
  onArrange,
  onBringToFront,
  onCollect,
  onCopy,
  onExport,
  onGroup,
  onSaveElement,
  onSaveRecipe,
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
  /** Opens the collection panel on the pictures the selection can hand over. */
  onCollect: (urls: string[]) => void;
  onCopy: (frame: BoardItem) => void;
  onExport: (itemId: string) => void;
  onGroup: (items: BoardItem[]) => void;
  onSaveElement: (items: BoardItem[]) => void;
  /** Absent on a board that cannot save one — a visitor, or a read-only view. */
  onSaveRecipe?: (items: BoardItem[]) => void;
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

  // What a recipe would actually hold. Counted rather than assumed from the
  // selection length: selecting a node and the reference feeding it is two
  // things, and only one of them is a step in the way of working.
  const nodes = selection.filter((item) => item.kind === "op");

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

      {/* Offered only when the selection holds something that can run. A
          recipe is a way of working, so a selection of pinned photographs has
          no way of working in it to keep. */}
      {onSaveRecipe && nodes.length > 0 ? (
        <button
          className={`${rowClass} border-board-ink/10 border-t`}
          onClick={() => onSaveRecipe(selection)}
          type="button"
        >
          <HugeiconsIcon aria-hidden icon={RepeatIcon} size={14} />
          <span>
            Save {nodes.length === 1 ? "it" : `${nodes.length} nodes`} as a
            recipe
          </span>
        </button>
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

      {pictures.length > 0 ? (
        <CollectionRow
          className={rowClass}
          count={pictures.length}
          onOpen={() => onCollect(pictures)}
        />
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
