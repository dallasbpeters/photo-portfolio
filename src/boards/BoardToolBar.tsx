import type { RefObject } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { BoardItem } from "../types";
import { PANEL_GAP } from "./geometry/panelPlacement";
import { isVideoUrl } from "./isVideo";
import { ToolPicker } from "./ToolPicker";
import { ToolPrompt } from "./ToolPrompt";
import { imageOf, toolContextOf } from "./tools/itemContext";
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
  /**
   * Opens the manual editor on this item. Absent when there is no board to save
   * to — the editor's whole purpose is producing a version to keep.
   */
  onEditManually?: () => void;
  /** Runs the tool. The words come from the picker when the tool needs them. */
  onRun: (
    tool: Tool,
    prompt?: string,
    config?: Record<string, unknown>
  ) => void;
}

export function BoardToolBar({
  anchor,
  chromeScale,
  isRunning,
  item,
  onEditManually,
  onRun,
}: BoardToolBarProps) {
  const [picking, setPicking] = useState(false);
  /**
   * A tool from the bar that still needs words.
   *
   * The bar's buttons used to call `onRun` straight out, which meant Edit ran
   * on whatever the item happened to carry and was refused for having nothing —
   * "needs a description" with no field in sight. Both paths in now lead through
   * the same step: the picker sets this, and so does a button.
   */
  const [pending, setPending] = useState<Tool | null>(null);
  const { panelRef, placement } = useAnchoredPanel(anchor);
  const above = placement === "above";

  const context = toolContextOf(item);
  // A clip has a URL and so passes `hasImage`, but the photo editor draws its
  // source into a canvas — handed an mp4 it would open on nothing.
  const canEditByHand =
    Boolean(onEditManually) && !isVideoUrl(imageOf(item) ?? "");
  const applicable = toolsForKind(item.kind);
  // Runnable ones first: the bar is the quick path, and a row that leads with
  // something greyed out spends its space saying no. The blocked ones are still
  // reachable through the picker, which explains why.
  // A tool whose only obstacle is a missing prompt or a missing mask counts as
  // runnable here: pressing it collects the words, or hands over the brush, so
  // `collecting` answers the question the bar is actually asking — could this
  // get somewhere if I pressed it? Greying Replace out instead left the one
  // control that would ungrey it in a different toolbar, unrelated to it.
  const collecting = { ...context, hasMask: true, hasPrompt: true };
  const quick = applicable
    .filter((tool) => blockedReason(tool, collecting) === null)
    .slice(0, BAR_LIMIT);

  /** A press on the bar: run it, or take the next step towards running it. */
  const choose = (tool: Tool) => {
    // The area before the words, and both before the run. Asking what goes
    // there and *then* discovering nothing has been painted would throw the
    // typed answer away — the runner arms the brush and stops, so anything
    // collected first would be collected twice.
    if (tool.needsMask && !context.hasMask) {
      onRun(tool);
      return;
    }
    if (tool.needsPrompt && !context.hasPrompt) {
      setPending(tool);
      return;
    }
    onRun(tool);
  };

  if (applicable.length === 0) {
    return null;
  }

  const panel = pending ? (
    <ToolPrompt
      onCancel={() => setPending(null)}
      onSubmit={(words, config) => {
        const tool = pending;
        setPending(null);
        onRun(tool, words, config);
      }}
      tool={pending}
    />
  ) : (
    <ToolPicker
      className="border-0 shadow-none"
      context={collecting}
      kind={item.kind}
      onClose={() => setPicking(false)}
      onPick={(tool, prompt, config) => {
        setPicking(false);
        onRun(tool, prompt, config);
      }}
    />
  );

  return (
    // The press is stopped here for the same reason the delete button and the
    // resize handles stop theirs: without it the canvas reads a press on a
    // control as the start of a drag, and the item slides out from under the
    // pointer mid-click.
    <div
      // z-50 so it clears the items around it. An item's box is a stacking
      // context (`contain`), so a neighbour drawn later sat over the bar — which
      // reads as the bar being in the wrong place, because the half of it that
      // was covered was the half being aimed at.
      className={`absolute left-0 z-50 w-max ${above ? "bottom-full origin-bottom-left" : "top-full origin-top-left"}`}
      onPointerDown={(e) => e.stopPropagation()}
      ref={panelRef}
      style={{
        // The gap is applied after the counter-scale so it is measured in the
        // scale that survives it — ten screen pixels at any zoom, rather than
        // ten canvas units that shrink to two.
        transform: `${chromeScale.transform} translateY(${above ? -PANEL_GAP : PANEL_GAP}px)`,
      }}
    >
      {/* The bar stays put while a panel is open, and the panel hangs off it.
          Swapping the bar *for* the panel changed this element's height, which
          re-ran the above/below decision and moved the whole thing mid-click —
          the menu appearing somewhere unrelated to the button that opened it. */}
      <div className="flex items-center gap-0.5 rounded-lg border border-board-ink/10 bg-board-surface/90 p-1 backdrop-blur">
        {isRunning ? (
          <span className="px-2 text-[10px] text-sky-300 uppercase tracking-widest">
            Working…
          </span>
        ) : (
          quick.map((tool) => (
            <Button
              key={tool.id}
              // The tool's own label, not an icon: the registry is deliberately
              // React-free and carries no icon, and inventing a mapping here
              // would be a second list to keep in step.
              onClick={() => choose(tool)}
              size="xs"
              title={tool.description}
              variant="ghost"
            >
              {tool.label}
            </Button>
          ))
        )}
        {/* Beside the AI tools rather than buried in the picker: the choice
            between describing a change and making it by hand is the first one,
            not one of thirty. Only for items that have a picture to open. */}
        {canEditByHand && context.hasImage ? (
          <Button
            onClick={() => onEditManually?.()}
            size="xs"
            title="Crop, straighten and grade by hand"
            variant="ghost"
          >
            Edit by hand
          </Button>
        ) : null}
        <Button
          aria-expanded={picking || pending !== null}
          onClick={() => {
            setPending(null);
            setPicking((open) => !open);
          }}
          size="xs"
          title="Every tool for this item"
          variant="ghost"
        >
          Tools…
        </Button>
      </div>

      {/* Hung directly off the bar, on whichever side the bar itself is on, so
          it always reads as belonging to the button that opened it. */}
      {picking || pending ? (
        <div
          className={`absolute left-0 w-max rounded-lg border border-board-ink/15 bg-board-panel/95 shadow-xl backdrop-blur ${
            above ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {panel}
        </div>
      ) : null}
    </div>
  );
}
