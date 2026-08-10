import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  FrameIcon,
  Image01Icon,
  MagicWand01Icon,
  NotebookIcon,
  PlayIcon,
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
  DEFAULT_TEXT_HEIGHT,
  DEFAULT_TEXT_WIDTH,
} from "../../../config/canvas.js";
import { containedBy } from "../../../config/graph.js";
import type { NodeTypeId } from "../../../config/nodeTypes.js";
import { BoardCanvas } from "../../boards/BoardCanvas";
import { newItemId } from "../../boards/newItemId";
import type { PortTarget } from "../../boards/PortMenu";
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

const dropPoint = (count: number) => ({
  x: CANVAS_WIDTH / 2 - 240 + (count % 6) * 40,
  y: CANVAS_HEIGHT / 2 - 160 + (count % 6) * 40,
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
    const p = dropPoint(items.length);
    const id = newItemId();
    change([
      ...items,
      {
        ...BLANK_ITEM,
        body: "",
        height: kind === "note" ? DEFAULT_NOTE_HEIGHT : DEFAULT_TEXT_HEIGHT,
        id,
        kind,
        width: kind === "note" ? DEFAULT_NOTE_WIDTH : DEFAULT_TEXT_WIDTH,
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
    const p = dropPoint(items.length);
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
    const p = dropPoint(items.length);
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

  const addPhoto = (photo: Photo) => {
    const p = dropPoint(items.length);
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
    const p = dropPoint(items.length);
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
        <BoardCanvas
          autoEditId={autoEditId}
          items={items}
          keyOf={keyOf}
          onChange={change}
          onConfigChange={changeConfig}
          onCreateFromPort={createFromPort}
          onRun={(itemId, force) => void graphRun.runNode(itemId, force)}
          onWiresChange={changeWires}
          wires={wires}
        />

        {isPicking ? (
          <BoardInsertPanel
            onAddExternal={addExternal}
            onAddNode={addNode}
            onAddPhoto={addPhoto}
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
