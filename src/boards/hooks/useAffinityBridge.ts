import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { boardsApi } from "../../services/portfolioService";
import {
  type AffinityWriteback,
  affinityOpen,
  affinityReadSvg,
  affinityStatus,
} from "../io/affinity";

/**
 * The "Open in Affinity" loop for a board.
 *
 * Opening hands the SVG to the local bridge and starts polling it; when the
 * file changes (the user saved in Affinity) the new source is read back and
 * written into the node through the app's own API — the browser carries the
 * session, so the bridge never has to know who is asking. The node's result
 * and the selected version are the caller's to update, through `applyResult`,
 * exactly as deleting a version is.
 *
 * One poll loop at a time: opening a second item stops the first.
 */

const POLL_MS = 1000;

export const useAffinityBridge = (
  boardId: string,
  applyResult: (itemId: string, writeback: AffinityWriteback) => void
) => {
  /** The freshest applyResult, without the effect having to re-run for it. */
  const applyRef = useRef(applyResult);
  applyRef.current = applyResult;

  const syncRef = useRef<{ itemId: string; timer: number } | null>(null);

  const stop = useCallback(() => {
    window.clearInterval(syncRef.current?.timer);
    syncRef.current = null;
  }, []);

  // Leaving the board is a stop signal: polling a closed board would happily
  // keep writing to it.
  useEffect(() => stop, [stop]);

  const openInAffinity = useCallback(
    async (itemId: string, url: string) => {
      stop();
      const baseline = await affinityOpen(itemId, url);
      let lastHash = baseline;

      const tick = async () => {
        try {
          const status = await affinityStatus(itemId);
          if (
            !status.file ||
            status.hash === null ||
            status.hash === lastHash
          ) {
            return;
          }
          const svg = await affinityReadSvg(itemId);
          const writeback = await boardsApi.writebackSvg(boardId, itemId, svg);
          applyRef.current(itemId, writeback);
          lastHash = status.hash;
          toast.success("Updated from Affinity");
        } catch (err) {
          stop();
          toast.error(
            err instanceof Error ? err.message : "Affinity sync stopped"
          );
        }
      };

      void tick();
      syncRef.current = {
        itemId,
        timer: window.setInterval(() => void tick(), POLL_MS),
      };
    },
    [boardId, stop]
  );

  return { openInAffinity };
};
