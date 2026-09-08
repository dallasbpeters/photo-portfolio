import { useEffect, useState } from "react";
import { toast } from "sonner";
import { pollTraining } from "../io/dataset";

/**
 * Collects finished trainings, wherever in the admin you happen to be.
 *
 * A training is started from a board — that is where the frame is — and takes
 * minutes. Nothing holds the job, so something has to come back and collect
 * it, and for a while the only thing that did was the Models panel. So the
 * ordinary path was: train from a board, stay on the board, and the run
 * finished on fal and sat there uncollected. The model never appeared, and
 * there was nothing to suggest that looking at a different screen was what it
 * was waiting for.
 *
 * Mounted by both the board and the admin page instead. The endpoint is
 * idempotent, so two screens open cannot turn one training into two models.
 *
 * It asks the server rather than reading a list it has been given, which is
 * the point: a board does not load the admin's model list, so anything keyed
 * to that list could never have worked from a board.
 */

/**
 * How often to ask, once something is known to be training.
 *
 * A run takes minutes, so this is not about being quick. It is about the model
 * arriving within a minute of being ready rather than whenever somebody next
 * reloads.
 */
const POLL_MS = 30_000;

export interface TrainingWatch {
  /** How many runs are still going, as of the last check. */
  training: number;
}

/**
 * Watches for finished trainings and announces them.
 *
 * @param enabled Whether to watch at all. False on a published board, where
 *   there is no admin to tell and the endpoint would refuse the request.
 * @param onFinished Called when a run lands, so a screen showing models can
 *   refresh itself.
 */
export const useTrainingWatch = (
  enabled: boolean,
  onFinished?: () => void
): TrainingWatch => {
  const [training, setTraining] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const check = async () => {
      try {
        const result = await pollTraining();
        if (!alive) {
          return;
        }
        setTraining(result.training);
        if (result.finished.length > 0) {
          toast.success(
            result.finished.length === 1
              ? `"${result.finished[0].label}" is trained and ready to use.`
              : `${result.finished.length} styles are trained and ready.`
          );
          onFinished?.();
        }
        // Only keep asking while there is something to ask about. One check
        // per screen visit is cheap; a timer running forever on a board with
        // nothing training is a request every thirty seconds for no reason.
        if (result.training === 0 && timer) {
          clearInterval(timer);
          timer = null;
        }
      } catch {
        // A failed check is not a failed training, and nothing can be done
        // about it from here. The next tick tries again; saying so every
        // thirty seconds would be noise about somebody else's outage.
      }
    };

    void check();
    timer = setInterval(() => void check(), POLL_MS);
    return () => {
      alive = false;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [enabled, onFinished]);

  return { training };
};
