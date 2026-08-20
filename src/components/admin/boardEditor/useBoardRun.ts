import { useCallback } from "react";
import { toast } from "sonner";
import {
  DEFAULT_FRAME_HEIGHT,
  DEFAULT_FRAME_WIDTH,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
} from "../../../../config/canvas.js";
import { containedBy } from "../../../../config/graph.js";
import { MAX_SHADER_RENDERS } from "../../../../config/nodes/limits.js";
import { renderHalftone } from "../../../boards/canvas/renderShaderNode";
import { wiredImagesFor } from "../../../boards/canvas/wiredPreviews";
import { compositeSources, renderComposite } from "../../../boards/composite";
import {
  maskOf,
  naturalSizeOf,
  rasterizeMask,
} from "../../../boards/drawing/mask";
import { configFromSource } from "../../../boards/elementNode";
import { FRAME_PAD } from "../../../boards/geometry/arrange";
import { newItemId } from "../../../boards/newItemId";
import type { PortTarget } from "../../../boards/panels/PortMenu";
import { portfolioService } from "../../../services/portfolioService";
import type { BoardItem, BoardWire } from "../../../types";
import { BLANK_ITEM, PORT_SPAWN_GAP } from "./placement";

/**
 * What a run needs before it starts, and what it does with what comes back.
 *
 * Lifted out of BoardEditor.tsx, which had no room left to grow. Four callbacks
 * that only make sense together: where a node's results should land, how a
 * finished run is merged in, how a node created from a port gets wired, and the
 * flush that has to happen before any of it.
 *
 * The flush is the part worth keeping visible. The server runs the *stored*
 * graph, and the canvas saves on a debounce — so without forcing a save first, a
 * run reads a board that is up to a second and a bit out of date, and pays for a
 * picture made from the wrong inputs.
 *
 * A finished run is merged into the item rather than reloading the board: the
 * canvas is the source of truth for everything else while it is open, and a
 * reload would throw away whatever was dragged during the two minutes the node
 * was working.
 */
export interface BoardRunDeps {
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
  wires: BoardWire[];
}

/** One retry, because a blob store refusing once is usually a blip. */
const uploadRender = async (blob: Blob): Promise<string> => {
  const send = async () =>
    (
      await portfolioService.uploadImageFile(
        new File([blob], "halftone.png", { type: "image/png" }),
        undefined,
        "boards/shaders"
      )
    ).url;
  try {
    return await send();
  } catch {
    return await send();
  }
};

/**
 * One rendered, uploaded file per wired picture, in order.
 *
 * Strictly one render at a time. Each mounts a WebGPU canvas and holds it until
 * it has a frame, and a dozen at once contend for the same device and time out
 * together rather than any of them finishing.
 *
 * **A failure keeps its place rather than collapsing the list.** The run asks
 * for variation N and gets entry N, so a dropped entry would hand every
 * later variation the wrong picture — and a single failed upload used to throw
 * away all twenty-two renders, because one exception abandoned the whole batch.
 * A blank stands in, which the server reads as "not rendered" and refuses for
 * that variation alone.
 *
 * An empty list still renders once, with no source, so the node's own error —
 * "wire a picture into this node" — is what reaches the toast.
 */
const renderEach = async (
  config: Record<string, unknown>,
  sources: string[]
): Promise<{ failures: string[]; urls: string[] }> => {
  const urls: string[] = [];
  const failures: string[] = [];
  for (const source of sources.length > 0 ? sources : [null]) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one GPU, one canvas at a time
      const blob = await renderHalftone(config, source);
      urls.push(await uploadRender(blob));
    } catch (err) {
      urls.push("");
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { failures, urls };
};

