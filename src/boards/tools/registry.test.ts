import { describe, expect, it } from "vitest";
import {
  blockedReason,
  listTools,
  searchTools,
  TOOLS,
  toolById,
  toolsForKind,
  toolsInGroup,
  withDefaults,
} from "./registry";
import { TOOL_EXECUTOR_IDS, TOOL_GROUPS, type Tool } from "./types";

describe("lookup", () => {
  it("finds a tool by id", () => {
    expect(toolById("rotate-right")?.label).toBe("Rotate right");
  });

  it("returns null for an id nothing registers", () => {
    // Null rather than throwing: a stored id can outlive its tool, and a chat
    // can be typed at with anything at all.
    expect(toolById("solarise")).toBeNull();
    expect(toolById("")).toBeNull();
  });

  it("lists every registered tool", () => {
    expect(listTools()).toHaveLength(TOOLS.length);
    expect(listTools().length).toBeGreaterThan(0);
  });

  it("has no duplicate ids", () => {
    // Ids are written into history entries and typed as slash commands, so two
    // tools sharing one would make both unaddressable.
    expect(new Set(TOOLS.map((tool) => tool.id)).size).toBe(TOOLS.length);
  });

  it("declares only known groups and executors", () => {
    for (const tool of TOOLS) {
      expect(TOOL_GROUPS).toContain(tool.group);
      expect(TOOL_EXECUTOR_IDS).toContain(tool.executor);
      expect(tool.appliesTo.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });
});

describe("group filtering", () => {
  it("splits the list in two and loses nothing", () => {
    const ai = toolsInGroup("ai");
    const transform = toolsInGroup("transform");
    expect(ai.length).toBeGreaterThan(0);
    expect(transform.length).toBeGreaterThan(0);
    expect(ai.length + transform.length).toBe(TOOLS.length);
  });

  it("returns everything for the All tab", () => {
    expect(toolsInGroup(null)).toHaveLength(TOOLS.length);
  });

  it("returns only tools of the asked-for group", () => {
    expect(toolsInGroup("ai").every((tool) => tool.group === "ai")).toBe(true);
  });

  it("filters by the kind of item the bar is anchored to", () => {
    const forNote = toolsForKind("note");
    expect(forNote.every((tool) => tool.appliesTo.includes("note"))).toBe(true);
    // A note has no pixels, so nothing that rotates one should be offered.
    expect(forNote.map((tool) => tool.id)).not.toContain("rotate-right");
    expect(toolsForKind("photo").map((tool) => tool.id)).toContain(
      "rotate-right"
    );
  });
});

describe("search", () => {
  it("matches the label", () => {
    expect(searchTools("rotate").map((tool) => tool.id)).toEqual([
      "rotate-right",
      "rotate-left",
    ]);
  });

  it("matches the description, not only the label", () => {
    // "quarter turn" appears nowhere in a label.
    expect(searchTools("quarter turn").map((tool) => tool.id)).toEqual([
      "rotate-right",
      "rotate-left",
    ]);
  });

  it("matches a keyword that is in neither", () => {
    // "inpaint" is the word someone who knows the field would type; the tool
    // is labelled "Replace" because that is the word everyone else would.
    expect(searchTools("inpaint").map((tool) => tool.id)).toEqual([
      "replace-area",
    ]);
  });

  it("narrows as terms are added rather than widening", () => {
    const one = searchTools("rotate");
    const two = searchTools("rotate left");
    expect(two.length).toBeLessThan(one.length);
    expect(two.map((tool) => tool.id)).toEqual(["rotate-left"]);
  });

  it("matches inside a word, so a prefix is not required", () => {
    expect(searchTools("paint").map((tool) => tool.id)).toContain(
      "replace-area"
    );
  });

  it("ignores case and surrounding space", () => {
    expect(searchTools("  ROTATE  ").map((tool) => tool.id)).toEqual(
      searchTools("rotate").map((tool) => tool.id)
    );
  });

  it("returns everything for an empty query, so a panel need not branch", () => {
    expect(searchTools("")).toHaveLength(TOOLS.length);
    expect(searchTools("   ")).toHaveLength(TOOLS.length);
  });

  it("returns nothing when nothing matches", () => {
    expect(searchTools("kaleidoscope")).toHaveLength(0);
  });

  it("searches within a group, which is what a tab plus a query means", () => {
    expect(searchTools("rotate", "ai")).toHaveLength(0);
    expect(searchTools("rotate", "transform")).toHaveLength(2);
  });
});

describe("defaults", () => {
  it("fills in a declared default", () => {
    const tool = toolById("rotate-right");
    if (!tool) {
      throw new Error("rotate-right must exist");
    }
    expect(withDefaults(tool)).toEqual({ degrees: 90 });
    expect(withDefaults(toolById("rotate-left") as never)).toEqual({
      degrees: -90,
    });
  });

  it("lets a provided value win", () => {
    const tool = toolById("rotate-right");
    if (!tool) {
      throw new Error("rotate-right must exist");
    }
    expect(withDefaults(tool, { degrees: 180 })).toEqual({ degrees: 180 });
  });

  it("leaves text settings absent rather than defaulting them to empty", () => {
    // An empty string would read as "the user cleared this", which is a
    // different thing from "the user has not typed anything yet".
    //
    // Asserted key by key rather than against an empty object: the tool also
    // declares a model, which does have a default, and a whole-object match
    // would fail for the wrong reason the moment any settable thing gained one.
    const tool = toolById("edit-image");
    if (!tool) {
      throw new Error("edit-image must exist");
    }
    expect(withDefaults(tool)).not.toHaveProperty("prompt");
    expect(withDefaults(tool).model).toBe("auto");
  });
});

describe("blockedReason", () => {
  const ready = { hasImage: true, hasMask: true, hasPrompt: true };

  it("clears a ready tool with everything it needs", () => {
    expect(blockedReason(toolById("rotate-right") as never, ready)).toBeNull();
    expect(blockedReason(toolById("edit-image") as never, ready)).toBeNull();
  });

  it("blocks a planned tool and says so", () => {
    expect(blockedReason(toolById("crop") as never, ready)).toContain(
      "not built yet"
    );
  });

  it("says a planned tool is unbuilt before it says anything else", () => {
    // replace-area needs a mask and is not built. "Not built yet" is the more
    // useful of the two answers, so it must win — telling someone to paint a
    // mask for a tool that could not use one would be a small betrayal.
    const reason = blockedReason(toolById("replace-area") as never, {
      ...ready,
      hasMask: false,
    });
    expect(reason).toContain("not built yet");
  });

  it("names the missing mask", () => {
    // Built inline: every registered mask tool is still planned, and the
    // planned check would shadow this branch. The branch is what the bar's
    // disabled reason will read from the moment one ships.
    const masked: Tool = {
      ...(toolById("replace-area") as Tool),
      status: "ready",
    };
    expect(blockedReason(masked, { ...ready, hasMask: false })).toContain(
      "mask"
    );
    expect(blockedReason(masked, ready)).toBeNull();
  });

  it("names the missing prompt", () => {
    const reason = blockedReason(toolById("edit-image") as never, {
      ...ready,
      hasPrompt: false,
    });
    expect(reason).toContain("description");
  });

  it("names the missing image for a local transform", () => {
    const reason = blockedReason(toolById("rotate-right") as never, {
      ...ready,
      hasImage: false,
    });
    expect(reason).toContain("image");
  });
});

/**
 * Which tools claim to be usable.
 *
 * `status` is what the picker draws and what the executor checks, so a tool
 * marked ready that the executor does not implement is offered, chosen, and then
 * refused as "not built yet" — the worst of the three states, because it looks
 * like a bug rather than a limit.
 */
describe("ready tools", () => {
  const ready = listTools().filter((tool) => tool.status === "ready");

  it("includes the tools that take a picture and nothing else", () => {
    const ids = ready.map((tool) => tool.id);
    expect(ids).toContain("remove-background");
    expect(ids).toContain("vectorize");
  });

  it("asks for no prompt where the model reads none", () => {
    // Their models' input is "image". Demanding words means inventing some to
    // send to a model that ignores them.
    for (const id of ["remove-background", "vectorize"]) {
      expect(toolById(id)?.needsPrompt).toBe(false);
    }
  });

  it("pins a model for those two rather than asking", () => {
    // Which background remover to use is a question about our plumbing, not
    // about the picture — so it has an answer rather than a control.
    for (const id of ["remove-background", "vectorize"]) {
      const setting = toolById(id)?.settings.find((s) => s.kind === "model");
      expect(setting && "default" in setting ? setting.default : null).not.toBe(
        "auto"
      );
    }
  });

  it("lets Restyle run now that the endpoint forwards a model", () => {
    const restyle = toolById("restyle");
    expect(restyle?.status).toBe("ready");
    // The style *is* the model: the table's LoRA rows are models to fal.
    expect(restyle?.settings.some((s) => s.kind === "model")).toBe(true);
  });
});
