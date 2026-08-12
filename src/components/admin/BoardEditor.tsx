import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  FrameIcon,
  Image01Icon,
  LinkSquare01Icon,
  MagicWand01Icon,
  NotebookIcon,
  PlayIcon,
  RepeatIcon,
  SearchVisualIcon,
  SparklesIcon,
  StopIcon,
  TextIcon,
  Tick02Icon,
} from "@hugeicons-pro/core-stroke-standard";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
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
} from "../../../config/canvas.js";
import { containedBy } from "../../../config/graph.js";
import type { NodeTypeId } from "../../../config/nodeTypes.js";
import { BoardCanvas, type Box } from "../../boards/BoardCanvas";
import { BoardDrawTools } from "../../boards/BoardDrawTools";
import type { DrawStyle } from "../../boards/DrawToolbar";
import {
  DEFAULT_STROKE,
  DEFAULT_STROKE_WIDTH,
  type DrawingConfig,
  type DrawTool,
  isFreehand,
  NO_FILL,
} from "../../boards/drawing";
import { InsertPalette } from "../../boards/InsertPalette";
import { newItemId } from "../../boards/newItemId";
import type { PortTarget } from "../../boards/PortMenu";
import { findFreeSpot } from "../../boards/placement";
import { newShaderConfig } from "../../boards/shaderConfig";
import { useGraphRun } from "../../boards/useGraphRun";
import {
  authStorage,
  boardsApi,
  portfolioService,
} from "../../services/portfolioService";
import type {
  Board,
  BoardItem,
  BoardSource,
  BoardWire,
  Photo,
} from "../../types";
import { Button } from "../ui/button";
import { BoardInsertPanel, type ExternalImage } from "./BoardInsertPanel";
import { CustomCursor } from "./CustomCurstor";

/** Strips the scheme so the shared link reads as a plain address. */
const SCHEME = /^https?:\/\//;

/** How long after the last change before the board saves itself. */
const AUTOSAVE_DELAY_MS = 1200;

/** New items land near the middle of the canvas, offset so they do not stack. */
/** How far a port-created node sits from the thing feeding it, in canvas units. */
const PORT_SPAWN_GAP = 120;

/** Breathing room inside a frame when it tidies collected results. */
const FRAME_PAD = 40;

/**
 * Where the next item goes.
 *
 * Asks for a genuinely free spot rather than nudging by a counter: the old rule
 * offset by how many items existed, which said nothing about where any of them
 * were, so anything added to a busy board landed on top of it.
 */
/** Offset between images dropped together, so they do not land in one pile. */
const DROP_FAN = 28;

const dropPoint = (
  items: BoardItem[],
  width: number,
  height: number
): { x: number; y: number } =>
  findFreeSpot({
    height,
    items,
    origin: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
    width,
  });

/**
 * The fields every item carries whatever its kind, all empty.
 *
 * Spread first and then overridden, so adding a field to BoardItem does not
 * mean remembering to add `null` in four different places — the compiler used
 * to catch that, but only after four identical edits.
 */
const BLANK_ITEM = {
  body: null,
  config: null,
  creditName: null,
  creditUrl: null,
  fontSize: null,
  imageUrl: null,
  nodeType: null,
  photoId: null,
  result: null,
  runError: null,
  runState: null,
  thumbUrl: null,
} satisfies Partial<BoardItem>;

/**
 * Full-screen board editor.
 *
 * Saves on a debounce rather than behind a button: the canvas is edited by
 * dragging, and a drag has no natural moment where a person would think to
 * press save. The unsaved marker is what makes that honest.
 */
