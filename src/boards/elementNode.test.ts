import { describe, expect, it } from "vitest";
import type { BoardItem, Element } from "../types";
import {
  configFromSource,
  elementConfig,
  elementStyle,
  styleTransferPrompt,
} from "./elementNode";

const node = (config: Record<string, unknown>): BoardItem =>
  ({
    config,
    id: "e1",
    kind: "op",
    nodeType: "element",
  }) as unknown as BoardItem;

const NOIR = node({
  description: "high contrast, magenta rim light, wet asphalt",
  elementId: "abc",
  name: "Neon Noir",
});

describe("elementConfig", () => {
  it("copies the style onto the node", () => {
    const element = {
      coverUrl: "https://example.test/a.png",
      description: "wet asphalt",
      id: "abc",
      name: "Neon Noir",
    } as unknown as Element;
    expect(elementConfig(element)).toEqual({
      description: "wet asphalt",
      elementId: "abc",
      imageUrl: "https://example.test/a.png",
      name: "Neon Noir",
    });
  });

  it("writes fields the reader can read back", () => {
    // The two directions are one agreement; this is the test that keeps them
    // honest if a field is ever added to only one side.
    const element = {
      coverUrl: null,
      description: "wet asphalt",
      id: "abc",
      name: "Neon Noir",
    } as unknown as Element;
    const item = node(elementConfig(element));
    expect(elementStyle(item)).toEqual({
      description: "wet asphalt",
      name: "Neon Noir",
    });
  });
});

describe("elementStyle", () => {
  it("reads the name and description off the node", () => {
    expect(elementStyle(NOIR)).toEqual({
      description: "high contrast, magenta rim light, wet asphalt",
      name: "Neon Noir",
    });
  });

  it("tolerates a board saved before the element had a description", () => {
    expect(elementStyle(node({ name: "Neon Noir" }))).toEqual({
      description: "",
      name: "Neon Noir",
    });
  });

  it("treats whitespace and non-strings as absent", () => {
    expect(elementStyle(node({ description: "   ", name: 42 }))).toEqual({
      description: "",
      name: "",
    });
  });
});

describe("styleTransferPrompt", () => {
  /**
   * The description is deliberately absent. It is seeded from a Describe node,
   * which set to "subject" writes prose about whoever is in the reference — and
   * pasted after "in the style of" that tells the model to draw that person
   * instead of restyling the picture actually wired in.
   */
  it("names the style without quoting the description", () => {
    expect(styleTransferPrompt(NOIR)).toBe(
      "Redraw the attached image in the style of Neon Noir. Keep the subject, pose, framing and likeness exactly as they are — change only the rendering."
    );
  });

  it("keeps a subject-worded description out of the prompt", () => {
    const subjecty = node({
      description: "A digital painting of a person's head and shoulders",
      name: "Ink Style",
    });
    expect(styleTransferPrompt(subjecty)).toBe(
      "Redraw the attached image in the style of Ink Style. Keep the subject, pose, framing and likeness exactly as they are — change only the rendering."
    );
  });

  it("still says something useful with no description", () => {
    expect(styleTransferPrompt(node({ name: "Neon Noir" }))).toBe(
      "Redraw the attached image in the style of Neon Noir. Keep the subject, pose, framing and likeness exactly as they are — change only the rendering."
    );
  });

  it("falls back when the element is unnamed", () => {
    expect(styleTransferPrompt(node({}))).toBe(
      "Redraw the attached image in this style. Keep the subject, pose, framing and likeness exactly as they are — change only the rendering."
    );
  });

  it("ends in a single full stop", () => {
    const prompt = styleTransferPrompt(
      node({ description: "Shot on 35mm.", name: "Film" })
    );
    expect(prompt).toBe(
      "Redraw the attached image in the style of Film. Keep the subject, pose, framing and likeness exactly as they are — change only the rendering."
    );
    expect(prompt.endsWith("..")).toBe(false);
  });
});

describe("configFromSource", () => {
  it("pre-fills the prompt when the source is an element", () => {
    expect(configFromSource(NOIR)).toEqual({
      prompt: styleTransferPrompt(NOIR),
      styleFrom: "abc",
    });
  });

  /**
   * The marker is what stops the run appending the style a second time. It is
   * the only link between the prompt written here and the append suppressed in
   * `elementStyleOf`, so losing it would silently double the style rather than
   * break anything.
   */
  it("records which element the prompt was written from", () => {
    expect(configFromSource(NOIR).styleFrom).toBe("abc");
  });

  it("omits the marker when the element has no library id", () => {
    expect(configFromSource(node({ name: "Noir" }))).toEqual({
      prompt:
        "Redraw the attached image in the style of Noir. Keep the subject, pose, framing and likeness exactly as they are — change only the rendering.",
    });
  });

  it("leaves every other node type alone", () => {
    const generate = { config: { prompt: "a cat" }, nodeType: "generate" };
    expect(configFromSource(generate as unknown as BoardItem)).toEqual({});
  });
});
