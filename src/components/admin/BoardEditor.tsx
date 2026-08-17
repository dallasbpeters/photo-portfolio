import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  FrameIcon,
  GridViewIcon,
  Image01Icon,
  LinkSquare01Icon,
  MagicWand01Icon,
  NotebookIcon,
  PaintBoardIcon,
  PlayIcon,
  RepeatIcon,
  SearchVisualIcon,
  SparklesIcon,
  StopIcon,
  TextIcon,
  Tick02Icon,
} from "@hugeicons-pro/core-stroke-standard";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { nodeTypeFor } from "../../../config/nodeTypes.js";
import { OUTPUT_PORT_KEY } from "../../../config/ports.js";
import { type AffinityWriteback, isSvgUrl } from "../../boards/affinity";
import { FRAME_PAD, gridLayout, readingOrder } from "../../boards/arrange";
import { BoardCanvas, type Box } from "../../boards/BoardCanvas";
import { BoardDrawTools } from "../../boards/BoardDrawTools";
import { CommentsPanel } from "../../boards/CommentsPanel";
import { compositeSources, renderComposite } from "../../boards/composite";
import { copyOfFrame } from "../../boards/copyToBoard";
import type { DrawStyle } from "../../boards/DrawToolbar";
import {
  DEFAULT_STROKE,
  DEFAULT_STROKE_WIDTH,
  type DrawingConfig,
  type DrawTool,
  isFreehand,
  NO_FILL,
} from "../../boards/drawing";
import { ElementModal } from "../../boards/ElementModal";
import { configFromSource, elementConfig } from "../../boards/elementNode";
import { InsertPalette } from "../../boards/InsertPalette";
import {
  outputImageOf,
  outputImagesOf,
  outputTextOf,
} from "../../boards/itemOutput";
import { MaskControls } from "../../boards/MaskControls";
import { ModelsProvider } from "../../boards/ModelsContext";
import {
  type MaskConfig,
  type MaskStroke,
  maskOf,
  naturalSizeOf,
  rasterizeMask,
} from "../../boards/mask";
import { newItemId } from "../../boards/newItemId";
import type { PortTarget } from "../../boards/PortMenu";
import { findFreeSpot } from "../../boards/placement";
import { newShaderConfig } from "../../boards/shaderConfig";
import { isSvgFile, svgToPng } from "../../boards/svgToRaster";
import { useAffinityBridge } from "../../boards/useAffinityBridge";
import { restore, useBoardHistory } from "../../boards/useBoardHistory";
import { useBoardImageEditor } from "../../boards/useBoardImageEditor";
import { useGraphRun } from "../../boards/useGraphRun";
import { useVideoNode } from "../../boards/useVideoNode";
import ThemeToggle from "../../components/ThemeToggle";
import { type BoardComment, commentsApi } from "../../services/comments";
import {
  authStorage,
  boardsApi,
  portfolioService,
} from "../../services/portfolioService";
import type {
  Board,
  BoardItem,
  BoardItemResult,
  BoardSource,
  BoardWire,
  Element,
  Photo,
} from "../../types";
import { Button } from "../ui/button";
import { BoardInsertPanel, type ExternalImage } from "./BoardInsertPanel";
import { CustomCursor } from "./CustomCursor";
import { SendToCanvaModal } from "./SendToCanvaModal";
import { SvgImportDialog } from "./SvgImportDialog";
import "./BoardEditor.css";

/** Strips the scheme so the shared link reads as a plain address. */
const SCHEME = /^https?:\/\//;

/** How long after the last change before the board saves itself. */
const AUTOSAVE_DELAY_MS = 1200;

