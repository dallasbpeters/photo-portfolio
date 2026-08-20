import { toast } from "sonner";
import {
  DEFAULT_FRAME_HEIGHT,
  DEFAULT_FRAME_WIDTH,
  DEFAULT_IMAGE_HEIGHT,
  DEFAULT_IMAGE_WIDTH,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH,
  DEFAULT_SHADER_HEIGHT,
  DEFAULT_SHADER_WIDTH,
  DEFAULT_TEXT_HEIGHT,
  DEFAULT_TEXT_WIDTH,
} from "../../../../config/canvas.js";
import { containedBy } from "../../../../config/graph.js";
import type { NodeTypeId } from "../../../../config/nodeTypes.js";
import { elementConfig } from "../../../boards/elementNode";
import { gridLayout, readingOrder } from "../../../boards/geometry/arrange";
import { findFreeSpot } from "../../../boards/geometry/placement";
import { outputImagesOf, outputTextOf } from "../../../boards/itemOutput";
import { newItemId } from "../../../boards/newItemId";
import { newShaderConfig } from "../../../boards/shaderConfig";
import { boardsApi } from "../../../services/portfolioService";
import type { BoardItem, BoardWire, Element, Photo } from "../../../types";
import type { ExternalImage } from "../BoardInsertPanel";
import { BLANK_ITEM, dropOrigin } from "./placement";

/**
 * Everything that puts something new on the board.
 *
 * Eleven closely-related actions lifted out of BoardEditor.tsx, which was two
 * thousand lines and had no room left to grow. They belong together: each one
 * asks where there is space, builds an item, and hands the whole list to
 * `change` — and none of them touches the network except to fetch what it is
 * about to place.
 *
 * Taken as one `deps` object rather than a dozen positional arguments. The list
 * is long because the board's state genuinely is, and naming each dependency at
 * the call site is what keeps the move reviewable: anything this hook can reach
 * is written down here.
 *
 * Nothing here spends money. An operation node arrives idle and unwired and does
 * nothing until it is run, which is Principle VI's rule that a paid operation is
 * never a side effect of editing.
 */
export interface BoardInsertDeps {
  boardId: string;
  /** Replaces the whole item list, recording a history step. */
  change: (next: BoardItem[]) => void;
  /** Somewhere free for a new item, near where you are looking. */
  dropPoint: (
    list: BoardItem[],
    width: number,
    height: number
  ) => { x: number; y: number };
  items: BoardItem[];
  /** Opens a freshly placed note or text item for typing. */
  setAutoEditId: (id: string | null) => void;
  setElementDraft: (
    draft: { description: string; images: string[] } | null
  ) => void;
  setIsPicking: (picking: boolean) => void;
  /** Reports the middle of what is on screen, once the canvas has said. */
  viewCentreRef: { current: (() => { x: number; y: number }) | null };
  wires: BoardWire[];
}

