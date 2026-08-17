import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { boardsApi } from "../../services/portfolioService";
import type { BoardItem } from "../../types.js";
import { promptOf } from "./itemContext.js";
import { maskBitmapUrl } from "./maskBitmap.js";
import type { RunTool } from "./types.js";
import { useToolRunner } from "./useToolRunner.js";

/**
 * A tool run, joined up to a board's item list.
 *
 * `useToolRunner` deliberately knows nothing about a board — it hands back a
 * `BoardItemResult` and stops. This is the other half: where that result goes,
 * and what a failure looks like to somebody who is not reading the console.
 * Kept out of BoardCanvas so the canvas gains a hook call rather than a
 * subsystem, and so this can be read without a 1500-line file around it.
 *
 * ## The result is in memory only
 *
 * `onChange` writes the new `result` onto the item, which is what makes the
 * picture change and what a wire downstream will carry. It does not survive a
 * reload: the board PATCH drops `result` on purpose — the server owns that
 * column — so a tool applied to a plain photo has, as ./history puts it,
 * "nowhere to put it". `api/boards/[id]/svg.ts` is the precedent for the narrow
 * endpoint that would fix this, and until it exists this is the honest limit.
 */

export interface UseBoardToolsOptions {
  boardId?: string | null;
  items: BoardItem[];
  onChange: (items: BoardItem[]) => void;
}

export interface BoardTools {
  isRunning: (itemId: string) => boolean;
  run: RunTool;
}

export const useBoardTools = ({
  boardId = null,
  items,
  onChange,
}: UseBoardToolsOptions): BoardTools => {
  /**
   * The list as it is when the run *lands*, not when it started.
   *
   * A generation is tens of seconds and the board carries on being edited
   * during it. Mapping over a captured `items` would write the result onto a
   * stale list and undo every move made while the model was thinking.
   */
  const latest = useRef(items);
  latest.current = items;

  const { isRunning, run: start } = useToolRunner({
    onFailure: (_itemId, failure) => {
      // "cancelled" is the one code that is not news — it is what a dismissed
      // panel or a second click reports, and a toast for it would be noise.
      if (failure.code === "cancelled") {
        return;
      }
      toast.error(failure.message, { description: failure.hint });
    },
    onResult: (itemId, success) => {
      onChange(
        latest.current.map((item) =>
          item.id === itemId ? { ...item, result: success.result } : item
        )
      );
      // Written through its own endpoint, because a board save never carries
      // `result` — see api/boards/[id]/result.ts. Until this existed a tool
      // showed its work and lost it on the next reload.
      //
      // Not awaited, and a failure only warns: the picture is already on the
      // item and in blob storage, so the run was not wasted. Blocking the
      // canvas on a write it cannot influence would make a slow save look like
      // a slow tool.
      if (boardId) {
        void boardsApi
          .saveToolResult(boardId, itemId, {
            description: success.variation.description,
            height: success.variation.height,
            isVector: success.variation.isVector ?? false,
            url: success.variation.url,
            width: success.variation.width,
          })
          .catch((e: unknown) => {
            toast.warning("That result may not survive a reload", {
              description: e instanceof Error ? e.message : undefined,
            });
          });
      }
    },
  });

  const run = useCallback<RunTool>(
    (item, tool, prompt, config) => {
      /*
       * Fire and forget. `start` resolves to the outcome, but both ends of
       * it are already handled — the result through `onResult`, the failure
       * through a toast — and awaiting here would only give the canvas a
       * promise it has nothing to do with.
       *
       * The mask is rendered first, and only for a tool that asked for one:
       * the picker enables a mask tool from `toolContextOf`, which reads the
       * painted strokes, while the runner decides from `maskUrl`. Building it
       * anywhere else is how those two come to disagree.
       */
      void (async () => {
        let maskUrl: string | null = null;
        if (tool.needsMask) {
          try {
            maskUrl = await maskBitmapUrl(item);
          } catch (cause) {
            toast.error(
              cause instanceof Error
                ? cause.message
                : "The mask could not be prepared"
            );
            return;
          }
        }
        await start({
          boardId,
          config,
          item,
          maskUrl,
          /*
           * What the surface collected, else what the item already carries.
           *
           * Typed words win: a picker that offered a field and then ran on the
           * note's body instead would be the worst kind of wrong — it would
           * produce something, and it would not be what was asked for. Trimmed
           * to nothing counts as nothing, so an all-whitespace field falls back
           * rather than reaching the runner as a prompt that is not one.
           */
          prompt: prompt?.trim() || promptOf(item),
          tool,
        });
      })();
    },
    [boardId, start]
  );

  return { isRunning, run };
};
