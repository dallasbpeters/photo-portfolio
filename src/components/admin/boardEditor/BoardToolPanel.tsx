import { HugeiconsIcon } from "@hugeicons/react";
import {
  FrameIcon,
  Image01Icon,
  LinkSquare01Icon,
  MagicWand01Icon,
  NotebookIcon,
  PaintBoardIcon,
  RepeatIcon,
  SearchVisualIcon,
  SparklesIcon,
  TextIcon,
} from "@hugeicons-pro/core-stroke-standard";
import { motion } from "motion/react";
import type { NodeTypeId } from "../../../../config/nodeTypes.js";
import { Button } from "../../ui/button";

/**
 * The insert rail down the left of the board.
 *
 * Lifted out of BoardEditor.tsx, which had no room left to grow. It is a list of
 * buttons and nothing else — every handler comes from a hook — so this file can
 * be read as "what you can add to a board" without working out what any of it
 * does.
 *
 * Placing a node costs nothing. Everything here arrives idle and unwired and
 * does not spend until it is run, which is Principle VI's rule that a paid
 * operation is never a side effect of editing.
 */
export interface BoardToolPanelProps {
  onAddFrame: () => void;
  onAddNode: (nodeType: NodeTypeId, config?: Record<string, unknown>) => void;
  onAddWritable: (kind: "note" | "text") => void;
  onTogglePicker: () => void;
}

export function BoardToolPanel({
  onAddFrame,
  onAddNode,
  onAddWritable,
  onTogglePicker,
}: BoardToolPanelProps) {
  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className="board-panel board-panel--column top-20 left-4 z-20 grid place-items-stretch justify-stretch gap-2 rounded bg-board-surface text-board-ink"
      initial={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.5 }}
    >
      <Button
        fullWidthLeft
        onClick={() => onAddWritable("note")}
        type="button"
        variant="noborder"
      >
        <HugeiconsIcon aria-hidden icon={NotebookIcon} size={14} />
        Note
      </Button>
      <Button
        fullWidthLeft
        onClick={() => onAddWritable("text")}
        type="button"
        variant="noborder"
      >
        <HugeiconsIcon aria-hidden icon={TextIcon} size={14} />
        Text
      </Button>
      <Button
        fullWidthLeft
        onClick={onTogglePicker}
        type="button"
        variant="noborder"
      >
        <HugeiconsIcon aria-hidden icon={Image01Icon} size={14} />
        Image
      </Button>
      <Button
        fullWidthLeft
        onClick={() => onAddNode("generate")}
        type="button"
        variant="noborder"
      >
        <HugeiconsIcon aria-hidden icon={SparklesIcon} size={14} />
        Generate
      </Button>
      <Button
        fullWidthLeft
        onClick={() => onAddNode("describe")}
        type="button"
        variant="noborder"
      >
        <HugeiconsIcon aria-hidden icon={SearchVisualIcon} size={14} />
        Analyse
      </Button>
      <Button
        fullWidthLeft
        onClick={() => onAddNode("join")}
        type="button"
        variant="noborder"
      >
        <HugeiconsIcon aria-hidden icon={LinkSquare01Icon} size={14} />
        Combine
      </Button>
      <Button
        fullWidthLeft
        onClick={() => onAddNode("iterate")}
        type="button"
        variant="noborder"
      >
        <HugeiconsIcon aria-hidden icon={RepeatIcon} size={14} />
        Iterate
      </Button>
      <Button
        fullWidthLeft
        onClick={() => onAddNode("icon")}
        type="button"
        variant="noborder"
      >
        <HugeiconsIcon aria-hidden icon={MagicWand01Icon} size={14} />
        Icon
      </Button>
      <Button
        fullWidthLeft
        onClick={() => onAddNode("palette")}
        type="button"
        variant="noborder"
      >
        <HugeiconsIcon aria-hidden icon={PaintBoardIcon} size={14} />
        Palette
      </Button>
      <Button
        fullWidthLeft
        onClick={() => onAddNode("prompt")}
        type="button"
        variant="noborder"
      >
        <HugeiconsIcon aria-hidden icon={TextIcon} size={14} />
        Prompt
      </Button>
      <Button
        fullWidthLeft
        onClick={onAddFrame}
        type="button"
        variant="noborder"
      >
        <HugeiconsIcon aria-hidden icon={FrameIcon} size={14} />
        Frame
      </Button>
    </motion.div>
  );
}
