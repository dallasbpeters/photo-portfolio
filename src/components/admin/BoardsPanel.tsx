import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Delete02Icon,
  FrameIcon,
} from "@hugeicons-pro/core-stroke-standard";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import posthog from "../../lib/posthog";
import { boardsApi } from "../../services/portfolioService";
import type { Board } from "../../types";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { useConfirm } from "./ConfirmProvider";
import "../../styles/primitives.css";
import "../../styles/adminChrome.css";
import "./BoardsPanel.css";

/**
 * Moodboards: somewhere to plan a shoot before shooting it.
 *
 * The list stays deliberately thin — a board is only meaningful open, so this
 * is a way in and out rather than a place to manage metadata.
 */
/**
 * Warms the board editor's code before it is asked for.
 *
 * The editor is a `lazy()` route and by far the largest module graph in the app
 * — the canvas, every node view, the shader stack, the drawing tools. Cold, that
 * import measured **22 seconds** in dev, and a first-visit chunk fetch in
 * production is not free either.
 *
 * What made it unbearable was not the wait but where the wait was hidden.
 * Clicking a board starts a transition that suspends, and concurrent React
 * deliberately keeps the *previous* screen on display rather than flashing a
 * fallback — so the board list simply sat there, giving no sign the click had
 * landed, and the natural response was to click again. Hence "it takes ten
 * clicks": every one of them worked.
 *
 * Hovering happens before clicking essentially every time with a pointer, so
 * starting the import there usually means the module is already resolved by the
 * time the press lands. The specifier matches App.tsx's exactly so both reach
 * the same module — warming this warms what `lazy()` will await.
 */
const prefetchBoardEditor = () => {
  void import("../../pages/BoardPage");
};

/**
 * Starts warming as soon as the list is on screen, when the browser is idle.
 *
 * Hovering is late: it is a second or two before a click, and this import took
 * far longer than that. Opening a board is the only thing this screen is for, so
 * the editor is going to be needed — the question is whether the loading happens
 * while somebody reads the list or while they stare at a frozen one.
 *
 * On the idle callback so it cannot contend with the list's own fetch, which is
 * what the screen needs first. `setTimeout` where there is no
 * `requestIdleCallback`, which is Safari.
 */
const warmWhenIdle = (): (() => void) => {
  const idle = (
    globalThis as {
      requestIdleCallback?: (cb: () => void) => number;
    }
  ).requestIdleCallback;
  if (idle) {
    const handle = idle(prefetchBoardEditor);
    return () => {
      (
        globalThis as { cancelIdleCallback?: (h: number) => void }
      ).cancelIdleCallback?.(handle);
    };
  }
  const timer = setTimeout(prefetchBoardEditor, 1200);
  return () => clearTimeout(timer);
};

