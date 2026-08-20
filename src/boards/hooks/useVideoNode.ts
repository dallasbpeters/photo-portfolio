import { useCallback, useRef } from "react";
import { toast } from "sonner";
import type { BoardItem } from "../../types";
import { runVideo } from "../io/videoRun";
import { outputImageOf } from "../itemOutput";

/**
 * Running a Video node, which the graph runner cannot do.
 *
 * `useGraphRun` walks the board and expects each node to answer inside one
 * request. A clip answers over minutes, through a submit/poll/collect endpoint
 * of its own, so sending it down that path would either hold the whole
 * traversal or — worse, and what happened before this existed — fall through to
 * the image branch and hand a video model id to fal.run, which fails after the
 * request has been made.
 *
 * So the Run button forks here on node type. That fork is the only thing that
 * makes the node work at all; everything under it was already built.
 */

/** Runs a node: a video here, anything else through the graph runner. */
export type RunNode = (itemId: string, force: boolean) => Promise<void>;

/** What a Video node reads off its own settings. */
const settingsOf = (item: BoardItem) => {
  const config = (item.config ?? {}) as Record<string, unknown>;
  const text = (key: string): string =>
    typeof config[key] === "string" ? (config[key] as string).trim() : "";
  // The camera direction is joined onto the prompt rather than sent separately:
  // every endpoint takes one prompt string, and the two are kept apart on the
  // node only so that a camera move is not written into the description of the
  // shot, where models draw it as an object in the scene.
  const motion = text("motion");
  const prompt = [text("prompt"), motion].filter(Boolean).join(". ");
  return { duration: text("duration") || "5", model: text("model"), prompt };
};

export const useVideoNode = (
  boardId: string | null,
  items: BoardItem[],
  wires: { sourceItemId: string; targetItemId: string; targetPort: string }[],
  onChange: (items: BoardItem[]) => void,
  fallback: RunNode
): RunNode => {
  // The board as it is *now*, not as it was when the run started.
  //
  // A video takes minutes, and every write below happens after that wait — so
  // a closure over `items` would rebuild the board from a snapshot taken before
  // it, silently undoing anything moved, added or dropped in the meantime. An
  // item dragged onto the canvas mid-run simply vanished a moment later.
  const latest = useRef(items);
  latest.current = items;

  return useCallback(
    async (itemId: string, force: boolean): Promise<void> => {
      const item = latest.current.find((c) => c.id === itemId);
      // Everything that is not a video goes where it always went. The fork is
      // here rather than inside the graph runner so that runner keeps its one
      // rule — every node answers within a request — instead of gaining an
      // exception for the single node type that cannot.
      if (item?.nodeType !== "video") {
        return fallback(itemId, force);
      }
      if (!boardId) {
        toast.error("Save the board before generating a video");
        return;
      }
      // The picture comes off the wire rather than the node: a Video node holds
      // no image of its own, and the whole point is to animate something that
      // is already on the board.
      const wire = wires.find(
        (w) => w.targetItemId === item.id && w.targetPort === "image"
      );
      const source = wire
        ? latest.current.find((c) => c.id === wire.sourceItemId)
        : undefined;
      const imageUrl = source ? outputImageOf(source, latest.current) : null;
      if (!imageUrl) {
        toast.error("Wire a picture into the Video node first");
        return;
      }

      const { duration, model, prompt } = settingsOf(item);
      if (!model) {
        toast.error("Choose a video model");
        return;
      }

      // Written onto the item, not into a hook-local flag: the node reads its
      // own `runState`, and that is the only thing on screen that can say a
      // four-minute wait has started. Without it the button appears to do
      // nothing at all — which is exactly how it looked.
      const patch = (fields: Partial<BoardItem>) =>
        onChange(
          latest.current.map((it) =>
            it.id === item.id ? { ...it, ...fields } : it
          )
        );
      patch({ runError: null, runState: "running" });
      try {
        const result = await runVideo(
          boardId,
          item.id,
          { duration, imageUrl, model, prompt },
          {
            // Queue position while it waits, so a long generation reads as
            // queued rather than stuck.
            onProgress: (next) =>
              patch({
                runError:
                  next.status === "IN_QUEUE" && next.queuePosition !== null
                    ? `Queued · ${next.queuePosition}`
                    : null,
              }),
          }
        );
        patch({
          result: result as unknown as BoardItem["result"],
          runState: "succeeded",
        });
        toast.success("Video ready");
      } catch (e) {
        // The message is fal's own wherever there is one — after a wait this
        // long, "it failed" is not an answer anybody can act on. Recorded on
        // the node as well as toasted, so it survives the toast fading.
        const message = e instanceof Error ? e.message : "The video failed";
        patch({ runError: message, runState: "failed" });
        toast.error(message);
      }
    },
    [boardId, fallback, onChange, wires]
  );
};
