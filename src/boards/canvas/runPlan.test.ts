import { describe, expect, it } from "vitest";
import type { BoardItem, BoardWire } from "../../types";
import { runPlanFor } from "./runPlan";
import type { Graph } from "./wiredPreviews";

/**
 * What pressing Run will actually cost.
 *
 * The number that was here counted Iterations times Loops — the two fields you
 * type — and nothing that was wired, which is where a board multiplies. Two
 * prompts and nine pictures is eighteen generations and it said one.
 *
 * These cases are the arithmetic of jobsFor, restated. The two live on
 * different machines in different files and nothing but agreement keeps them
 * equal, so where they differ, this side is the one that is wrong.
 */

const node = (id: string, fields: Partial<BoardItem> = {}): BoardItem =>
  ({
    config: {},
    height: 10,
    id,
    kind: "op",
    nodeType: "standard",
    width: 10,
    x: 0,
    y: 0,
    ...fields,
  }) as unknown as BoardItem;

const wire = (source: string, target: string, port: string): BoardWire =>
  ({
    id: `${source}->${target}:${port}`,
    sourceItemId: source,
    sourcePort: "out",
    targetItemId: target,
    targetPort: port,
  }) as unknown as BoardWire;

/** A List node holding the given rows, as outputListOf reads one. */
const list = (id: string, items: string[]): BoardItem =>
  node(id, { config: { items: items.join("\n") }, nodeType: "list" });

/** A placed picture, which is what a frame hands over one of. */
const picture = (id: string, url: string): BoardItem =>
  node(id, { imageUrl: url, kind: "photo", nodeType: null });

const graphOf = (items: BoardItem[], wires: BoardWire[]): Graph => ({
  items,
  wires,
});

describe("runPlanFor", () => {
  it("is one run for a bare node", () => {
    const target = node("gen");
    expect(runPlanFor(target, graphOf([target], [])).runs).toBe(1);
  });

  it("counts the prompts a wired list is offering", () => {
    const target = node("gen");
    const graph = graphOf(
      [target, list("l", ["a man on a cliff", "a man at sea"])],
      [wire("l", "gen", "prompt")]
    );
    const plan = runPlanFor(target, graph);
    expect(plan.prompts).toBe(2);
    expect(plan.runs).toBe(2);
  });

  it("counts every picture wired in", () => {
    const target = node("gen");
    const pictures = Array.from({ length: 9 }, (_, i) =>
      picture(`p${i}`, `https://ours/${i}.jpg`)
    );
    const graph = graphOf(
      [target, ...pictures],
      pictures.map((p) => wire(p.id, "gen", "image"))
    );
    expect(runPlanFor(target, graph).runs).toBe(9);
  });

  it("multiplies prompts by pictures, which is the screenshot", () => {
    /*
     * Two texts and nine images. This is the graph that started it: the panel
     * said one generation and the run bought eighteen.
     */
    const target = node("gen");
    const pictures = Array.from({ length: 9 }, (_, i) =>
      picture(`p${i}`, `https://ours/${i}.jpg`)
    );
    const graph = graphOf(
      [target, list("l", ["a man on a cliff", "a man at sea"]), ...pictures],
      [
        wire("l", "gen", "prompt"),
        ...pictures.map((p) => wire(p.id, "gen", "image")),
      ]
    );
    const plan = runPlanFor(target, graph);
    expect(plan.prompts).toBe(2);
    expect(plan.images).toBe(9);
    expect(plan.runs).toBe(18);
  });

  it("multiplies by iterations and loops on top", () => {
    const target = node("gen", { config: { count: 2, loops: 3 } });
    const graph = graphOf(
      [target, list("l", ["one", "two"])],
      [wire("l", "gen", "prompt")]
    );
    expect(runPlanFor(target, graph).runs).toBe(2 * 2 * 3);
  });

  it("joins several prompt wires instead of multiplying them", () => {
    // Each wire is a part of every run — a subject and a palette, say — so two
    // wires of two rows is two runs, not four. jobsFor reads them across.
    const target = node("gen");
    const graph = graphOf(
      [target, list("a", ["red", "blue"]), list("b", ["cat", "dog"])],
      [wire("a", "gen", "prompt"), wire("b", "gen", "prompt")]
    );
    expect(runPlanFor(target, graph).runs).toBe(2);
  });

  it("takes the longer wire, because a short list repeats", () => {
    const target = node("gen");
    const graph = graphOf(
      [target, list("a", ["red", "blue", "green"]), list("b", ["cat"])],
      [wire("a", "gen", "prompt"), wire("b", "gen", "prompt")]
    );
    expect(runPlanFor(target, graph).runs).toBe(3);
  });

  it("is one run when the pictures are blended into one", () => {
    const target = node("gen", { config: { multiImage: "blend" } });
    const pictures = [
      picture("p0", "https://ours/0.jpg"),
      picture("p1", "https://ours/1.jpg"),
    ];
    const graph = graphOf(
      [target, ...pictures],
      pictures.map((p) => wire(p.id, "gen", "image"))
    );
    expect(runPlanFor(target, graph).runs).toBe(1);
  });

  it("does not count an element's cover as a picture to work through", () => {
    // An element is a style, and a style is never the subject. Counting it
    // would read as one run more expensive than the node really is.
    const target = node("gen");
    const element = node("e", {
      imageUrl: "https://ours/cover.jpg",
      nodeType: "element",
    });
    const graph = graphOf(
      [target, element, picture("p0", "https://ours/0.jpg")],
      [wire("e", "gen", "image"), wire("p0", "gen", "image")]
    );
    expect(runPlanFor(target, graph).runs).toBe(1);
  });

  it("ignores wired pictures for a model that takes none", () => {
    const target = node("gen");
    const pictures = Array.from({ length: 5 }, (_, i) =>
      picture(`p${i}`, `https://ours/${i}.jpg`)
    );
    const graph = graphOf(
      [target, ...pictures],
      pictures.map((p) => wire(p.id, "gen", "image"))
    );
    expect(runPlanFor(target, graph, true).runs).toBe(1);
  });

  it("refuses to believe a field that is out of range", () => {
    // Both are one keystroke from a number nobody meant, and unlike most
    // mistakes on a board this one is charged for.
    for (const config of [
      { count: 0 },
      { count: -4 },
      { count: "many" },
      { loops: Number.NaN },
    ]) {
      const target = node("gen", { config });
      expect(runPlanFor(target, graphOf([target], [])).runs).toBe(1);
    }
  });

  it("caps a field above its own maximum", () => {
    const target = node("gen", { config: { count: 999, loops: 999 } });
    const plan = runPlanFor(target, graphOf([target], []));
    expect(plan.variations).toBeLessThanOrEqual(8);
    expect(plan.loops).toBeLessThanOrEqual(8);
  });
});