export function BoardsPanel() {
  const { confirm, prompt } = useConfirm();
  const navigate = useNavigate();
  const [boards, setBoards] = useState<Board[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  /*
   * Which board is being opened.
   *
   * `useTransition` is what makes this knowable: a transition that suspends on
   * a lazy import stays pending until it can commit, so `isOpening` is true for
   * exactly as long as the editor is loading. Without it there is no signal at
   * all — react-router's plain `<Routes>` has no navigation state to read.
   */
  const [isOpening, startOpening] = useTransition();
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(warmWhenIdle, []);

  const openBoard = useCallback(
    (boardId: string) => {
      setOpeningId(boardId);
      startOpening(() => {
        navigate(`/admin/boards/${boardId}`);
      });
    },
    [navigate]
  );

  const load = useCallback(async () => {
    try {
      setBoards(await boardsApi.list());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load boards");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    const title = await prompt({
      confirmLabel: "Create",
      placeholder: "Golden hour shoot",
      title: "New board",
    });
    if (title === null) {
      return;
    }
    try {
      const board = await boardsApi.create(title.trim() || "Untitled board");
      posthog.capture("board_created");
      setBoards((prev) => [board, ...prev]);
      navigate(`/admin/boards/${board.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create board"
      );
    }
  };

  const remove = async (board: Board) => {
    const ok = await confirm({
      confirmLabel: "Delete",
      description: `"${board.title}" and everything arranged on it will be removed. This cannot be undone.`,
      destructive: true,
      title: "Delete board?",
    });
    if (!ok) {
      return;
    }
    try {
      await boardsApi.remove(board.id);
      posthog.capture("board_deleted");
      setBoards((prev) => prev.filter((b) => b.id !== board.id));
      toast.success("Board deleted");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not delete board"
      );
    }
  };

  const childVariants = {
    hover: { opacity: 1, scale: 1.1, y: -10 },
    initial: { opacity: 0.8, scale: 1, y: 0 },
  };

  return (
    <Card className="admin-card">
      <CardHeader className="row row--between row--mid">
        <CardTitle className="admin-heading">
          <HugeiconsIcon aria-hidden icon={FrameIcon} size={16} />
          Moodboards
        </CardTitle>
        <Button onClick={() => void create()} type="button" variant="outline">
          <HugeiconsIcon aria-hidden icon={Add01Icon} size={14} />
          New board
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading ? <p className="boards-panel__count">Loading…</p> : null}

        {!isLoading && boards.length === 0 ? (
          <p className="boards-panel__note">
            No boards yet. A board is a canvas for planning a shoot — collect
            references, pin your own frames next to them, and leave yourself
            notes.
          </p>
        ) : null}

        <ul className="boards-panel__grid">
          <AnimatePresence>
            {boards.map((board) => (
              <motion.li initial="initial" key={board.id} whileHover="hover">
                <div className="group admin-tile boards-panel__tile">
                  {/*
                   * onClick, not Motion's onTap, and the scale barely moves.
                   *
                   * onTap only fires if the pointer is still within the element
                   * when it is released — and `whileTap: 0.9` shrank the card to
                   * nine tenths under the finger, so a press anywhere but dead
                   * centre ended up outside it and the tap was dropped. Opening
                   * a board took anywhere up to a dozen clicks, and clicking
                   * faster made it worse, because each release landed earlier in
                   * the shrink.
                   *
                   * onClick is dispatched on the element the press began on
                   * regardless of what the animation did to its box. The press
                   * feedback stays, at a depth that cannot move the target out
                   * from under the pointer.
                   */}
                  <motion.button
                    className="admin-tile__open"
                    /* Disabled while this one is opening, so the repeat clicks
                       the old silence invited cannot queue up behind it. */
                    disabled={isOpening && openingId === board.id}
                    onClick={() => openBoard(board.id)}
                    onFocus={prefetchBoardEditor}
                    onPointerEnter={prefetchBoardEditor}
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="admin-tile__frame">
                      {board.coverUrl ? (
                        <motion.img
                          alt=""
                          className="admin-fill"
                          height={300}
                          src={board.coverUrl}
                          transition={{
                            damping: 20,
                            stiffness: 300,
                            type: "spring",
                          }}
                          variants={childVariants}
                          width={400}
                        />
                      ) : (
                        <HugeiconsIcon
                          aria-hidden
                          className="admin-tile__placeholder"
                          icon={FrameIcon}
                          size={32}
                        />
                      )}
                    </div>
                    <div className="admin-tile__caption stack stack--snug">
                      <p className="admin-tile__name">{board.title}</p>
                      {/*
                        The item count gives way to "Opening…" while the editor
                        loads. Replacing a line rather than adding one, so the
                        card does not change height and shift the grid at the
                        exact moment a press is being confirmed.
                      */}
                      <p className="admin-tile__meta">
                        {isOpening && openingId === board.id
                          ? "Opening…"
                          : `${board.itemCount ?? 0} ${board.itemCount === 1 ? "item" : "items"}`}
                      </p>
                    </div>
                  </motion.button>

                  {/* A bar across the foot of the cover while the editor loads.
                      The label above says what is happening; this says it is
                      still happening, which a static word cannot. */}
                  {isOpening && openingId === board.id ? (
                    <span aria-hidden className="boards-panel__opening" />
                  ) : null}

                  <button
                    aria-label={`Delete ${board.title}`}
                    className="boards-panel__delete"
                    onClick={() => void remove(board)}
                    type="button"
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={14} />
                  </button>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </CardContent>
    </Card>
  );
}
