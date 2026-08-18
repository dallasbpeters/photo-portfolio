import { describe, expect, it } from "vitest";
import { CANVAS_WIDTH } from "../../config/canvas.js";
import type { PortType } from "../../config/nodeTypes.js";
import {
  MAX_RECIPE_NODES,
  recipeGraphIsPlaceable,
} from "../../config/recipes.js";
import {
  expandRecipeGraph,
  extractRecipeGraph,
  type TemplateItem,
  type TemplateWire,
} from "./recipes.js";

const node = (over: Partial<TemplateItem> & { id: string }): TemplateItem => ({
  config: {},
  height: 320,
  kind: "op",
  nodeType: "generate",
  runState: "succeeded",
  width: 320,
  x: 0,
  y: 0,
  ...over,
});

/** Every port is an image unless the test says otherwise. */
const imagePorts = (): PortType => "image";
const portTypeOf = (_n: string | null, port: string): PortType | null =>
  port === "prompt" ? "text" : imagePorts();

/** Deterministic ids, so a test can assert wiring rather than match UUIDs. */
const counter = () => {
  let n = 0;
  return () => {
    n += 1;
    return `id-${n}`;
  };
};

describe("extractRecipeGraph", () => {
  it("turns absolute positions into offsets from the selection's corner", () => {
    const items = [
      node({ id: "a", x: 1200, y: 800 }),
      node({ id: "b", x: 1600, y: 950 }),
    ];
    const out = extractRecipeGraph(items, [], ["a", "b"], portTypeOf);
    if ("reason" in out) {
      throw new Error(`expected success, got ${out.reason}`);
    }
    expect(out.graph.nodes.map((n) => [n.dx, n.dy])).toEqual([
      [0, 0],
      [400, 150],
    ]);
  });

  it("keeps a wire whose ends are both inside the selection", () => {
    const items = [node({ id: "a" }), node({ id: "b", x: 400 })];
    const wires: TemplateWire[] = [
      {
        sourceItemId: "a",
        sourcePort: "out",
        targetItemId: "b",
        targetPort: "image",
      },
    ];
    const out = extractRecipeGraph(items, wires, ["a", "b"], portTypeOf);
    if ("reason" in out) {
      throw new Error("expected success");
    }
    expect(out.graph.wires).toEqual([
      { from: "n1", fromPort: "out", to: "n2", toPort: "image" },
    ]);
    expect(out.declaredInputs).toHaveLength(0);
  });

  it("turns a wire crossing into the selection into a declared input", () => {
    const items = [node({ id: "outside", x: -400 }), node({ id: "a" })];
    const wires: TemplateWire[] = [
      {
        sourceItemId: "outside",
        sourcePort: "out",
        targetItemId: "a",
        targetPort: "image",
      },
    ];
    const out = extractRecipeGraph(items, wires, ["a"], portTypeOf);
    if ("reason" in out) {
      throw new Error("expected success");
    }
    expect(out.graph.wires).toHaveLength(0);
    expect(out.declaredInputs).toEqual([
      {
        key: "n1.image",
        label: "image",
        nodeKey: "n1",
        port: "image",
        required: true,
        type: "image",
      },
    ]);
  });

  it("drops a wire leaving the selection — what consumed it is not moving", () => {
    const items = [node({ id: "a" }), node({ id: "downstream", x: 400 })];
    const wires: TemplateWire[] = [
      {
        sourceItemId: "a",
        sourcePort: "out",
        targetItemId: "downstream",
        targetPort: "image",
      },
    ];
    const out = extractRecipeGraph(items, wires, ["a"], portTypeOf);
    if ("reason" in out) {
      throw new Error("expected success");
    }
    expect(out.graph.wires).toHaveLength(0);
    expect(out.declaredInputs).toHaveLength(0);
  });

  it("carries the declared input's own port type, not a default", () => {
    const items = [node({ id: "outside", x: -400 }), node({ id: "a" })];
    const wires: TemplateWire[] = [
      {
        sourceItemId: "outside",
        sourcePort: "out",
        targetItemId: "a",
        targetPort: "prompt",
      },
    ];
    const out = extractRecipeGraph(items, wires, ["a"], portTypeOf);
    if ("reason" in out) {
      throw new Error("expected success");
    }
    expect(out.declaredInputs[0]?.type).toBe("text");
  });

  it("refuses a selection holding a node already in a recipe group (FR-008)", () => {
    const items = [node({ id: "a", recipeUseId: "use-1" })];
    const out = extractRecipeGraph(items, [], ["a"], portTypeOf);
    expect(out).toMatchObject({ reason: "nested" });
  });

  it(`refuses more than ${MAX_RECIPE_NODES} nodes`, () => {
    const items = Array.from({ length: MAX_RECIPE_NODES + 1 }, (_, i) =>
      node({ id: `n${i}`, x: i * 10 })
    );
    const out = extractRecipeGraph(
      items,
      [],
      items.map((i) => i.id),
      portTypeOf
    );
    expect(out).toMatchObject({ reason: "too-many" });
  });

  it("refuses a selection with no runnable node", () => {
    const items = [node({ id: "a", kind: "reference", nodeType: null })];
    const out = extractRecipeGraph(items, [], ["a"], portTypeOf);
    expect(out).toMatchObject({ reason: "no-nodes" });
  });

  it("saves a selection that never ran, and marks it unverified (T036)", () => {
    const items = [node({ id: "a", runState: null })];
    const out = extractRecipeGraph(items, [], ["a"], portTypeOf);
    if ("reason" in out) {
      throw new Error("expected success — the work is real");
    }
    expect(out.unverified).toBe(true);
  });

  it("is verified when any node in the selection has succeeded", () => {
    const items = [
      node({ id: "a", runState: null }),
      node({ id: "b", x: 400 }),
    ];
    const out = extractRecipeGraph(items, [], ["a", "b"], portTypeOf);
    if ("reason" in out) {
      throw new Error("expected success");
    }
    expect(out.unverified).toBe(false);
  });
});

