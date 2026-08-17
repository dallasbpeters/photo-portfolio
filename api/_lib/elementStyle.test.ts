import { describe, expect, it } from "vitest";
import type { BoardItemRow, BoardWireRow } from "./boards.js";
import {
  elementStyleOf,
  type Job,
  type JobShape,
  jobsFor,
  styleBriefKey,
  withElementWords,
} from "./elementStyle.js";

/**
 * The rules that decide what a run costs and whether a style is sent at all.
 *
 * They fail silently when they are wrong: an element that fans out into its own
 * job bills twice and returns a picture nobody asked for, and a style reference
 * that is dropped bills in full and looks like a style that did not take.
 * Neither throws, so neither shows up anywhere but the invoice.
 */

/** Only the fields these functions read carry meaning; the rest is ballast. */
const row = (id: string, fields: Partial<BoardItemRow> = {}): BoardItemRow => ({
  body: null,
  created_at: "2026-01-01T00:00:00.000Z",
  credit_name: null,
  credit_url: null,
  height: 100,
  id,
  image_url: null,
  kind: "op",
  photo_id: null,
  thumb_url: null,
  width: 100,
  x: 0,
  y: 0,
  z_index: 1,
  ...fields,
});

/** An element node as withElements leaves it: cover on the row, brief in config. */
const elementRow = (
  id: string,
  cover: string,
  brief: string,
  words: string | null = null
): BoardItemRow =>
  row(id, {
    body: words,
    config: { elementId: id, styleBrief: brief },
    image_url: cover,
    node_type: "element",
  });

const wire = (
  source: string,
  target: string,
  port = "image"
): BoardWireRow => ({
  id: `${source}->${target}`,
  source_item_id: source,
  source_port: "out",
  target_item_id: target,
  target_port: port,
});

/** A Generate node on a model that takes both a prompt and a picture. */
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

describe("reading an element off the wires", () => {
  it("collects the cover, the brief and the words", () => {
    const rows = [
      elementRow("el", "cover.jpg", "oil on linen", "muted"),
      row("gen", { node_type: "generate" }),
    ];
    expect(elementStyleOf("gen", rows, [wire("el", "gen")])).toEqual({
      briefs: ["oil on linen"],
      images: ["cover.jpg"],
      words: ["muted"],
    });
  });

  /**
   * A node pulled off an element's port is born with that element's words in
   * its prompt field, and records which element they came from. Appending them
   * again would state the style twice — and because these words come from the
   * live library row while the prompt was written from the copy on the node,
   * an element edited since would have the model told two different things.
   */
  it("keeps quiet when the prompt was already written from this element", () => {
    const rows = [
      elementRow("el", "cover.jpg", "oil on linen", "muted greys"),
      row("gen", { config: { styleFrom: "el" }, node_type: "generate" }),
    ];
    expect(elementStyleOf("gen", rows, [wire("el", "gen")])).toEqual({
      // The brief is never in the prompt field, so it is never already said.
      briefs: ["oil on linen"],
      images: ["cover.jpg"],
      words: [],
    });
  });

  it("still speaks for a different element wired into the same node", () => {
    const rows = [
      elementRow("el", "cover.jpg", "oil on linen", "muted greys"),
      elementRow("other", "o.jpg", "charcoal", "wet asphalt"),
      row("gen", { config: { styleFrom: "el" }, node_type: "generate" }),
    ];
    expect(
      elementStyleOf("gen", rows, [wire("el", "gen"), wire("other", "gen")])
        .words
    ).toEqual(["wet asphalt"]);
  });

  it("gathers two elements, and says each thing once", () => {
    const rows = [
      elementRow("one", "one.jpg", "oil on linen", "muted"),
      elementRow("two", "two.jpg", "oil on linen", "muted"),
      row("gen", { node_type: "generate" }),
    ];
    const wires = [wire("one", "gen"), wire("two", "gen")];
    expect(elementStyleOf("gen", rows, wires)).toEqual({
      briefs: ["oil on linen"],
      images: ["one.jpg", "two.jpg"],
      words: ["muted"],
    });
  });

  it("ignores wires into other nodes, and nodes that are not elements", () => {
    const rows = [
      elementRow("el", "cover.jpg", "oil on linen", "muted"),
      row("photo", { image_url: "mine.jpg", kind: "photo" }),
      row("gen", { node_type: "generate" }),
      row("other", { node_type: "generate" }),
    ];
    const wires = [wire("el", "other"), wire("photo", "gen")];
    expect(elementStyleOf("gen", rows, wires)).toEqual({
      briefs: [],
      images: [],
      words: [],
    });
  });
});

