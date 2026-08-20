import { useState } from "react";
import type { BoardItem, BoardWire } from "../../types";
import { frameBoardTitle, frameSummary } from "../copyToBoard";
import type { Tool } from "../tools/types";
import { NamePanel, ToolsPanel } from "./CanvasMenuPanels";
import { CollectionPanel } from "./CollectionPanel";
import { MenuRows } from "./MenuRows";
import { RecipeNamePanel } from "./RecipeNamePanel";

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
  /** Absent on a board that cannot save one — a visitor, or a read-only view. */
  onSaveRecipe?: (items: BoardItem[], name: string) => void;
  /** Sends one item to the very back of the stack, above the frames. */
  onSendToBack: (itemId: string) => void;
  /** Sends one item's picture into a Canva design. */
  onSendToCanva?: (item: BoardItem) => void;
  /** Runs the Recraft vectorizer on a placed image, via a fresh node. */
  onVectorize?: (itemId: string) => void;
  wires: BoardWire[];
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
  onSaveRecipe,
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
  /** Null until "Save to a collection" is chosen; then what is being saved. */
  const [collecting, setCollecting] = useState<{
    for: CanvasMenuTarget;
    urls: string[];
  } | null>(null);

  const [naming, setNaming] = useState<{
    for: CanvasMenuTarget;
    frame: BoardItem;
    title: string;
  } | null>(null);

  /** Null until "Save as recipe" is chosen; then the selection being named. */
  const [savingRecipe, setSavingRecipe] = useState<{
    for: CanvasMenuTarget;
    items: BoardItem[];
    name: string;
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
  const namingRecipe = savingRecipe?.for === menu ? savingRecipe : null;
  const collectingNow = collecting?.for === menu ? collecting : null;
  const picked = picking?.for === menu ? picking : null;

  const { frame, point, selection } = menu;
  const canGroup = selection.length > 0;
  if (!(canGroup || frame)) {
    return null;
  }

  // The picker sits on top of the rows it was opened from: picking a tool is a
  // step on the way to a run, not a way back to the rest of the menu.
  /**
   * What the menu is showing: its rows, or the one panel that replaced them.
   *
   * Chosen by name rather than by a chain of ternaries — there are three now,
   * and a fourth would nest deeper than anyone can read. Each panel sits on top
   * of the rows it was opened from: choosing is a step towards doing something,
   * not a way back to the rest of the menu.
   */
  const panel = (() => {
    if (namingRecipe) {
      return (
        <RecipeNamePanel
          name={namingRecipe.name}
          nodeCount={
            namingRecipe.items.filter((item) => item.kind === "op").length
          }
          onCancel={onDismiss}
          onConfirm={(name) => {
            onSaveRecipe?.(namingRecipe.items, name);
            // Dismissed immediately: the save outlives this menu, and leaving
            // it open over the selection hides what was just kept.
            onDismiss();
          }}
          onType={(name) => setSavingRecipe({ ...namingRecipe, name })}
        />
      );
    }
    if (typing) {
      return (
        <NamePanel
          frame={typing.frame}
          onCancel={onDismiss}
          onConfirm={onCopyFrame}
          onType={(title) => setNaming({ ...typing, title })}
          summary={frameSummary(typing.frame, items, wires)}
          title={typing.title}
        />
      );
    }
    if (collectingNow) {
      return (
        <CollectionPanel
          assets={collectingNow.urls.map((url) => ({ url }))}
          onClose={onDismiss}
        />
      );
    }
    if (picked) {
      return (
        <ToolsPanel
          item={picked.item}
          onClose={onDismiss}
          onPick={(item, tool) => {
            onRunTool?.(item, tool);
            // Dismissed immediately: the run outlives this menu, and a menu
            // left open over the item would hide the change it is making.
            onDismiss();
          }}
        />
      );
    }
    return null;
  })();

  const rows = panel ?? (
    <MenuRows
      items={items}
      menu={menu}
      onArrange={onArrange}
      onBringToFront={onBringToFront}
      onCollect={(urls) => setCollecting({ for: menu, urls })}
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
      onSaveRecipe={
        onSaveRecipe
          ? (chosen) => setSavingRecipe({ for: menu, items: chosen, name: "" })
          : undefined
      }
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
        {rows}
      </div>
    </>
  );
}