export function BoardEditor({
  boardId,
  onClose,
}: {
  boardId: string;
  onClose: () => void;
}) {
  const [board, setBoard] = useState<Board | null>(null);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [wires, setWires] = useState<BoardWire[]>([]);
  const [sources, setSources] = useState<BoardSource[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isPicking, setIsPicking] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [autoEditId, setAutoEditId] = useState<string | null>(null);
  /**
   * Whether the board has actually arrived.
   *
   * The save replaces the whole arrangement, and `items` starts empty — so a
   * save that runs before the load lands writes an empty board and deletes
   * every item on it. Nothing may be written until there is something to
   * compare against.
   */
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isInserting, setIsInserting] = useState(false);
  const [drawTool, setDrawTool] = useState<DrawTool | null>(null);
  const [selectedItem, setSelectedItem] = useState<BoardItem | null>(null);
  const [drawStyle, setDrawStyle] = useState<DrawStyle>({
    fill: NO_FILL,
    stroke: DEFAULT_STROKE,
    strokeWidth: DEFAULT_STROKE_WIDTH,
  });

  /**
   * Publishing mints the slug server-side, so the link only exists once the
   * response comes back — there is nothing to show optimistically.
   */
  const publish = async (isPublic: boolean) => {
    setIsPublishing(true);
    try {
      const saved = await boardsApi.update(boardId, { isPublic });
      setBoard(saved);
      toast.success(isPublic ? "Board published" : "Board unpublished");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not publish");
    } finally {
      setIsPublishing(false);
    }
  };

  const publicUrl =
    board?.isPublic && board.slug
      ? `${window.location.origin}/board/${board.slug}`
      : null;

  // Read once: the signed-in admin cannot change while the board is open.
  const [displayName] = useState(() => {
    const user = authStorage.getUser();
    return user ? user.displayName : "You";
  });

  // A saved item is keyed by its id; an unsaved one by the key it was created
  // with. Both survive the new object that every edit produces.
  const keyOf = useCallback((item: BoardItem) => item.id, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [loaded, photoList] = await Promise.all([
          boardsApi.get(boardId),
          portfolioService.getPhotos(),
        ]);
        if (cancelled) {
          return;
        }
        setBoard(loaded);
        setItems(loaded.items ?? []);
        setWires(loaded.wires ?? []);
        setSources(loaded.sources ?? []);
        setIsLoaded(true);
        setPhotos(photoList);
      } catch (err) {
        if (!cancelled) {
          toast.error(
            err instanceof Error ? err.message : "Could not load this board"
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  const save = useCallback(async () => {
    // Refuses to write a board it has not read. Without this the first
    // debounce after any early edit replaces the stored arrangement with the
    // empty one this component starts with.
    if (!isLoaded) {
      return;
    }
    setIsSaving(true);
    try {
      await boardsApi.update(boardId, {
        // The first image on the board becomes its cover, so the list has
        // something to show without asking anyone to choose.
        coverUrl:
          items.find(
            (i) => (i.kind === "photo" || i.kind === "reference") && i.imageUrl
          )?.imageUrl ?? undefined,
        items,
        sources,
        wires,
      });
      // Deliberately does not adopt saved.items. The canvas is the source of
      // truth while it is open, and replacing state here discarded anything
      // typed or dragged while the request was in flight.
      //
      // Run results are safe from this in the other direction too: the server
      // never writes them from a save, so a generation landing mid-request
      // cannot be overwritten by the copy this call carried.
      setIsDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save board");
    } finally {
      setIsSaving(false);
    }
  }, [boardId, isLoaded, items, sources, wires]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const timer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isDirty, save]);

  // Latest state, readable from listeners that must not re-subscribe on every
  // drag frame — re-registering pagehide hundreds of times during a drag would
  // be its own problem.
  const pending = useRef<{
    isDirty: boolean;
    isLoaded: boolean;
    items: BoardItem[];
    wires: BoardWire[];
  }>({
    isDirty,
    isLoaded,
    items,
    wires,
  });
  pending.current = { isDirty, isLoaded, items, wires };

  /**
   * Flushes on the way out.
   *
   * The debounce means the last second or so of work has not reached the server
   * yet, so a reload, a closed tab, or a backgrounded phone would drop it — the
   * board having its own URL makes that worse, because coming back looks like
   * the work was saved. keepalive lets the request outlive the page; a normal
   * fetch is cancelled the moment the document goes away.
   */
  useEffect(() => {
    const flush = () => {
      const {
        isDirty: unsaved,
        isLoaded: ready,
        items: latest,
        wires: latestWires,
      } = pending.current;
      // Same guard as save(): a page closing before the board loaded must not
      // flush an empty arrangement over a full one.
      if (unsaved && ready) {
        boardsApi.flush(boardId, latest, latestWires);
      }
    };

    // pagehide covers reload, navigation and tab close. visibilitychange is the
    // one that fires when a phone backgrounds the app, which on iOS may be the
    // last callback before the page is discarded.
    const onHidden = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [boardId]);

  /**
   * ⌘/ opens the insert palette.
   *
   * The header has run out of room — notes, text, images, three node types, a
   * frame and 189 shaders do not fit on a toolbar — and searching is faster
   * than hunting a button even when they do.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setIsInserting((open) => !open);
        return;
      }
      // Escape puts the pointer back. Without it a chosen tool is a mode you
      // can only leave by finding the toolbar again, and since a tool draws on
      // every press it also means nothing on the board can be moved — which
      // reads as the cursor being stuck rather than as a mode being on.
      if (e.key === "Escape") {
        setDrawTool((current) => {
          if (current === null) {
            return current;
          }
          e.preventDefault();
          return null;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const change = useCallback((next: BoardItem[]) => {
    setItems(next);
    setIsDirty(true);
  }, []);

  const changeWires = useCallback((next: BoardWire[]) => {
    setWires(next);
    setIsDirty(true);
  }, []);

  /**
   * Remembers a place this board pulls references from.
   *
   * Keyed by URL rather than id: attaching the same Pinterest board twice is
   * the same source, not a second one, and the database says so too.
   */
  const attachSource = useCallback((source: BoardSource) => {
    setSources((current) =>
      current.some((existing) => existing.url === source.url)
        ? current
        : [...current, source]
    );
    setIsDirty(true);
  }, []);

  const detachSource = useCallback((id: string) => {
    setSources((current) => current.filter((source) => source.id !== id));
    setIsDirty(true);
  }, []);

  const changeConfig = useCallback(
    (itemId: string, config: Record<string, unknown>) => {
      setItems((current) =>
        current.map((item) => (item.id === itemId ? { ...item, config } : item))
      );
      setIsDirty(true);
    },
    []
  );

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
        const next = current.map((item) =>
          item.id === itemId ? { ...item, ...patch } : item
        );

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
    [collectorFor]
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
          ...(isFrame ? { body: "" } : { config: {}, runState: "idle" }),
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
    [items]
  );

  /**
   * Unsaved work has to reach the server before anything runs.
   *
   * The run endpoint resolves a node's inputs from the *stored* graph rather
   * than from the request, so a wire drawn or a prompt typed in the last second
   * would otherwise be invisible to it.
   */
  const flushBeforeRun = useCallback(async () => {
    if (pending.current.isDirty) {
      await save();
    }
  }, [save]);

  const graphRun = useGraphRun({
    beforeRun: flushBeforeRun,
    boardId,
    items,
    onPatch: applyRun,
    wires,
  });

  useEffect(() => {
    if (graphRun.error) {
      toast.error(graphRun.error);
    }
  }, [graphRun.error]);

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

  /**
   * Images dragged onto the board.
   *
   * These are working material — a reference shot, a sketch, something to feed
   * a node — so they are stored and pinned to the board and nothing else. The
   * site's gallery is a separate act: a photograph appears there only when a
   * row is written to `photos`, which this deliberately never does. Uploading
   * and publishing stay different decisions.
   */
  const dropFiles = async (files: File[], point: { x: number; y: number }) => {
    const toastId = toast.loading(
      files.length === 1 ? "Uploading image…" : `Uploading ${files.length}…`
    );
    // Transferred together rather than one after another: the bytes go straight
    // to blob storage and never touch a function, so several at once is the
    // normal case and a queue would only make a folder of images slower.
    const results = await Promise.allSettled(
      files.map((file) =>
        portfolioService.uploadImageFile(file, undefined, "boards/uploads")
      )
    );

    const added: BoardItem[] = [];
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const reason: unknown = result.reason;
        toast.error(
          reason instanceof Error
            ? reason.message
            : `Could not upload ${files[index]?.name ?? "image"}`
        );
        return;
      }
      const { url } = result.value;
      added.push({
        ...BLANK_ITEM,
        height: DEFAULT_IMAGE_HEIGHT,
        id: newItemId(),
        imageUrl: url,
        kind: "reference",
        thumbUrl: url,
        width: DEFAULT_IMAGE_WIDTH,
        // Fanned out from the drop so several files do not land in a stack.
        x: Math.round(point.x - DEFAULT_IMAGE_WIDTH / 2 + index * DROP_FAN),
        y: Math.round(point.y - DEFAULT_IMAGE_HEIGHT / 2 + index * DROP_FAN),
        z: items.length + index + 1,
      });
    });

    toast.dismiss(toastId);
    if (added.length > 0) {
      change([...items, ...added]);
      toast.success(
        added.length === 1 ? "Image added" : `${added.length} images added`
      );
    }
  };

  /**
   * A result dragged off a node and dropped on the canvas.
   *
   * Nothing is uploaded and nothing is copied: the picture already lives in our
   * blob storage, so this pins the URL where it landed. The node keeps its own
   * copy in its history — pulling one out is taking a print, not moving the
   * original.
   */
  const dropImage = (
    image: { url: string },
    point: { x: number; y: number }
  ) => {
    change([
      ...items,
      {
        ...BLANK_ITEM,
        height: DEFAULT_IMAGE_HEIGHT,
        id: newItemId(),
        imageUrl: image.url,
        kind: "reference",
        thumbUrl: image.url,
        width: DEFAULT_IMAGE_WIDTH,
        x: Math.round(point.x - DEFAULT_IMAGE_WIDTH / 2),
        y: Math.round(point.y - DEFAULT_IMAGE_HEIGHT / 2),
        z: items.length + 1,
      },
    ]);
  };

  /**
   * A finished mark becomes an item.
   *
   * The tool stays selected afterwards: drawing one shape almost always means
   * drawing several, and dropping back to the pointer after every stroke would
   * make the toolbar the thing you interact with most.
   */
  const addDrawing = (config: DrawingConfig, box: Box) => {
    // A shape is usually placed once, so the pointer comes back afterwards and
    // the new shape can be moved straight away. Pen and brush stay chosen,
    // because sketching is many strokes in a row.
    if (!isFreehand(config.tool)) {
      setDrawTool(null);
    }
    change([
      ...items,
      {
        ...BLANK_ITEM,
        config: config as unknown as Record<string, unknown>,
        height: Math.round(box.height),
        id: newItemId(),
        kind: "drawing",
        width: Math.round(box.width),
        x: Math.round(box.x),
        y: Math.round(box.y),
        z: items.length + 1,
      },
    ]);
  };

  /**
   * Deletes one version of a node's output, for good.
   *
   * Through its own endpoint because `result` is not written by the board save
   * — see api/boards/[id]/version.ts. The selection lives in `config`, which
   * the canvas does own, so it is clamped here rather than there.
   */
  const removeVersion = async (itemId: string, index: number) => {
    try {
      const result = await boardsApi.deleteVersion(boardId, itemId, index);
      setItems((current) =>
        current.map((item) => {
          if (item.id !== itemId) {
            return item;
          }
          const selected = Number(item.config?.selectedVersion ?? 0);
          return {
            ...item,
            config: {
              ...item.config,
              // A version below the one removed keeps its place; the one
              // removed and anything after it shifts down.
              selectedVersion: Math.max(
                0,
                Math.min(
                  selected > index ? selected - 1 : selected,
                  (result?.history?.length ?? 1) - 1
                )
              ),
            },
            result,
          };
        })
      );
      setIsDirty(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove that");
    }
  };

  /**
   * Puts every version a node has made onto the board as its own image.
   *
   * A node's gallery is for comparing; once you have compared, the usual next
   * move is to get them out where they can be arranged and drawn on.
   */
  const sendVersions = (itemId: string) => {
    const node = items.find((item) => item.id === itemId);
    const history = node?.result?.history ?? [];
    if (history.length === 0) {
      return;
    }
    const origin = dropPoint(items, DEFAULT_IMAGE_WIDTH, DEFAULT_IMAGE_HEIGHT);
    change([
      ...items,
      ...history.map((image, index) => ({
        ...BLANK_ITEM,
        height: DEFAULT_IMAGE_HEIGHT,
        id: newItemId(),
        imageUrl: image.url,
        kind: "reference" as const,
        thumbUrl: image.url,
        width: DEFAULT_IMAGE_WIDTH,
        // Laid out in a row so a set arrives comparable rather than stacked.
        x: Math.round(origin.x + index * (DEFAULT_IMAGE_WIDTH + 24)),
        y: origin.y,
        z: items.length + index + 1,
      })),
    ]);
    toast.success(
      history.length === 1 ? "1 image added" : `${history.length} images added`
    );
  };

  const close = async () => {
    if (isDirty) {
      await save();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <CustomCursor cursorColor="#9100FF" userName={displayName} />
      {/* Wraps rather than overflowing: the palette has grown past what fits on
          one line at laptop width, and a row of shrink-0 buttons pushed Publish
          and Close off the edge instead of moving them down. */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-white/10 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate font-light text-sm text-white/90 uppercase tracking-[0.2em]">
            {board?.title ?? "Board"}
          </h2>
          <p className="text-[10px] text-white/40 uppercase tracking-[0.2em]">
            {isSaving ? "Saving…" : null}
            {!isSaving && isDirty ? "Unsaved changes" : null}
            {isSaving || isDirty ? null : (
              <span className="flex items-center gap-1">
                <HugeiconsIcon aria-hidden icon={Tick02Icon} size={11} />
                Saved
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            onClick={() => addWritable("note")}
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon aria-hidden icon={NotebookIcon} size={14} />
            Note
          </Button>
          <Button
            onClick={() => addWritable("text")}
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon aria-hidden icon={TextIcon} size={14} />
            Text
          </Button>
          <Button
            onClick={() => setIsPicking((v) => !v)}
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon aria-hidden icon={Image01Icon} size={14} />
            Image
          </Button>
          <Button
            onClick={() => addNode("generate")}
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon aria-hidden icon={SparklesIcon} size={14} />
            Generate
          </Button>
          <Button
            onClick={() => addNode("describe")}
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon aria-hidden icon={SearchVisualIcon} size={14} />
            Analyse
          </Button>
          <Button onClick={() => addNode("join")} type="button" variant="ghost">
            <HugeiconsIcon aria-hidden icon={LinkSquare01Icon} size={14} />
            Combine
          </Button>
          <Button
            onClick={() => addNode("iterate")}
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon aria-hidden icon={RepeatIcon} size={14} />
            Iterate
          </Button>
          <Button onClick={() => addNode("icon")} type="button" variant="ghost">
            <HugeiconsIcon aria-hidden icon={MagicWand01Icon} size={14} />
            Icon
          </Button>
          <Button
            onClick={() => addNode("prompt")}
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon aria-hidden icon={TextIcon} size={14} />
            Prompt
          </Button>
          <Button onClick={addFrame} type="button" variant="ghost">
            <HugeiconsIcon aria-hidden icon={FrameIcon} size={14} />
            Frame
          </Button>

          {/* Only offered once there is a graph to run. A board of pinned
              photographs has nothing to execute, and a control that would
              always be a no-op is noise. */}
          {items.some((item) => item.kind === "op") ? (
            <Button
              onClick={() => {
                if (graphRun.isRunning) {
                  graphRun.cancel();
                } else {
                  void graphRun.runBoard();
                }
              }}
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon
                aria-hidden
                icon={graphRun.isRunning ? StopIcon : PlayIcon}
                size={14}
              />
              {graphRun.isRunning ? "Cancel" : "Run board"}
            </Button>
          ) : null}
          {publicUrl ? (
            <button
              className="max-w-40 truncate text-[10px] text-emerald-300/80 underline-offset-2 hover:underline"
              onClick={() => {
                void navigator.clipboard.writeText(publicUrl);
                toast.success("Link copied");
              }}
              type="button"
            >
              {publicUrl.replace(SCHEME, "")}
            </button>
          ) : null}
          <Button
            className="min-h-11 text-[10px] text-white/80 uppercase tracking-[0.18em] hover:text-white"
            disabled={isPublishing}
            onClick={() => void publish(!board?.isPublic)}
            type="button"
            variant="ghost"
          >
            {board?.isPublic ? "Unpublish" : "Publish"}
          </Button>
          <Button
            aria-label="Close board"
            className="min-h-11 text-white/80 hover:text-white"
            onClick={() => void close()}
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} />
          </Button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {/* Floating over the canvas rather than in the header: the header
            already wraps at laptop width, and a drawing tool wants to be near
            what it is drawing on. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
          <div className="pointer-events-auto">
            <BoardDrawTools
              onConfigChange={changeConfig}
              onStyle={setDrawStyle}
              onTool={setDrawTool}
              selected={selectedItem}
              style={drawStyle}
              tool={drawTool}
            />
          </div>
        </div>

        <BoardCanvas
          autoEditId={autoEditId}
          drawStyle={drawStyle}
          drawTool={drawTool}
          items={items}
          keyOf={keyOf}
          onChange={change}
          onConfigChange={changeConfig}
          onCreateFromPort={createFromPort}
          onDraw={addDrawing}
          onDropFiles={(files, point) => void dropFiles(files, point)}
          onDropImage={dropImage}
          onRemoveVersion={(itemId, index) => void removeVersion(itemId, index)}
          onRun={(itemId, force) => void graphRun.runNode(itemId, force)}
          onSelectionChange={setSelectedItem}
          onSendVersions={sendVersions}
          onWiresChange={changeWires}
          wires={wires}
        />

        {isInserting ? (
          <InsertPalette
            onChoose={(action) => {
              setIsInserting(false);
              if (action.kind === "writable") {
                addWritable(action.writable);
              } else if (action.kind === "frame") {
                addFrame();
              } else if (action.kind === "node") {
                addNode(action.nodeType);
              } else if (action.kind === "shader") {
                addShader(action.name);
              } else {
                // Images need a source chosen, so the palette hands over to the
                // panel that can ask rather than guessing one.
                setIsPicking(true);
              }
            }}
            onDismiss={() => setIsInserting(false)}
          />
        ) : null}

        {isPicking ? (
          <BoardInsertPanel
            onAddExternal={addExternal}
            onAddFiles={(files) =>
              void dropFiles(
                files,
                dropPoint(items, DEFAULT_IMAGE_WIDTH, DEFAULT_IMAGE_HEIGHT)
              )
            }
            onAddNode={addNode}
            onAddPhoto={addPhoto}
            onAddShader={addShader}
            onAttachSource={attachSource}
            onClose={() => setIsPicking(false)}
            onDetachSource={detachSource}
            photos={photos}
            sources={sources}
          />
        ) : null}
      </div>
    </div>
  );
}