export const useBoardRun = (deps: BoardRunDeps) => {
  const { items, pending, save, setIsDirty, setItems, setWires, wires } = deps;

  /**
   * Applies what a run came back with.
   *
   * Merged into the item rather than reloading the board: the canvas is the
   * source of truth for everything else while it is open, and a reload would
   * throw away whatever was dragged during the two minutes the node was
   * working. The server stays authoritative — the next load corrects this.
   */
  /** The frame, if any, this node has been told to collect its results into. */
  const collectorFor = useCallback(
    (itemId: string): string | null =>
      wires.find(
        (wire) => wire.sourceItemId === itemId && wire.targetPort === "collect"
      )?.targetItemId ?? null,
    [wires]
  );

  const applyRun = useCallback(
    (itemId: string, patch: Partial<BoardItem>) => {
      setItems((current) => {
        const next = current.map((item) => {
          if (item.id !== itemId) {
            return item;
          }
          const merged = { ...item, ...patch };
          // Show what was just made. The selection is what a node displays and
          // what it hands downstream, so leaving it on an older version after a
          // run means watching a generation finish and seeing nothing change.
          const versions = merged.result?.history;
          if (patch.result && Array.isArray(versions) && versions.length > 0) {
            merged.config = {
              ...merged.config,
              selectedVersion: versions.length - 1,
            };
          }
          return merged;
        });

        // A node wired into a frame has said where its results belong, so a
        // finished run moves itself there rather than leaving the images piled
        // on top of whatever produced them.
        const collector = collectorFor(itemId);
        if (patch.runState !== "succeeded" || !collector) {
          return next;
        }
        const frame = next.find((item) => item.id === collector);
        if (!frame) {
          return next;
        }
        // Tiled in arrival order so a batch fills the frame instead of
        // stacking in one corner. Counted excluding the node being placed, so
        // it takes the next free slot rather than the one it already holds.
        const taken = containedBy(frame, next).filter(
          (item) => item.id !== itemId
        ).length;
        return next.map((item) =>
          item.id === itemId
            ? {
                ...item,
                x: frame.x + FRAME_PAD + (taken % 3) * (item.width + FRAME_PAD),
                y:
                  frame.y +
                  FRAME_PAD +
                  Math.floor(taken / 3) * (item.height + FRAME_PAD),
              }
            : item
        );
      });
    },
    [collectorFor, setItems]
  );

  /**
   * Creates whatever a clicked port should feed, already wired to it.
   *
   * Placed to the right of its source rather than at the usual drop point: a
   * node made from a port belongs beside the thing that feeds it, and a graph
   * that lays itself out left to right stays readable without being tidied.
   */
  const createFromPort = useCallback(
    (sourceItemId: string, sourcePort: string, target: PortTarget) => {
      const source = items.find((item) => item.id === sourceItemId);
      if (!source) {
        return;
      }
      const id = newItemId();
      const isFrame = target.kind === "frame";
      const width = isFrame ? DEFAULT_FRAME_WIDTH : DEFAULT_NODE_WIDTH;
      const height = isFrame ? DEFAULT_FRAME_HEIGHT : DEFAULT_NODE_HEIGHT;

      setItems((current) => [
        ...current,
        {
          ...BLANK_ITEM,
          ...(isFrame
            ? { body: "" }
            : { config: configFromSource(source), runState: "idle" }),
          height,
          id,
          kind: isFrame ? "frame" : "op",
          nodeType: target.nodeType,
          width,
          x: source.x + source.width + PORT_SPAWN_GAP,
          // Centred on the source, so the wire runs straight rather than
          // diving to a corner.
          y: source.y + source.height / 2 - height / 2,
          z: current.length + 1,
        } as BoardItem,
      ]);
      setWires((current) => [
        ...current,
        {
          id: newItemId(),
          sourceItemId,
          sourcePort,
          targetItemId: id,
          targetPort: target.inputKey,
        },
      ]);
      setIsDirty(true);
    },
    [items, setWires, setIsDirty, setItems]
  );

  /**
   * Unsaved work has to reach the server before anything runs.
   *
   * The run endpoint resolves a node's inputs from the *stored* graph rather
   * than from the request, so a wire drawn or a prompt typed in the last second
   * would otherwise be invisible to it.
   */
  const flushBeforeRun = useCallback(async () => {
    // Masks are rendered here rather than as they are painted. A stroke is one
    // of many, and uploading a bitmap per stroke would spend a request on every
    // brush movement — while a run is the first moment the mask has to exist as
    // a picture. `maskUrl` is cleared whenever the mask changes, so anything
    // still holding one is already current.
    const rendered = await Promise.all(
      pending.current.items.map(async (item) => {
        const mask = maskOf(item.config);
        const config = item.config ?? {};
        if (!(mask && item.imageUrl) || typeof config.maskUrl === "string") {
          return item;
        }
        try {
          const size = await naturalSizeOf(item.imageUrl);
          const blob = await rasterizeMask(mask, size);
          const { url } = await portfolioService.uploadImageFile(
            new File([blob], "mask.png", { type: "image/png" }),
            undefined,
            "boards/masks"
          );
          return { ...item, config: { ...config, maskUrl: url } };
        } catch (err) {
          // Reported rather than swallowed: without a mask the run would
          // repaint the whole picture, which looks like the mask being ignored.
          toast.error(
            err instanceof Error ? err.message : "Could not prepare the mask"
          );
          return item;
        }
      })
    );

    /* Shaders are rendered here for the same reason composites are: only the
       browser can run one, and a run is the first moment it has to exist as a
       file. Rendered offscreen at a fixed size rather than photographed from
       the board, so an export does not change resolution because someone
       resized a node. `renderUrls` is cleared on any edit — see dropComposites
       — so a list that survived to here is current.

       One render per wired picture, because a wire can carry many: a Batch node
       or a frame hands over everything it holds, and the server already fans a
       shader run out into one variation per source image. Rendering only the
       first meant every variation of a batch came back as the same picture. */
    const shaded = await Promise.all(
      rendered.map(async (item) => {
        if (item.nodeType !== "standard") {
          return item;
        }
        const config = item.config ?? {};
        if (Array.isArray(config.renderUrls) && config.renderUrls.length > 0) {
          return item;
        }
        const sources = wiredImagesFor(item.id, {
          items: pending.current.items,
          wires: pending.current.wires,
        }).slice(0, MAX_SHADER_RENDERS);
        const { failures, urls } = await renderEach(config, sources);
        if (urls.every((url) => !url)) {
          // Nothing at all. Left unstored so the node still reads as never
          // rendered rather than as rendered blank.
          toast.error(failures[0] ?? "Could not render the halftone");
          return item;
        }
        if (failures.length > 0) {
          toast.warning(
            `${failures.length} of ${urls.length} could not be rendered: ${failures[0]}`
          );
        }
        return {
          ...item,
          // renderUrl kept alongside: it is what a board saved before batches
          // carries, and what the server falls back to for variation 0.
          config: { ...config, renderUrl: urls[0], renderUrls: urls },
        };
      })
    );

    // Composites are rendered here for the same reason masks are: only the
    // browser knows the arrangement, and a run is the first moment it has to
    // exist as a file. `compositeUrl` is cleared whenever anything feeding the
    // node moves — see change() — so one still holding a URL is current.
    const composed = await Promise.all(
      shaded.map(async (item) => {
        if (item.nodeType !== "composite") {
          return item;
        }
        const config = item.config ?? {};
        if (typeof config.compositeUrl === "string") {
          return item;
        }
        try {
          const layers = compositeSources(
            item,
            pending.current.items,
            pending.current.wires
          );
          const background =
            typeof config.background === "string"
              ? config.background
              : "transparent";
          const blob = await renderComposite(layers, background);
          const { url } = await portfolioService.uploadImageFile(
            new File([blob], "composite.png", { type: "image/png" }),
            undefined,
            "boards/composites"
          );
          return { ...item, config: { ...config, compositeUrl: url } };
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : "Could not build the composite"
          );
          return item;
        }
      })
    );

    const changed = composed.some(
      (item, i) => item !== pending.current.items[i]
    );
    if (changed) {
      setItems(composed);
      // Saved explicitly with these items: the run reads the board from the
      // database, and React has not re-rendered with them yet.
      await save({ items: composed });
      return;
    }
    if (pending.current.isDirty) {
      await save();
    }
  }, [
    save,
    pending.current.wires,
    pending.current.items,
    setItems,
    pending.current.isDirty,
  ]);

  return { applyRun, createFromPort, flushBeforeRun };
};
