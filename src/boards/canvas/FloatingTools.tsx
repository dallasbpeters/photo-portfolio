import type { BoardItem, BoardWire } from "../../types";
import { AutoplayToggle } from "../AutoplayToggle";
import { BoardDrawTools } from "../BoardDrawTools";
import type { DrawStyle } from "../DrawToolbar";
import type { DrawTool } from "../drawing";
import { MaskControls } from "../MaskControls";
import type { MaskConfig } from "../mask";
import { ShaderPanel } from "../shaderControls/ShaderPanel";
import { wiredImageFor } from "./wiredPreviews";

/**
 * The tools that float over the canvas, near whatever is selected.
 *
 * Grouped because they share one rule: each belongs to the *selection* rather
 * than to the board, and each would be wrong drawn on top of its own subject.
 * MaskControls says so directly — "chrome on top of the very thing the mask has
 * to be judged against" — and the shader settings used to prove it, rendering
 * inside the item and covering up to 85% of the shader they were adjusting.
 *
 * Two placements, because two shapes. The brush and mask controls are a strip
 * of buttons and sit along the bottom. The shader panel is a panel: fifteen to
 * twenty controls across several groups, and anchored to the bottom it ran out
 * of room before reaching the last of them — the ink colours rendered correctly
 * and simply could not be scrolled to. It gets a full-height column down the
 * right, which has space for all of them and leaves the picture visible beside
 * it.
 */

export interface FloatingToolsProps {
  drawStyle: DrawStyle;
  drawTool: DrawTool | null;
  items: BoardItem[];
  onConfigChange: (itemId: string, config: Record<string, unknown>) => void;
  onExportShader: (item: BoardItem) => Promise<void>;
  onMaskChange: (itemId: string, next: MaskConfig | null) => void;
  onStyle: (style: DrawStyle) => void;
  onTool: (tool: DrawTool | null) => void;
  selected: BoardItem | null;
  wires: BoardWire[];
}

export function FloatingTools({
  drawStyle,
  drawTool,
  items,
  onConfigChange,
  onExportShader,
  onMaskChange,
  onStyle,
  onTool,
  selected,
  wires,
}: FloatingToolsProps) {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
        <div className="pointer-events-auto">
          <AutoplayToggle items={items} />
          <MaskControls onChange={onMaskChange} selected={selected} />
          <BoardDrawTools
            onConfigChange={onConfigChange}
            onStyle={onStyle}
            onTool={onTool}
            selected={selected}
            style={drawStyle}
            tool={drawTool}
          />
        </div>
      </div>

      <div className="pointer-events-none absolute top-4 right-4 bottom-4 z-20 flex w-72 justify-end">
        <ShaderPanel
          imageUrl={
            selected ? wiredImageFor(selected.id, { items, wires }) : null
          }
          onConfigChange={onConfigChange}
          onExport={onExportShader}
          selected={selected}
        />
      </div>
    </>
  );
}
