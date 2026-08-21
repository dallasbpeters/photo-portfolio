import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Delete02Icon,
  FrameIcon,
} from "@hugeicons-pro/core-stroke-standard";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { boardsApi } from "../../services/portfolioService";
import type { Board } from "../../types";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { useConfirm } from "./ConfirmProvider";

/**
 * Moodboards: somewhere to plan a shoot before shooting it.
 *
 * The list stays deliberately thin — a board is only meaningful open, so this
 * is a way in and out rather than a place to manage metadata.
 */
export function BoardsPanel() {
  const { confirm, prompt } = useConfirm();
  const navigate = useNavigate();
  const [boards, setBoards] = useState<Board[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
    <Card className="w-full border-white/10 bg-white/2">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2 font-light text-sm text-white/90 uppercase tracking-[0.2em]">
          <HugeiconsIcon aria-hidden icon={FrameIcon} size={16} />
          Moodboards
        </CardTitle>
        <Button onClick={() => void create()} type="button" variant="outline">
          <HugeiconsIcon aria-hidden icon={Add01Icon} size={14} />
          New board
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <p className="text-[11px] text-white/50 uppercase tracking-widest">
            Loading…
          </p>
        ) : null}

        {!isLoading && boards.length === 0 ? (
          <p className="text-[12px] text-white/60 leading-relaxed">
            No boards yet. A board is a canvas for planning a shoot — collect
            references, pin your own frames next to them, and leave yourself
            notes.
          </p>
        ) : null}

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <AnimatePresence>
            {boards.map((board) => (
              <motion.li initial="initial" key={board.id} whileHover="hover">
                <div className="group relative overflow-hidden rounded-lg border border-white/10 bg-black/40">
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
                    className="block w-full cursor-pointer text-left"
                    onClick={() => navigate(`/admin/boards/${board.id}`)}
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex aspect-4/3 items-center justify-center bg-neutral-900">
                      {board.coverUrl ? (
                        <motion.img
                          alt=""
                          className="h-full w-full object-cover"
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
                          className="text-white/15"
                          icon={FrameIcon}
                          size={32}
                        />
                      )}
                    </div>
                    <div className="space-y-1 p-3">
                      <p className="truncate font-light text-[13px] text-white/90">
                        {board.title}
                      </p>
                      <p className="text-[10px] text-white/40 uppercase tracking-[0.2em]">
                        {board.itemCount ?? 0}{" "}
                        {board.itemCount === 1 ? "item" : "items"}
                      </p>
                    </div>
                  </motion.button>

                  <button
                    aria-label={`Delete ${board.title}`}
                    className="absolute top-2 right-2 flex size-9 items-center justify-center rounded-full bg-black/70 text-white/60 opacity-0 transition-opacity hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
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
