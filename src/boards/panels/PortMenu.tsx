import { HugeiconsIcon } from "@hugeicons/react";
import {
  FileStackIcon,
  FrameIcon,
  GroupLayersIcon,
  LinkSquare01Icon,
  MagicWand01Icon,
  PaintBoardIcon,
  RepeatIcon,
  SearchVisualIcon,
  SparklesIcon,
  TextIcon,
} from "@hugeicons-pro/core-stroke-standard";
import { inputPortsFor } from "../../../config/graph.js";
import {
  NODE_TYPES,
  type NodeTypeId,
  type PortType,
} from "../../../config/nodeTypes.js";
import "../boardChrome.css";

/** What clicking a port can create, and what to wire it into. */
export interface PortTarget {
  /** The input port on the new item that the wire lands on. */
  inputKey: string;
  kind: "op" | "frame";
  label: string;
  nodeType: NodeTypeId | null;
}

const ICONS: Record<string, typeof SparklesIcon> = {
  batch: FileStackIcon,
  composite: GroupLayersIcon,
  describe: SearchVisualIcon,
  frame: FrameIcon,
  generate: SparklesIcon,
  icon: MagicWand01Icon,
  iterate: RepeatIcon,
  join: LinkSquare01Icon,
  palette: PaintBoardIcon,
  prompt: TextIcon,
};

/**
 * Everything a port of this type could sensibly feed.
 *
 * Derived from the registry rather than listed, so a node type added later
 * turns up here without anyone remembering to add it — the same reason the
 * registry exists at all.
 *
 * A Prompt node is excluded: it takes no inputs, so there is nothing for a wire
 * to land on and offering it would create a node that sits unconnected.
 */
export const targetsFor = (type: PortType): PortTarget[] => {
  const targets: PortTarget[] = [];

  for (const node of Object.values(NODE_TYPES)) {
    const port = node.inputs.find((input) => input.type === type);
    if (port) {
      targets.push({
        inputKey: port.key,
        kind: "op",
        label: node.label,
        nodeType: node.id,
      });
    }
  }

  // A frame collects images, which makes it a destination as much as a source:
  // "put everything this produces over there".
  const frameInput = inputPortsFor({ id: "", kind: "frame" }).find(
    (input) => input.type === type
  );
  if (frameInput) {
    targets.push({
      inputKey: frameInput.key,
      kind: "frame",
      label: "Frame",
      nodeType: null,
    });
  }

  return targets;
};

interface PortMenuProps {
  onChoose: (target: PortTarget) => void;
  onDismiss: () => void;
  /** Screen position of the port that was clicked. */
  point: { x: number; y: number };
  portType: PortType;
}

/**
 * The menu a port offers when it is clicked rather than dragged.
 *
 * Dragging says "connect this to something that already exists"; clicking says
 * "I know what should come next, make it" — and the node arrives already wired,
 * which is the whole saving. Both gestures start on the same handle because
 * they are the same intent at different stages of knowing what you want.
 *
 * Positioned in screen pixels rather than canvas units: it is chrome, so it
 * should be the same size and in the same place whatever the zoom.
 */
export function PortMenu({
  onChoose,
  onDismiss,
  point,
  portType,
}: PortMenuProps) {
  const targets = targetsFor(portType);
  if (targets.length === 0) {
    return null;
  }

  return (
    <>
      {/* Catches the next click anywhere, so the menu closes the way every
          other menu does rather than needing its own dismiss button. */}
      <button
        aria-label="Dismiss"
        className="panel-scrim"
        onClick={onDismiss}
        tabIndex={-1}
        type="button"
      />
      <div
        className="panel-surface panel-popover"
        style={{ left: point.x + 10, top: point.y - 8 }}
      >
        <p className="panel-popover__title">Send {portType} to</p>
        {targets.map((target) => (
          <button
            className="panel-row panel-row--compact"
            key={`${target.kind}-${target.nodeType ?? "frame"}`}
            onClick={() => onChoose(target)}
            type="button"
          >
            <HugeiconsIcon
              aria-hidden
              icon={ICONS[target.nodeType ?? "frame"] ?? SparklesIcon}
              size={13}
            />
            {target.label}
          </button>
        ))}
      </div>
    </>
  );
}