export const useBoardInserts = (deps: BoardInsertDeps) => {
  const {
    boardId,
    change,
    dropPoint,
    items,
    setAutoEditId,
    setElementDraft,
    setIsPicking,
    viewCentreRef,
    wires,
  } = deps;

  /**
   * Adds a note or a plain text item.
   *
   * Both are empty on creation, which the API would reject as malformed — so
   * they only reach a save once something has been typed. That is deliberate:
   * an empty card left on the board is noise, not content.
   */
  const addWritable = (kind: "note" | "text") => {
    const width = kind === "note" ? DEFAULT_NOTE_WIDTH : DEFAULT_TEXT_WIDTH;
    const height = kind === "note" ? DEFAULT_NOTE_HEIGHT : DEFAULT_TEXT_HEIGHT;
    const p = dropPoint(items, width, height);
    const id = newItemId();
    change([
      ...items,
      {
        ...BLANK_ITEM,
        body: "",
        height,
        id,
        kind,
        width,
        x: p.x,
        y: p.y,
        z: items.length + 1,
      },
    ]);
    // Placed to be written in, so it opens for typing immediately.
    setAutoEditId(id);
  };

  /**
   * Adds an operation node.
   *
   * It arrives idle and unwired, and does nothing until it is run. Nothing on
   * this board ever spends money as a side effect of being placed or edited.
   */
  const addNode = (
    nodeType: NodeTypeId,
    config: Record<string, unknown> = {}
  ) => {
    const p = dropPoint(items, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT);
    change([
      ...items,
      {
        ...BLANK_ITEM,
        config,
        height: DEFAULT_NODE_HEIGHT,
        id: newItemId(),
        kind: "op",
        nodeType,
        runState: "idle",
        width: DEFAULT_NODE_WIDTH,
        x: p.x,
        y: p.y,
        z: items.length + 1,
      },
    ]);
  };

  /**
   * Places a saved style on the canvas.
   *
   * The key image, the name and the words are copied onto the node so the
   * canvas can draw them without a request per node. The id travels with them
   * and it is the id the run endpoint reads, so a run sends whatever the
   * library holds now. The copies exist only so a board still shows what it was
   * built with after the element is deleted out from under it.
   *
   * Square-ish, because what it shows is a picture rather than a stack of
   * settings: the tall default node shape left an element mostly empty.
   */
  const addElement = (element: Element) => {
    const size = DEFAULT_NODE_WIDTH;
    const p = dropPoint(items, size, size);
    change([
      ...items,
      {
        ...BLANK_ITEM,
        config: elementConfig(element),
        height: size,
        id: newItemId(),
        kind: "op",
        nodeType: "element",
        runState: "idle",
        width: size,
        x: p.x,
        y: p.y,
        z: items.length + 1,
      },
    ]);
  };

  /**
   * Gathers a selection into the draft the naming panel opens on.
   *
   * The pictures are resolved the way a wire would resolve them, so a frame
   * offers what sits on it and a node offers the version chosen on it — the
   * same list the menu counted. Repeats are dropped: selecting a frame and
   * something on it means one picture, not two.
   *
   * The words come from a Describe node in the selection when there is one —
   * that reading of what the references have in common is what an element
   * carries down the wire — otherwise the panel opens empty to write by hand.
   */
  const beginElement = (chosen: BoardItem[]) => {
    const graph = { items, wires };
    const images = [
      ...new Set(chosen.flatMap((item) => outputImagesOf(item, graph))),
    ];
    if (images.length === 0) {
      toast.error("Nothing in that selection to save");
      return;
    }
    const described = chosen.find((item) => item.nodeType === "describe");
    setElementDraft({
      description: described ? (outputTextOf(described, graph) ?? "") : "",
      images,
    });
  };

  /**
   * Adds a frame: a labelled backdrop for grouping part of a board.
   *
   * Starts large, because a frame that has to be resized before anything fits
   * in it is a frame you have to think about before you can use it. Placed at
   * z 0 so it sits under everything.
   */
  const addFrame = () => {
    const p = dropPoint(items, DEFAULT_FRAME_WIDTH, DEFAULT_FRAME_HEIGHT);
    change([
      ...items,
      {
        ...BLANK_ITEM,
        body: "",
        height: DEFAULT_FRAME_HEIGHT,
        id: newItemId(),
        kind: "frame",
        width: DEFAULT_FRAME_WIDTH,
        x: p.x - DEFAULT_FRAME_WIDTH / 3,
        y: p.y - DEFAULT_FRAME_HEIGHT / 3,
        z: 0,
      },
    ]);
  };

  /**
   * Wraps the selected items in a frame of their own.
   *
   * The way a group of pictures becomes one thing: select them, group them,
   * nudge them about inside the frame, and wire the frame into a Composite —
   * which renders them exactly where they sit. Building that arrangement by
   * dragging an empty frame around existing work is fiddly, and a picture whose
   * centre falls a few pixels outside is silently not in the group.
   *
   * Sized to the selection with room to move, and its z puts it behind
   * everything — a frame over its contents swallows the clicks meant for them.
   */
  const groupIntoFrame = (chosen: BoardItem[]) => {
    if (chosen.length === 0) {
      return;
    }

    // Gathered into a grid rather than framed where they lie. A frame's
    // contents are decided by geometry — anything whose centre falls inside
    // belongs to it — so a frame drawn around a scattered selection also
    // swallows every bystander in that rectangle.
    const ordered = readingOrder(chosen);
    // Measured at the origin, then placed: the size has to be known before a
    // free spot can be found, and the spot before the pictures can be put down.
    const size = gridLayout(ordered, { x: 0, y: 0 });

    // The spot is chosen against the items that are staying put: the selection
    // is about to move, so counting it would push the frame away from a space
    // its own contents are vacating.
    const staying = items.filter(
      (item) => !chosen.some((pick) => pick.id === item.id)
    );
    const spot = findFreeSpot({
      height: size.height,
      items: staying,
      origin: dropOrigin(staying, viewCentreRef.current?.() ?? null),
      width: size.width,
    });
    const left = Math.round(spot.x - size.width / 2);
    const top = Math.round(spot.y - size.height / 2);
    const { at } = gridLayout(ordered, { x: left, y: top });

    const frame: BoardItem = {
      ...BLANK_ITEM,
      body: "",
      height: size.height,
      id: newItemId(),
      kind: "frame",
      width: size.width,
      x: left,
      y: top,
      z: 0,
    };

    change([
      frame,
      ...items.map((item) => {
        const place = at.get(item.id);
        return place ? { ...item, ...place } : item;
      }),
    ]);
    setAutoEditId(frame.id);
  };

  /**
   * Tidies a frame that already exists.
   *
   * The same grid grouping uses, so a frame you tidy and a group you make of
   * the same pictures come out identical. The frame keeps its top-left and is
   * resized to fit — growing from the corner you can see rather than from the
   * middle, which would slide the whole group sideways under the pointer.
   *
   * Order is preserved: the pictures are read top-to-bottom, left-to-right as
   * they sit now, so tidying never scrambles a set that was already sequenced.
   */
  const autoArrange = (frameId: string) => {
    const frame = items.find((item) => item.id === frameId);
    if (frame?.kind !== "frame") {
      return;
    }
    const inside = containedBy(frame, items);
    if (inside.length === 0) {
      toast.error("This frame has nothing in it to arrange");
      return;
    }
    const ordered = readingOrder(inside);
    const { at, height, width } = gridLayout(ordered, {
      x: frame.x,
      y: frame.y,
    });
    change(
      items.map((item) => {
        if (item.id === frame.id) {
          return { ...item, height, width };
        }
        const place = at.get(item.id);
        return place ? { ...item, ...place } : item;
      })
    );
    toast.success(
      inside.length === 1 ? "Arranged" : `Arranged ${inside.length} items`
    );
  };

  /**
   * Downloads everything a node made, or everything a frame holds.
   *
   * The other half of being able to make things in batches: vectorise a frame
   * of twenty stickers and you have twenty files inside a node, reachable only
   * by clicking through them one at a time.
   *
   * The link is clicked rather than followed, so the archive downloads instead
   * of replacing the board — leaving a canvas full of unsaved work is not a
   * reasonable price for fetching a file.
   */
  const exportItem = async (itemId: string) => {
    const toastId = toast.loading("Preparing the download…");
    try {
      const { count, skipped, url } = await boardsApi.exportItem(
        boardId,
        itemId
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "";
      link.rel = "noopener";
      link.click();
      toast.dismiss(toastId);
      toast.success(
        skipped > 0
          ? `${count} file${count === 1 ? "" : "s"} downloaded, ${skipped} could not be read`
          : `${count} file${count === 1 ? "" : "s"} downloaded`
      );
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(
        err instanceof Error ? err.message : "Could not build the archive"
      );
    }
  };

  /**
   * Places a shader on the canvas.
   *
   * Only the effect's name is stored. Its parameters stay absent until one is
   * changed, so the package's own defaults keep applying — a package update
   * improves an existing board rather than being overridden by values copied
   * out of it at the moment it was placed.
   */
  const addShader = (name: string) => {
    const p = dropPoint(items, DEFAULT_SHADER_WIDTH, DEFAULT_SHADER_HEIGHT);
    change([
      ...items,
      {
        ...BLANK_ITEM,
        config: newShaderConfig(name) as unknown as Record<string, unknown>,
        height: DEFAULT_SHADER_HEIGHT,
        id: newItemId(),
        kind: "shader",
        width: DEFAULT_SHADER_WIDTH,
        x: p.x,
        y: p.y,
        z: items.length + 1,
      },
    ]);
    setIsPicking(false);
  };

  const addPhoto = (photo: Photo) => {
    const p = dropPoint(items, DEFAULT_IMAGE_WIDTH, DEFAULT_IMAGE_HEIGHT);
    change([
      ...items,
      {
        ...BLANK_ITEM,
        height: DEFAULT_IMAGE_HEIGHT,
        id: newItemId(),
        imageUrl: photo.url,
        kind: "photo",
        photoId: photo.id,
        thumbUrl: photo.url,
        width: DEFAULT_IMAGE_WIDTH,
        x: p.x,
        y: p.y,
        z: items.length + 1,
      },
    ]);
    setIsPicking(false);
  };

  /** An Unsplash reference or a generated image. */
  const addExternal = (image: ExternalImage) => {
    const p = dropPoint(items, DEFAULT_IMAGE_WIDTH, DEFAULT_IMAGE_HEIGHT);
    change([
      ...items,
      {
        ...BLANK_ITEM,
        // Credit travels with the item: the licence requires it wherever the
        // photograph is shown, and the search response is long gone by then.
        creditName: image.creditName,
        creditUrl: image.creditUrl,
        height: DEFAULT_IMAGE_HEIGHT,
        id: newItemId(),
        imageUrl: image.imageUrl,
        kind: "reference",
        thumbUrl: image.thumbUrl,
        width: DEFAULT_IMAGE_WIDTH,
        x: p.x,
        y: p.y,
        z: items.length + 1,
      },
    ]);
  };

  return {
    addElement,
    addExternal,
    addFrame,
    addNode,
    addPhoto,
    addShader,
    addWritable,
    autoArrange,
    beginElement,
    exportItem,
    groupIntoFrame,
  };
};
