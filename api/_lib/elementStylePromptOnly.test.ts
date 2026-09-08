import { describe, expect, it } from "vitest";
import { type Job, type JobShape, jobsFor } from "./elementStyle.js";

/**
 * A style wired into a model that takes no picture.
 *
 * Its own file because it is the case elements were silently broken on, and
 * because api/_lib/elementStyle.test.ts had no room left to grow.
 *
 * Six of the enabled models are text-to-image. An element's style travels as
 * words precisely so it can reach them — see the note at the top of
 * api/_lib/elementBrief.ts — and dropping those words alongside the image
 * lists left the element contributing nothing at all, since run.ts suppresses
 * the element's description whenever a brief exists.
 */

const shape = (fields: Partial<JobShape> = {}): JobShape => ({
  briefs: [],
  capability: "fal.image",
  config: {},
  elementImages: [],
  lists: {},
  masks: new Map(),
  shape: "prompt-or-image",
  typedPrompt: "a portrait",
  values: {},
  ...fields,
});

const images = (jobs: Job[]): (string | null)[] => jobs.map((job) => job.image);

describe("a style reaches a model that takes no picture", () => {
  /*
   * A text-to-image model is the case elements are most easily broken on, and
   * the one that used to fail silently.
   *
   * The brief is words. Emptying the *image* lists for a model with nowhere to
   * put a picture is right; emptying the brief alongside them left the element
   * contributing nothing, because run.ts drops the element's description
   * whenever a brief exists and trusts jobsFor to have placed it. The run went
   * through and was billed with no style at all.
   */
  it("puts the brief in the prompt for a prompt-only model", () => {
    const jobs = jobsFor(shape({ briefs: ["oil on linen"], shape: "prompt" }));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].prompt).toBe("a portrait, oil on linen");
  });

  it("sends no picture to it, brief or not", () => {
    const jobs = jobsFor(
      shape({
        briefs: ["oil on linen"],
        elementImages: ["cover.jpg"],
        shape: "prompt",
        values: { image: ["cover.jpg", "mine.jpg"] },
      })
    );
    expect(images(jobs)).toEqual([null]);
    expect(jobs[0].prompt).toBe("a portrait, oil on linen");
  });

  it("styles every prompt a list supplies", () => {
    const jobs = jobsFor(
      shape({
        briefs: ["oil on linen"],
        lists: { prompt: [["a boat", "a harbour", "a lighthouse"]] },
        shape: "prompt",
        values: { prompt: ["a boat", "a harbour", "a lighthouse"] },
      })
    );
    // No typed text on the node here (the helper's `typedPrompt` is only the
    // fallback for a node with nothing wired), so each row is the list's own
    // value with the style after it.
    expect(jobs.map((job) => job.prompt)).toEqual([
      "a boat, oil on linen",
      "a harbour, oil on linen",
      "a lighthouse, oil on linen",
    ]);
  });
});
