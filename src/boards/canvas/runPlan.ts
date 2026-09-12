import { wantsBlend } from "../../../config/nodes/generate";
import { MAX_LOOPS } from "../../../config/nodes/generation";
import { MAX_BATCH_COUNT } from "../../../config/nodes/limits";
import type { BoardItem } from "../../types";
import { outputListOf } from "../itemOutput";
import type { Graph } from "./wiredPreviews";
import { wiredImagesFor } from "./wiredPreviews";

/**
 * How many generations pressing Run will actually buy.
 *
 * There was a number already, and it only counted the two fields you type:
 * Iterations times Loops. It knew nothing about what was *wired*, which is
 * where the multiplying really happens — a List of two prompts and a frame of
 * nine pictures is eighteen runs, and the panel said one.
 *
 * That is the wrong way round for a cost preview. A board is a graph, and the
 * expensive part of a graph is never the part you typed.
 *
 * This mirrors jobsFor deliberately and has to keep mirroring it: the number
 * shown and the number billed come from two different files on two different
 * machines, and the only thing keeping them equal is that they are written the
 * same way. Where they disagree, this one is wrong.
 */

/** What a single press of Run will do, and the parts that make up the total. */
export interface RunPlan {
  /** Distinct pictures the node will work through. One when none is wired. */
  images: number;
  /** Passes over each result, which bills again each time. */
  loops: number;
  /** Distinct prompts arriving on the prompt port. One when none is wired. */
  prompts: number;
  /** Generations bought: prompts x images x variations x loops. */
  runs: number;
  /** The Iterations field — copies of each job. */
  variations: number;
}

/** A whole number in range, or the default a missing field stands for. */
const bounded = (value: unknown, max: number): number => {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return Math.min(parsed, max);
};

/**
 * How many prompts the prompt port is offering.
 *
 * Mirrors jobsFor: each wire is a *part* of every run and is joined with the
 * others, so several wires do not multiply — but a single wire carrying
 * several values makes several runs, and the longest wire sets how many. A
 * short list repeats rather than truncating, which is why this is the maximum
 * and not the minimum.
 */
const promptRows = (itemId: string, graph: Graph): number => {
  const perWire = graph.wires
    .filter(
      (wire) => wire.targetItemId === itemId && wire.targetPort === "prompt"
    )
    .map((wire) => graph.items.find((item) => item.id === wire.sourceItemId))
    .map((source) => outputListOf(source ?? null, graph))
    .map((list) => list.filter((text) => text.trim()))
    .filter((list) => list.length > 0);
  return perWire.length === 0
    ? 1
    : Math.max(...perWire.map((list) => list.length));
};

/**
 * The pictures this node is *of*, which is not everything wired to it.
 *
 * An element arrives on the image port like any other picture and is taken
 * back out again, because an element is a style and a style is never the
 * subject. Counted the same way here, or a node with a style wired in reads as
 * one run more expensive than it is — see jobsFor, which does the subtracting
 * for real.
 */
const subjectCount = (itemId: string, graph: Graph): number => {
  const covers = new Set(
    graph.items
      .filter((item) => item.nodeType === "element" && item.imageUrl)
      .map((item) => item.imageUrl as string)
  );
  return wiredImagesFor(itemId, graph).filter((url) => !covers.has(url)).length;
};

/**
 * What one press of Run costs.
 *
 * `promptOnly` is the caller's to answer because only it holds the model list:
 * a text-to-image model is handed no pictures at all, so a frame wired into
 * one multiplies nothing. Saying otherwise would put a number on the node that
 * the run will not honour.
 */
export const runPlanFor = (
  item: BoardItem,
  graph: Graph,
  promptOnly = false
): RunPlan => {
  const config = item.config ?? {};
  const variations = bounded(config.count, MAX_BATCH_COUNT);
  const loops = bounded(config.loops, MAX_LOOPS);
  const prompts = promptRows(item.id, graph);
  const subjects = promptOnly ? 0 : subjectCount(item.id, graph);
  /*
   * Blending is one run of everything; separate is one run each.
   *
   * The same two yeses the run takes — the node asked, and there is more than
   * one picture to blend. Whether the endpoint can is not knowable here
   * without resolving it, and getting that wrong understates the cost, so the
   * node's own setting is taken at its word: a count that is too high is a
   * warning, and one that is too low is a surprise on the invoice.
   */
  const images =
    subjects === 0 || (wantsBlend(config) && subjects > 1) ? 1 : subjects;
  return {
    images,
    loops,
    prompts,
    runs: prompts * images * variations * loops,
    variations,
  };
};