/** The board header's actions: run, comment, share, publish, close. */
function BoardHeaderActions({
  commentCount,
  hasNodes,
  isPublic,
  isPublishing,
  isRunning,
  onCancelRun,
  onClose,
  onPublish,
  onRun,
  onToggleComments,
  publicUrl,
  showComments,
}: {
  commentCount: number;
  hasNodes: boolean;
  isPublic: boolean;
  isPublishing: boolean;
  isRunning: boolean;
  onCancelRun: () => void;
  onClose: () => void;
  onPublish: () => void;
  onRun: () => void;
  onToggleComments: () => void;
  publicUrl: string | null;
  showComments: boolean;
}) {
  return (
    <>
      {/* Only offered once there is a graph to run. A board of pinned
          photographs has nothing to execute, and a control that would always
          be a no-op is noise. */}
      {hasNodes ? (
        <Button
          onClick={isRunning ? onCancelRun : onRun}
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon
            aria-hidden
            icon={isRunning ? StopIcon : PlayIcon}
            size={14}
          />
          {isRunning ? "Cancel" : "Run board"}
        </Button>
      ) : null}
      <button
        aria-label="Comments"
        className={`min-h-11 rounded px-2 text-[10px] uppercase tracking-[0.18em] transition-colors ${
          showComments
            ? "bg-amber-300/15 text-amber-800"
            : "text-board-ink/70 hover:text-board-ink"
        }`}
        onClick={onToggleComments}
        type="button"
      >
        Comments{commentCount > 0 ? ` (${commentCount})` : ""}
      </button>
      {publicUrl ? (
        <button
          className="max-w-40 truncate text-[10px] text-emerald-500 underline-offset-2 hover:underline"
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
        disabled={isPublishing}
        onClick={onPublish}
        type="button"
        variant="ghost"
      >
        {isPublic ? "Unpublish" : "Publish"}
      </Button>
      <ThemeToggle />
      <Button
        aria-label="Close board"
        onClick={onClose}
        type="button"
        variant="ghost"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={18} />
      </Button>
    </>
  );
}

/** New items land near the middle of the canvas, offset so they do not stack. */
/** How far a port-created node sits from the thing feeding it, in canvas units. */
const PORT_SPAWN_GAP = 120;

/**
 * Where the next item goes.
 *
 * Asks for a genuinely free spot rather than nudging by a counter: the old rule
 * offset by how many items existed, which said nothing about where any of them
 * were, so anything added to a busy board landed on top of it.
 */
/** Offset between images dropped together, so they do not land in one pile. */
const DROP_FAN = 28;

/**
 * Where something arriving without a position should look for room.
 *
 * The middle of what is already on the board, not the middle of the canvas.
 * The canvas is far larger than any one board fills, so its centre is usually
 * empty space a long way from the work — and since the view frames the items
 * rather than the canvas, an item dropped there lands off screen and reads as
 * nothing having happened. Only an empty board falls back to the canvas centre,
 * which is where an empty board is already looking.
 */
const dropOrigin = (
  items: BoardItem[],
  /** The middle of what is on screen, when the canvas has reported it. */
  inView: { x: number; y: number } | null
): { x: number; y: number } => {
  // Where you are looking, first. The canvas is far larger than the screen, so
  // an item placed at the middle of the *board* lands off screen on any board
  // that has been panned — which reads as the insert having done nothing.
  if (inView) {
    return inView;
  }
  if (items.length === 0) {
    return { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
  }
  const xs = items.map((item) => item.x + item.width / 2);
  const ys = items.map((item) => item.y + item.height / 2);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
};

/**
 * The fields every item carries whatever its kind, all empty. Spread first and
 * overridden, so adding a field to BoardItem is not four identical edits.
 */
/**
 * Throws away any rendered composite.
 *
 * A composite is a picture of the arrangement, so *any* edit can invalidate it.
 * Working out which ones actually mattered would be a dependency graph over
 * geometry, and getting it subtly wrong means a node quietly showing
 * yesterday's layout. Clearing always costs one render and cannot be wrong.
 */
const dropComposites = (list: BoardItem[]): BoardItem[] =>
  list.map((item) =>
    item.nodeType === "composite" &&
    typeof item.config?.compositeUrl === "string"
      ? { ...item, config: { ...item.config, compositeUrl: null } }
      : item
  );

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
  const navigate = useNavigate();
  /**
   * Filled in by the canvas: the middle of what is currently on screen.
   *
   * A ref rather than state because it changes on every pan frame and nothing
   * renders from it — it is only read at the moment something is inserted.
   */
  const viewCentreRef = useRef<(() => { x: number; y: number }) | null>(null);

  /** Somewhere free for a new item, near where you are looking. */
  const dropPoint = useCallback(
    (
      list: BoardItem[],
      width: number,
      height: number
    ): { x: number; y: number } =>
      findFreeSpot({
        height,
        items: list,
        origin: dropOrigin(list, viewCentreRef.current?.() ?? null),
        width,
      }),
    []
  );

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
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [isInserting, setIsInserting] = useState(false);
  /**
   * The selection waiting to be named, or null when nothing is being saved.
   *
   * Held here rather than in the modal because it is gathered from the board —
   * once the panel is open the selection may have moved on, and what is being
   * saved should be what was chosen when it was chosen.
   */
  const [elementDraft, setElementDraft] = useState<{
    description: string;
    images: string[];
  } | null>(null);
  /**
   * Which tab the insert panel opens on, or undefined for its own default.
   *
   * Decided by whoever opens it. Naming an element ends on the library it was
   * just added to, so the thing that was named can be placed without hunting
   * for it; the toolbar opens where it always did.
   */
  const [pickAt, setPickAt] = useState<"elements" | undefined>();
  const history = useBoardHistory();
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
        const [loaded, photoList, commentList] = await Promise.all([
          boardsApi.get(boardId),
          portfolioService.getPhotos(),
          commentsApi.list(boardId),
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
        setComments(commentList);
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

  // Serialises board saves. A save replaces the whole arrangement (the server
  // deletes and re-inserts every item), so two in flight can land out of order
  // and the older snapshot would win — resetting positions to an earlier state,
  // or deleting an item added in the meantime. Each save waits for the last.
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  const save = useCallback(
    /**
     * `override` is for a caller that has just computed the items and cannot
     * wait for React to re-render with them — rendering masks before a run is
     * the case, and so is a node created the same moment it is run. Without it
     * that save would write the state from before the masks were attached (or
     * the node was added), and the run would read a board that lacks them.
     */
    async (override?: { items?: BoardItem[]; wires?: BoardWire[] }) => {
      // Refuses to write a board it has not read. Without this the first
      // debounce after any early edit replaces the stored arrangement with the
      // empty one this component starts with.
      if (!isLoaded) {
        return;
      }
      const saving = override?.items ?? items;
      const savingWires = override?.wires ?? wires;
      // The first image on the board becomes its cover, so the list has
      // something to show without asking anyone to choose.
      const coverUrl =
        saving.find(
          (i) => (i.kind === "photo" || i.kind === "reference") && i.imageUrl
        )?.imageUrl ?? undefined;
      const run = saveChain.current.then(async () => {
        setIsSaving(true);
        try {
          await boardsApi.update(boardId, {
            coverUrl,
            items: saving,
            sources,
            wires: savingWires,
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
          toast.error(
            err instanceof Error ? err.message : "Could not save board"
          );
        } finally {
          setIsSaving(false);
        }
      });
      saveChain.current = run;
      await run;
    },
    [boardId, isLoaded, items, sources, wires]
  );

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
      // Undo and redo. Ignored while typing: a field has its own undo, and
      // stealing it would make editing a prompt lose the prompt rather than
      // the last character.
      const active = document.activeElement;
      const isTyping =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "z" &&
        !isTyping
      ) {
        e.preventDefault();
        setItems((currentItems) => {
          setWires((currentWires) => {
            const now = { items: currentItems, wires: currentWires };
            const step = e.shiftKey ? history.redo(now) : history.undo(now);
            if (step) {
              const restored = restore(step, currentItems);
              setItems(restored.items);
              setWires(restored.wires);
              setIsDirty(true);
            }
            return currentWires;
          });
          return currentItems;
        });
        return;
      }
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
  }, [history]);

  /**
   * Records the state about to be replaced.
   *
   * Taken from the setters rather than passed in, so a caller cannot forget —
   * and read inside the updater so it is the state React actually holds rather
   * than whatever this closure captured.
   */
  const remember = useCallback(() => {
    setItems((currentItems) => {
      setWires((currentWires) => {
        history.record({ items: currentItems, wires: currentWires });
        return currentWires;
      });
      return currentItems;
    });
  }, [history]);

  const change = useCallback(
    (next: BoardItem[]) => {
      remember();
      setItems(dropComposites(next));
      setIsDirty(true);
    },
    [remember]
  );

  const changeWires = useCallback(
    (next: BoardWire[]) => {
      remember();
      setWires(next);
      // Rewiring changes what a composite is made of, so it invalidates one
      // just as surely as moving a picture does.
      setItems(dropComposites);
      setIsDirty(true);
    },
    [remember]
  );

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

    // Composites are rendered here for the same reason masks are: only the
    // browser knows the arrangement, and a run is the first moment it has to
    // exist as a file. `compositeUrl` is cleared whenever anything feeding the
    // node moves — see change() — so one still holding a URL is current.
    const composed = await Promise.all(
      rendered.map(async (item) => {
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

  // A video cannot travel the graph runner's one-request path; see useVideoNode.
  const runNode = useVideoNode(boardId, items, wires, change, graphRun.runNode);

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
   * The key image, the name, and the words are copied onto the node so the
   * canvas can draw them without a request per node. The id travels with them,
   * and it is the id the run endpoint reads — so what a run actually sends is
   * whatever the library holds now, not what it held the day this node was
   * placed. The copies exist only so a board still shows what it was built with
   * after the element is deleted out from under it.
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
    const toastId = toast.loading("Packing the archive…");
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

  /**
   * Images dragged onto the board.
   *
   * Working material — a reference shot, a sketch, something to feed a node —
   * stored and pinned to the board and nothing else. Publishing is a separate
   * act: a photograph reaches the site only through a `photos` row, which this
   * deliberately never writes.
   */
  /**
   * Uploads already-prepared files and places them on the board. Shared by the
   * immediate path (non-SVG drops) and the SVG chooser, so both land the same.
   */
  const placeUploaded = async (
    files: File[],
    point: { x: number; y: number }
  ) => {
    if (files.length === 0) {
      return;
    }
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

  /** An SVG waiting for the user to say whether to keep it vector. */
  const [pendingSvg, setPendingSvg] = useState<{
    files: File[];
    point: { x: number; y: number };
  } | null>(null);

  const dropFiles = async (files: File[], point: { x: number; y: number }) => {
    // An SVG gets a say — vector or raster is the dragger's call, not ours.
    // Everything else goes straight in.
    const svgs = files.filter(isSvgFile);
    const rest = files.filter((file) => !isSvgFile(file));
    if (svgs.length > 0) {
      setPendingSvg({ files: svgs, point });
    }
    await placeUploaded(rest, point);
  };

  /** Applies the SVG drop choice, then uploads the resulting files. */
  const importSvg = async (keepSvg: boolean) => {
    if (!pendingSvg) {
      return;
    }
    const { files, point } = pendingSvg;
    setPendingSvg(null);
    const prepared = keepSvg
      ? files
      : await Promise.all(files.map((file) => svgToPng(file)));
    await placeUploaded(prepared, point);
  };

  /**
   * A stroke painted onto a picture with the mask brush.
   *
   * Appended to that item's config rather than kept anywhere of its own, so it
   * is saved, undone and copied by the machinery that already handles every
   * other setting. `maskUrl` is dropped on every edit: it is the *rendered*
   * mask, and a stale bitmap sent with freshly painted strokes would repaint
   * the wrong part of the picture — the worst kind of failure here, because it
   * still returns a plausible image.
   */
  const addMaskStroke = (itemId: string, stroke: MaskStroke) => {
    change(
      items.map((item) => {
        if (item.id !== itemId) {
          return item;
        }
        const config = item.config ?? {};
        const existing = maskOf(config);
        return {
          ...item,
          config: {
            ...config,
            mask: {
              invert: existing?.invert ?? false,
              strokes: [...(existing?.strokes ?? []), stroke],
            },
            maskUrl: null,
          },
        };
      })
    );
  };

  /** Replaces a picture's mask wholesale — cleared, or inverted. */
  const changeMask = (itemId: string, next: MaskConfig | null) => {
    change(
      items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              config: { ...(item.config ?? {}), mask: next, maskUrl: null },
            }
          : item
      )
    );
  };

  /**
   * A frame, and everything sitting on it, copied to a board of its own.
   *
   * Two calls rather than one: boards are created empty, so the arrangement
   * follows in the save that every board already uses. If that second call
   * fails the board still exists — empty — which is why the error says so
   * rather than claiming nothing happened.
   *
   * Nothing here touches this board. A copy that also deleted would be a move,
   * and a mis-aimed right-click would then cost work.
   */
  const copyFrameToBoard = async (frame: BoardItem, title: string) => {
    const copy = copyOfFrame(frame, items, wires);
    const toastId = toast.loading(`Creating "${title}"…`);
    try {
      const created = await boardsApi.create(title);
      await boardsApi.update(created.id, {
        items: copy.items,
        wires: copy.wires,
      });
      toast.dismiss(toastId);
      toast.success(
        `Copied ${copy.items.length} item${copy.items.length === 1 ? "" : "s"} to "${title}"`,
        {
          action: {
            label: "Open",
            onClick: () => navigate(`/admin/boards/${created.id}`),
          },
        }
      );
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(
        err instanceof Error ? err.message : "Could not copy to a new board"
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
    []
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

  /**
   * Moves one item to the very top of the stack.
   *
   * The canvas already raises whatever you grab; this is the explicit, reliable
   * version — the layers panel's drag is the same thing made reorderable, and a
   * right-click gives it a target that cannot miss.
   */
  const bringToFront = (itemId: string) => {
    const highest = items.reduce((max, item) => Math.max(max, item.z), 0);
    change(
      items.map((item) =>
        item.id === itemId ? { ...item, z: highest + 1 } : item
      )
    );
  };

  /** Moves one item to the very bottom of the stack, above the frames. */
  const sendToBack = (itemId: string) => {
    const lowest = items.reduce((min, item) => Math.min(min, item.z), 0);
    change(
      items.map((item) =>
        item.id === itemId ? { ...item, z: lowest - 1 } : item
      )
    );
  };

  /** The image being sent to Canva, or null while the modal is closed. */
  const [canvaTarget, setCanvaTarget] = useState<{
    imageUrl: string;
    name: string;
  } | null>(null);

  const openSendToCanva = (item: BoardItem) => {
    const url = outputImageOf(item, items);
    if (!url) {
      toast.error("That item has no picture to send");
      return;
    }
    const label =
      item.kind === "op" ? (nodeTypeFor(item.nodeType)?.label ?? null) : null;
    setCanvaTarget({
      imageUrl: url,
      name: label ?? "Board image",
    });
  };

  const resolveComment = async (commentId: string, resolved: boolean) => {
    try {
      const updated = await commentsApi.resolve(boardId, commentId, resolved);
      setComments((current) =>
        current.map((comment) => (comment.id === commentId ? updated : comment))
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update the comment"
      );
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
    const versions = node?.result?.history ?? [];
    if (versions.length === 0) {
      return;
    }
    const origin = dropPoint(items, DEFAULT_IMAGE_WIDTH, DEFAULT_IMAGE_HEIGHT);
    change([
      ...items,
      ...versions.map((image, index) => ({
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
      versions.length === 1
        ? "1 image added"
        : `${versions.length} images added`
    );
  };

  const close = async () => {
    if (isDirty) {
      await save();
    }
    onClose();
  };

  return (
    <ModelsProvider>
      {/* `text-board-ink` establishes the board's own writing color for
          everything inside. Without it the subtree inherits the *site's*
          foreground — the branded near-white that SiteSettingsProvider pins to
          <html> — so anything without an explicit color came out white on a
          white board. The site's palette is right for the site and has no say
          here. */}
      {/* data-surface re-points the --btn-* variables at the board's ink, so
          every Button inside this tree paints itself for paper without the
          call site having to say so. See index.css. */}
      <CustomCursor cursorColor="#9100FF" userName={displayName} />
      <div
        className="board"
        data-editing={editorNode ? "" : undefined}
        data-surface="board"
      >
        {/* Wraps rather than overflowing: the palette has grown past what fits on
          one line at laptop width, and a row of shrink-0 buttons pushed Publish
          and Close off the edge instead of moving them down. */}
        <div className="board-panel board-panel--top min-w-0">
          <HugeiconsIcon
            aria-hidden
            className="text-board-ink"
            icon={GridViewIcon}
            size={14}
          />
          <h2 className="truncate font-light text-board-ink/90 text-sm uppercase tracking-[0.2em]">
            {board?.title ?? "Board"}
          </h2>
          <p className="text-[10px] text-board-ink/40 uppercase tracking-[0.2em]">
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

        <div className="board-panel board-panel--top-right">
          <BoardHeaderActions
            commentCount={comments.length}
            hasNodes={items.some((item) => item.kind === "op")}
            isPublic={board?.isPublic ?? false}
            isPublishing={isPublishing}
            isRunning={graphRun.isRunning}
            onCancelRun={() => graphRun.cancel()}
            onClose={() => void close()}
            onPublish={() => void publish(!board?.isPublic)}
            onRun={() => void graphRun.runBoard()}
            onToggleComments={() => setShowComments((open) => !open)}
            publicUrl={publicUrl}
            showComments={showComments}
          />
        </div>

        <div className="relative z-100 min-h-0 flex-1">
          {/* Floating over the canvas: a tool wants to be near its subject. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
            <div className="pointer-events-auto">
              <MaskControls onChange={changeMask} selected={selectedItem} />
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

          <motion.div
            animate={{ opacity: 1, x: 0 }}
            className="board-panel board-panel--column top-20 left-4 z-20 grid place-items-stretch justify-stretch gap-2 rounded bg-board-surface text-board-ink"
            initial={{ opacity: 0, x: -100 }}
            transition={{ duration: 0.5 }}
          >
            <Button
              fullWidthLeft
              onClick={() => addWritable("note")}
              type="button"
              variant="noborder"
            >
              <HugeiconsIcon aria-hidden icon={NotebookIcon} size={14} />
              Note
            </Button>
            <Button
              fullWidthLeft
              onClick={() => addWritable("text")}
              type="button"
              variant="noborder"
            >
              <HugeiconsIcon aria-hidden icon={TextIcon} size={14} />
              Text
            </Button>
            <Button
              fullWidthLeft
              onClick={() => setIsPicking((v) => !v)}
              type="button"
              variant="noborder"
            >
              <HugeiconsIcon aria-hidden icon={Image01Icon} size={14} />
              Image
            </Button>
            <Button
              fullWidthLeft
              onClick={() => addNode("generate")}
              type="button"
              variant="noborder"
            >
              <HugeiconsIcon aria-hidden icon={SparklesIcon} size={14} />
              Generate
            </Button>
            <Button
              fullWidthLeft
              onClick={() => addNode("describe")}
              type="button"
              variant="noborder"
            >
              <HugeiconsIcon aria-hidden icon={SearchVisualIcon} size={14} />
              Analyse
            </Button>
            <Button
              fullWidthLeft
              onClick={() => addNode("join")}
              type="button"
              variant="noborder"
            >
              <HugeiconsIcon aria-hidden icon={LinkSquare01Icon} size={14} />
              Combine
            </Button>
            <Button
              fullWidthLeft
              onClick={() => addNode("iterate")}
              type="button"
              variant="noborder"
            >
              <HugeiconsIcon aria-hidden icon={RepeatIcon} size={14} />
              Iterate
            </Button>
            <Button
              fullWidthLeft
              onClick={() => addNode("icon")}
              type="button"
              variant="noborder"
            >
              <HugeiconsIcon aria-hidden icon={MagicWand01Icon} size={14} />
              Icon
            </Button>
            <Button
              fullWidthLeft
              onClick={() => addNode("palette")}
              type="button"
              variant="noborder"
            >
              <HugeiconsIcon aria-hidden icon={PaintBoardIcon} size={14} />
              Palette
            </Button>
            <Button
              fullWidthLeft
              onClick={() => addNode("prompt")}
              type="button"
              variant="noborder"
            >
              <HugeiconsIcon aria-hidden icon={TextIcon} size={14} />
              Prompt
            </Button>
            <Button
              fullWidthLeft
              onClick={addFrame}
              type="button"
              variant="noborder"
            >
              <HugeiconsIcon aria-hidden icon={FrameIcon} size={14} />
              Frame
            </Button>
          </motion.div>

          <BoardCanvas
            autoEditId={autoEditId}
            comments={comments}
            drawStyle={drawStyle}
            drawTool={drawTool}
            items={items}
            keyOf={keyOf}
            onArrangeFrame={autoArrange}
            onBringToFront={bringToFront}
            onCancel={graphRun.cancel}
            onChange={change}
            onConfigChange={changeConfig}
            onCopyFrame={(frame, title) => void copyFrameToBoard(frame, title)}
            onCreateFromPort={createFromPort}
            onDraw={addDrawing}
            onDropFiles={(files, point) => void dropFiles(files, point)}
            onDropImage={dropImage}
            onEditImage={openEditor}
            onExportItem={(itemId) => void exportItem(itemId)}
            onGroupIntoFrame={groupIntoFrame}
            onMaskStroke={addMaskStroke}
            onOpenInAffinity={(itemId) => void openItemInAffinity(itemId)}
            onRemoveVersion={(itemId, index) =>
              void removeVersion(itemId, index)
            }
            onRun={(itemId, force) => void runNode(itemId, force)}
            onSaveElement={beginElement}
            onSelectionChange={setSelectedItem}
            onSendToBack={sendToBack}
            onSendToCanva={openSendToCanva}
            onSendVersions={sendVersions}
            onVectorize={(itemId) => void vectorizeItem(itemId)}
            onWiresChange={changeWires}
            viewCentreRef={viewCentreRef}
            wires={wires}
          />

          {canvaTarget ? (
            <SendToCanvaModal
              imageUrl={canvaTarget.imageUrl}
              name={canvaTarget.name}
              onClose={() => setCanvaTarget(null)}
            />
          ) : null}

          {pendingSvg ? (
            <SvgImportDialog
              count={pendingSvg.files.length}
              onCancel={() => setPendingSvg(null)}
              onConvertPng={() => void importSvg(false)}
              onKeepSvg={() => void importSvg(true)}
            />
          ) : null}

          {showComments ? (
            <CommentsPanel
              comments={comments}
              items={items}
              onClose={() => setShowComments(false)}
              onResolve={(commentId, resolved) =>
                void resolveComment(commentId, resolved)
              }
            />
          ) : null}

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

          <AnimatePresence>
            {isPicking ? (
              <BoardInsertPanel
                initialTab={pickAt}
                onAddElement={(element) => {
                  addElement(element);
                  setIsPicking(false);
                }}
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
                onDetachSource={detachSource}
                photos={photos}
                setIsOpen={(open) => {
                  setIsPicking(open);
                  if (!open) {
                    // Cleared on close so the next opening goes back to the usual
                    // first tab — being sent to the library once does not mean the
                    // panel now lives there.
                    setPickAt(undefined);
                  }
                }}
                sources={sources}
              />
            ) : null}
          </AnimatePresence>

          {editorNode}

          {elementDraft ? (
            <ElementModal
              description={elementDraft.description}
              images={elementDraft.images}
              onCancel={() => setElementDraft(null)}
              onSaved={() => {
                // Ends on the library the element was just added to, so the thing
                // that was named can be placed without hunting for it.
                setElementDraft(null);
                setPickAt("elements");
                setIsPicking(true);
              }}
            />
          ) : null}
        </div>
      </div>
    </ModelsProvider>
  );
}
