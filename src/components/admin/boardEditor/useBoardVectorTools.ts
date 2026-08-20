import { useCallback } from "react";
import { toast } from "sonner";
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
} from "../../../../config/canvas.js";
import { OUTPUT_PORT_KEY } from "../../../../config/ports.js";
import { useAffinityBridge } from "../../../boards/hooks/useAffinityBridge";
import { useBoardImageEditor } from "../../../boards/hooks/useBoardImageEditor";
import type { AffinityWriteback } from "../../../boards/io/affinity";
import { isSvgUrl } from "../../../boards/io/affinity";
import { newItemId } from "../../../boards/io/newItemId";
import { outputImageOf } from "../../../boards/itemOutput";
import type { BoardItem, BoardItemResult, BoardWire } from "../../../types";
import { BLANK_ITEM, PORT_SPAWN_GAP } from "./placement";

/**
 * The vector round trip: out to Affinity or the built-in editor, and back.
 *
 * Lifted out of BoardEditor.tsx, which had no room left to grow. All of it
 * hangs off one function — `applyEditedSvg` — so keeping the two bridge hooks
 * here beside it is what stops the writeback contract being described in one
 * file and honoured in another.
 *
 * That contract is worth restating: the run endpoint owns `result`, the canvas
 * owns `config`. An edit therefore lands as a new entry in the node's history
 * and moves `selectedVersion` to it, rather than overwriting anything. An item
 * with no result — a plain reference whose source is the SVG — has no versions,
 * so its picture is simply replaced.
 */
export interface BoardVectorDeps {
  boardId: string;
  /** Runs one node — vectorising is a Generate run like any other. */
  graphRun: { runNode: (itemId: string, force: boolean) => Promise<void> };
  items: BoardItem[];
  /** The latest state, kept in a ref so a callback never reads a stale copy. */
  pending: React.RefObject<{
    isDirty: boolean;
    isLoaded: boolean;
    items: BoardItem[];
    wires: BoardWire[];
  }>;
  /** `override` lets a caller save items it has only just computed. */
  save: (override?: {
    items?: BoardItem[];
    wires?: BoardWire[];
  }) => Promise<void>;
  setIsDirty: (dirty: boolean) => void;
  setItems: React.Dispatch<React.SetStateAction<BoardItem[]>>;
  setWires: React.Dispatch<React.SetStateAction<BoardWire[]>>;
}

export const useBoardVectorTools = (deps: BoardVectorDeps) => {
  const {
    boardId,
    graphRun,
    items,
    pending,
    save,
    setIsDirty,
    setItems,
    setWires,
  } = deps;

  /**
   * The edit Affinity made, stored into the node's state.
   *
   * Same contract as removing a version: the endpoint owns `result`, the canvas
   * owns `config`, so the selected version moves here to the newest entry. An
   * item without a result — a reference whose source is the SVG — has no
   * versions, so the edit simply replaces the picture it shows.
   */
  const applyEditedSvg = useCallback(
    (itemId: string, writeback: AffinityWriteback) => {
      setItems((current) =>
        current.map((item) => {
          if (item.id !== itemId) {
            return item;
          }
          if (writeback.result) {
            const result = writeback.result as BoardItemResult;
            const historyLength = result.history?.length ?? 0;
            return {
              ...item,
              config: {
                ...item.config,
                selectedVersion: Math.max(0, historyLength - 1),
              },
              result,
            };
          }
          if (writeback.imageUrl) {
            return {
              ...item,
              imageUrl: writeback.imageUrl,
              thumbUrl: writeback.imageUrl,
            };
          }
          return item;
        })
      );
      setIsDirty(true);
    },
    [setIsDirty, setItems]
  );

  const { openInAffinity } = useAffinityBridge(boardId, applyEditedSvg);
  const { editorNode, openEditor } = useBoardImageEditor(
    boardId,
    applyEditedSvg
  );

  /**
   * Opens a node's SVG in Affinity Designer, through the local bridge.
   *
   * The bridge download-and-opens; edits are picked up by the bridge's poll and
   * written back through the app, so a save in Affinity is all the user needs
   * to do to land a new version on the node.
   */
  const openItemInAffinity = async (itemId: string) => {
    const node = items.find((item) => item.id === itemId);
    const url = node ? outputImageOf(node, items) : null;
    if (!(node && url)) {
      toast.error("That node has no image to edit");
      return;
    }
    if (!isSvgUrl(url)) {
      toast.error("Only SVG results can be opened in Affinity");
      return;
    }
    try {
      await openInAffinity(itemId, url);
      toast.success("Open in Affinity — save there and it comes back");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not open Affinity"
      );
    }
  };

  /** The model that traces a picture into vector art. A Generate node runs it. */
  const VECTORIZE_MODEL = "fal-ai/recraft/vectorize";

  /**
   * Traces a placed image into vector art, in one gesture.
   *
   * Runs the Recraft vectorizer by building what the canvas would: a Generate
   * node set to that model, the picture wired into its image port, then a run.
   * Placed beside the source so the wire is short and the result obvious.
   *
   * Saved before it runs, because the run endpoint reads the *stored* graph —
   * the same rule every other run obeys — so the node has to exist in the
   * database before its inputs are resolved.
   */
  const vectorizeItem = async (itemId: string) => {
    const source = pending.current.items.find((item) => item.id === itemId);
    if (
      !(
        source &&
        (source.kind === "photo" || source.kind === "reference") &&
        source.imageUrl
      )
    ) {
      toast.error("That placed image has nothing to vectorize");
      return;
    }
    const node: BoardItem = {
      ...BLANK_ITEM,
      config: { model: VECTORIZE_MODEL },
      height: DEFAULT_NODE_HEIGHT,
      id: newItemId(),
      kind: "op",
      nodeType: "generate",
      runState: "idle",
      width: DEFAULT_NODE_WIDTH,
      x: source.x + source.width + PORT_SPAWN_GAP,
      y: source.y + source.height / 2 - DEFAULT_NODE_HEIGHT / 2,
      z: pending.current.items.length + 1,
    };
    const wire: BoardWire = {
      id: newItemId(),
      sourceItemId: source.id,
      sourcePort: OUTPUT_PORT_KEY,
      targetItemId: node.id,
      targetPort: "image",
    };
    const nextItems = [...pending.current.items, node];
    const nextWires = [...pending.current.wires, wire];
    setItems(nextItems);
    setWires(nextWires);
    setIsDirty(true);
    try {
      await save({ items: nextItems, wires: nextWires });
      await graphRun.runNode(node.id, false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not vectorize the image"
      );
    }
  };

  return { editorNode, openEditor, openItemInAffinity, vectorizeItem };
};