describe("shaping jobs around a style", () => {
  it("is ONE job when an element and a picture are wired together", () => {
    const jobs = jobsFor(
      shape({
        briefs: ["oil on linen"],
        elementImages: ["cover.jpg"],
        values: { image: ["cover.jpg", "mine.jpg"] },
      })
    );
    expect(jobs).toHaveLength(1);
    // The user's picture is the subject; the element is how it should look.
    expect(jobs[0].image).toBe("mine.jpg");
    expect(jobs[0].prompt).toBe("a portrait, oil on linen");
  });

  it("is still TWO jobs for two pictures of my own", () => {
    const jobs = jobsFor(shape({ values: { image: ["one.jpg", "two.jpg"] } }));
    expect(images(jobs)).toEqual(["one.jpg", "two.jpg"]);
    expect(jobs.every((job) => job.prompt === "a portrait")).toBe(true);
  });

  it("styles both of two pictures without adding a job", () => {
    const jobs = jobsFor(
      shape({
        briefs: ["oil on linen"],
        elementImages: ["cover.jpg"],
        values: { image: ["cover.jpg", "one.jpg", "two.jpg"] },
      })
    );
    expect(images(jobs)).toEqual(["one.jpg", "two.jpg"]);
    for (const job of jobs) {
      expect(job.prompt).toBe("a portrait, oil on linen");
    }
  });

  it("generates from words when an element is the only thing wired", () => {
    const jobs = jobsFor(
      shape({
        briefs: ["oil on linen"],
        elementImages: ["cover.jpg"],
        values: { image: ["cover.jpg"] },
      })
    );
    expect(jobs).toHaveLength(1);
    // No subject, so no picture is sent. The cover used to stand in as one,
    // and an edit model handed a single image does the only thing it can with
    // it — so an element on its own returned a copy of its own cover.
    expect(jobs[0].image).toBeNull();
    // The style still arrives; it travels as words, which is the whole design.
    expect(jobs[0].prompt).toBe("a portrait, oil on linen");
  });

  it("never sends a cover, even alongside a real subject", () => {
    // The cover rides in on the image port like any other picture and has to be
    // subtracted. Left in, it becomes a second job — a run of the style applied
    // to itself, billed beside the one that was asked for.
    const jobs = jobsFor(
      shape({
        briefs: ["oil on linen"],
        elementImages: ["cover.jpg"],
        values: { image: ["cover.jpg", "subject.jpg"] },
      })
    );
    expect(images(jobs)).toEqual(["subject.jpg"]);
  });

  it("invents from the prompt when nothing at all is wired", () => {
    const jobs = jobsFor(shape());
    expect(jobs).toEqual([{ image: null, mask: null, prompt: "a portrait" }]);
  });

  it("multiplies by the variation count, not by the references", () => {
    const jobs = jobsFor(
      shape({
        briefs: ["oil on linen"],
        config: { count: 3 },
        elementImages: ["cover.jpg"],
        values: { image: ["cover.jpg", "mine.jpg"] },
      })
    );
    expect(images(jobs)).toEqual(["mine.jpg", "mine.jpg", "mine.jpg"]);
  });

  it("gives a prompt-only model neither subject nor references", () => {
    const jobs = jobsFor(
      shape({
        briefs: ["oil on linen"],
        elementImages: ["cover.jpg"],
        shape: "prompt",
        values: { image: ["cover.jpg", "mine.jpg"] },
      })
    );
    expect(jobs).toEqual([{ image: null, mask: null, prompt: "a portrait" }]);
  });

  it("keeps the mask of the picture it belongs to", () => {
    const jobs = jobsFor(
      shape({
        briefs: ["oil on linen"],
        elementImages: ["cover.jpg"],
        masks: new Map([["mine.jpg", "mask.png"]]),
        values: { image: ["cover.jpg", "mine.jpg"] },
      })
    );
    expect(jobs[0].mask).toBe("mask.png");
  });

  it("runs one job per wired prompt, each carrying the style", () => {
    const jobs = jobsFor(
      shape({
        briefs: ["oil on linen"],
        elementImages: ["cover.jpg"],
        lists: { prompt: [["a cat", "a dog"]] },
        values: {
          image: ["cover.jpg", "mine.jpg"],
          prompt: ["a cat", "a dog"],
        },
      })
    );
    expect(jobs.map((job) => job.prompt)).toEqual([
      "a cat, oil on linen",
      "a dog, oil on linen",
    ]);
    expect(jobs.map((job) => job.image)).toEqual(["mine.jpg", "mine.jpg"]);
    for (const job of jobs) {
      expect(job.prompt).toContain("oil on linen");
    }
  });

  it("reads every picture in one go for Analyse, style or not", () => {
    const jobs = jobsFor(
      shape({
        briefs: ["oil on linen"],
        capability: "fal.describe",
        elementImages: ["cover.jpg"],
        values: { image: ["cover.jpg", "mine.jpg"] },
      })
    );
    expect(jobs).toEqual([
      { image: "cover.jpg", mask: null, prompt: "a portrait" },
    ]);
  });

  it("leaves a composite as the single stored run it is", () => {
    const jobs = jobsFor(
      shape({
        briefs: ["oil on linen"],
        capability: "board.composite",
        elementImages: ["cover.jpg"],
        values: { image: ["cover.jpg", "mine.jpg"] },
      })
    );
    expect(jobs).toEqual([{ image: null, mask: null, prompt: "" }]);
  });
});

