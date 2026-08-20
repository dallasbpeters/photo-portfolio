import type { BoardItem } from "../../types";
import { type DrawStyle, DrawToolbar } from "./DrawToolbar";
import { type DrawTool, isDrawingConfig, NO_FILL } from "./drawing";

/**
 * The drawing toolbar, bound either to the selected mark or to the next one.
 *
 * Kept out of the editor because the choice between those two is a small piece
 * of logic with its own rule, and the editor is already the largest component
 * in the project.
 *
 * The rule: with a drawing selected, the controls edit *that mark*. With
 * nothing selected they set what the next mark will look like. Picking a color
 * and watching the selected shape ignore it is the behaviour anyone would call
 * broken — which is exactly what happened before this existed.
 *
 * A drawing only. Selecting a photograph and changing a color must not
 * silently rewrite the pen settings, and there is nothing on a photograph for
 * these controls to mean.
 */

interface BoardDrawToolsProps {
  onConfigChange: (itemId: string, config: Record<string, unknown>) => void;
  onStyle: (style: DrawStyle) => void;
  onTool: (tool: DrawTool | null) => void;
  selected: BoardItem | null;
  style: DrawStyle;
  tool: DrawTool | null;
}

export function BoardDrawTools({
  onConfigChange,
  onStyle,
  onTool,
  selected,
  style,
  tool,
}: BoardDrawToolsProps) {
  const editing =
    selected?.kind === "drawing" && isDrawingConfig(selected.config)
      ? { config: selected.config, id: selected.id }
      : null;

  const shown: DrawStyle = editing
    ? {
        fill: editing.config.fill ?? NO_FILL,
        stroke: editing.config.stroke,
        strokeWidth: editing.config.strokeWidth,
      }
    : style;

  return (
    <DrawToolbar
      onStyle={(next) => {
        if (editing) {
          onConfigChange(editing.id, {
            ...editing.config,
            fill: next.fill,
            stroke: next.stroke,
            strokeWidth: next.strokeWidth,
          });
          return;
        }
        onStyle(next);
      }}
      onTool={onTool}
      style={shown}
      tool={tool}
    />
  );
}