describe("expandRecipeGraph", () => {
  const stencil = {
    nodes: [
      {
        config: { prompt: "muted greens" },
        dx: 0,
        dy: 0,
        height: 320,
        key: "n1",
        nodeType: "describe" as const,
        width: 320,
      },
      {
        config: {},
        dx: 400,
        dy: 150,
        height: 320,
        key: "n2",
        nodeType: "generate" as const,
        width: 320,
      },
    ],
    wires: [{ from: "n1", fromPort: "out", to: "n2", toPort: "prompt" }],
  };

  it("lays the stencil down at the drop point, keeping its shape", () => {
    const { items } = expandRecipeGraph(
      stencil,
      "use-1",
      { x: 1000, y: 500 },
      counter()
    );
    expect(items.map((i) => [i.x, i.y])).toEqual([
      [1000, 500],
      [1400, 650],
    ]);
  });

  it("mints fresh ids and rewires between them", () => {
    const { items, wires } = expandRecipeGraph(
      stencil,
      "use-1",
      { x: 0, y: 0 },
      counter()
    );
    expect(wires).toEqual([
      {
        id: "id-3",
        sourceItemId: items[0]?.id,
        sourcePort: "out",
        targetItemId: items[1]?.id,
        targetPort: "prompt",
      },
    ]);
  });

  it("tags every placed node with the use that created it", () => {
    const { items } = expandRecipeGraph(
      stencil,
      "use-42",
      { x: 0, y: 0 },
      counter()
    );
    expect(items.every((i) => i.recipeUseId === "use-42")).toBe(true);
  });

  it("clamps the drop so the whole group lands on the canvas", () => {
    const { items } = expandRecipeGraph(
      stencil,
      "use-1",
      { x: CANVAS_WIDTH + 5000, y: 0 },
      counter()
    );
    const right = Math.max(...items.map((i) => i.x + i.width));
    expect(right).toBeLessThanOrEqual(CANVAS_WIDTH);
  });

  it("drops a wire naming a node the stencil does not hold", () => {
    const broken = {
      nodes: stencil.nodes,
      wires: [{ from: "n1", fromPort: "out", to: "ghost", toPort: "image" }],
    };
    const { wires } = expandRecipeGraph(
      broken,
      "use-1",
      { x: 0, y: 0 },
      counter()
    );
    expect(wires).toHaveLength(0);
  });

  it("carries no result — a placed recipe has run nothing", () => {
    const { items } = expandRecipeGraph(
      stencil,
      "use-1",
      { x: 0, y: 0 },
      counter()
    );
    for (const item of items) {
      expect(item).not.toHaveProperty("result");
    }
  });
});

describe("round trip", () => {
  it("extraction then expansion reproduces the arrangement elsewhere", () => {
    const items = [
      node({ id: "a", nodeType: "describe", x: 1200, y: 800 }),
      node({ id: "b", nodeType: "generate", x: 1600, y: 950 }),
    ];
    const wires: TemplateWire[] = [
      {
        sourceItemId: "a",
        sourcePort: "out",
        targetItemId: "b",
        targetPort: "prompt",
      },
    ];
    const out = extractRecipeGraph(items, wires, ["a", "b"], portTypeOf);
    if ("reason" in out) {
      throw new Error("expected success");
    }
    const placed = expandRecipeGraph(
      out.graph,
      "use-1",
      { x: 3000, y: 2000 },
      counter()
    );
    // Same relative geometry, different absolute home.
    const [first, second] = placed.items;
    expect([
      (second?.x ?? 0) - (first?.x ?? 0),
      (second?.y ?? 0) - (first?.y ?? 0),
    ]).toEqual([400, 150]);
    expect(placed.wires).toHaveLength(1);
    expect(placed.wires[0]?.targetPort).toBe("prompt");
  });
});

describe("recipeGraphIsPlaceable", () => {
  it("names every node type the registry no longer knows", () => {
    const graph = {
      nodes: [
        { ...stencilNode("n1", "generate") },
        { ...stencilNode("n2", "obsolete") },
      ],
      wires: [],
    };
    const out = recipeGraphIsPlaceable(graph as never, (v) => v === "generate");
    expect(out).toEqual({ missing: ["obsolete"], ok: false });
  });
});

function stencilNode(key: string, nodeType: string) {
  return {
    config: {},
    dx: 0,
    dy: 0,
    height: 320,
    key,
    nodeType,
    width: 320,
  };
}