describe("the words an element carries", () => {
  it("appends them after the prompt", () => {
    expect(withElementWords("a portrait", ["muted greens, 35mm"])).toBe(
      "a portrait, muted greens, 35mm"
    );
  });

  it("does not say them twice when the prompt already does", () => {
    // The canvas pre-fills a new node's prompt with the description.
    const said = "muted greens, 35mm";
    expect(withElementWords(said, [said])).toBe(said);
    expect(withElementWords(`a portrait, ${said}`, [said])).toBe(
      `a portrait, ${said}`
    );
  });

  it("ignores case and spacing when deciding it was already said", () => {
    expect(
      withElementWords("A portrait,  MUTED   greens", ["muted greens"])
    ).toBe("A portrait,  MUTED   greens");
  });

  it("appends the one that is missing and not the one that is not", () => {
    expect(
      withElementWords("a portrait, muted greens", ["muted greens", "35mm"])
    ).toBe("a portrait, muted greens, 35mm");
  });

  it("is just the words when nothing was typed", () => {
    expect(withElementWords("  ", ["muted greens"])).toBe("muted greens");
  });
});

/**
 * The key is the only thing that notices an element has changed.
 *
 * It fails silently in both directions: too eager and every run pays for a
 * fresh reading of pictures that did not move, too slack and an edited element
 * keeps generating in the style it used to have — which reads as the edit
 * simply not working.
 */
describe("styleBriefKey", () => {
  const IMAGES = ["a.jpg", "b.jpg"];

  it("is stable for the same style", () => {
    expect(styleBriefKey("muted greys", IMAGES)).toBe(
      styleBriefKey("muted greys", IMAGES)
    );
  });

  it("changes when the description is rewritten", () => {
    expect(styleBriefKey("muted greys", IMAGES)).not.toBe(
      styleBriefKey("wet asphalt", IMAGES)
    );
  });

  it("changes when a picture is added or removed", () => {
    expect(styleBriefKey("muted greys", IMAGES)).not.toBe(
      styleBriefKey("muted greys", ["a.jpg"])
    );
  });

  /**
   * Order is meaning here: the cover leads the list, and the brief is anchored
   * on it. Promoting a different picture is a different style.
   */
  it("changes when the cover is promoted", () => {
    expect(styleBriefKey("muted greys", IMAGES)).not.toBe(
      styleBriefKey("muted greys", ["b.jpg", "a.jpg"])
    );
  });

  it("ignores whitespace around the description", () => {
    expect(styleBriefKey("  muted greys \n", IMAGES)).toBe(
      styleBriefKey("muted greys", IMAGES)
    );
  });
});
