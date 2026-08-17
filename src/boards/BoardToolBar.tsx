import type { RefObject } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { BoardItem } from "../types";
import { PANEL_GAP } from "./panelPlacement";
import { ToolPicker } from "./ToolPicker";
import { toolContextOf } from "./tools/itemContext";
import { blockedReason, toolsForKind } from "./tools/registry";
import type { Tool } from "./tools/types";
import { useAnchoredPanel } from "./useAnchoredPanel";

/**
 * The tools for the item you have selected, on the item.
 *
 * The registry has been reachable from the right-click menu for a while, which
 * works but hides it: nobody right-clicks a photograph to find out what can be
 * done to it. A bar that appears on the thing you just clicked is how the tools
 * get discovered at all.
 *
 * Item chrome rather than a floating overlay, following BoardTextTools — a
 * child of the item's box, counter-scaled so it holds its size at any zoom, and
 * flipped below when there is no room above. That way it follows the item
 * through every pan, drag and zoom with no position arithmetic: the transform
 * that moves the item moves the bar.
 *
 * `src/boards/anchorBar.ts` solves the same problem in screen space and has no
 * callers. This is the approach that shipped; that one should go.
 */

/**
 * How many tools sit on the bar before the rest go behind "Tools…".
 *
 * Few, deliberately. The bar's job is to say "there are things you can do
 * here", not to be the whole registry — a row of twelve icons on a small
 * photograph is a menu that happens to be always open, and it covers the
 * picture it belongs to.
 */
const BAR_LIMIT = 3;

interface BoardToolBarProps {
  /** The item's element, measured to decide whether the bar fits above it. */
  anchor: RefObject<HTMLElement | null>;
  /** Cancels the canvas zoom, so the bar is one size at every zoom. */
  chromeScale: { transform: string };
  /** True while a tool is running on this item, so the bar can say so. */
  isRunning: boolean;
  item: BoardItem;
  /** Runs the tool. The words come from the picker when the tool needs them. */
  onRun: (tool: Tool, prompt?: string) => void;
}

export function BoardToolBar({
  anchor,
  chromeScale,
  isRunning,
  item,
  onRun,
}: BoardToolBarProps) {
  const [picking, setPicking] = useState(false);
  const { panelRef, placement } = useAnchoredPanel(anchor);
  const above = placement === "above";

  const context = toolContextOf(item);
  const applicable = toolsForKind(item.kind);
  // Runnable ones first: the bar is the quick path, and a row that leads with
  // something greyed out spends its space saying no. The blocked ones are still
  // reachable through the picker, which explains why.
  const quick = applicable
    .filter((tool) => blockedReason(tool, context) === null)
    .slice(0, BAR_LIMIT);

  if (applicable.length === 0) {
    return null;
  }

  return (
    // The press is stopped here for the same reason the delete button and the
    // resize handles stop theirs: without it the canvas reads a press on a
    // control as the start of a drag, and the item slides out from under the
    // pointer mid-click.
    <div
      className={`absolute left-0 w-max ${above ? "bottom-full origin-bottom-left" : "top-full origin-top-left"}`}
      onPointerDown={(e) => e.stopPropagation()}
      ref={panelRef}
      style={{
        // The gap is applied after the counter-scale so it is measured in the
        // scale that survives it — ten screen pixels at any zoom, rather than
        // ten canvas units that shrink to two.
        transform: `${chromeScale.transform} translateY(${above ? -PANEL_GAP : PANEL_GAP}px)`,
      }}
    >
      {picking ? (
        <ToolPicker
          context={context}
          kind={item.kind}
          onClose={() => setPicking(false)}
          onPick={(tool, prompt) => {
            setPicking(false);
            onRun(tool, prompt);
          }}
        />
      ) : (
        <div className="flex items-center gap-0.5 rounded-lg border border-board-ink/10 bg-board-surface/90 p-1 backdrop-blur">
          {isRunning ? (
            <span className="px-2 text-[10px] text-sky-300 uppercase tracking-widest">
              Working…
            </span>
          ) : (
            quick.map((tool) => (
              <Button
                key={tool.id}
                // The tool's own label, not an icon: the registry is
                // deliberately React-free and carries no icon, and inventing a
                // mapping here would be a second list to keep in step.
                onClick={() => onRun(tool)}
                size="xs"
                title={tool.description}
                variant="ghost"
              >
                {tool.label}
              </Button>
            ))
          )}
          <Button
            onClick={() => setPicking(true)}
            size="xs"
            title="Every tool for this item"
            variant="ghost"
          >
            Tools…
          </Button>
        </div>
      )}
    </div>
  );
}
