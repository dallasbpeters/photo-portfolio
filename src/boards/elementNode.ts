import type { BoardItem, Element } from "../types";

/**
 * What an element node carries, and what it says when you pull a wire off it.
 *
 * An Element is a saved style — a name, a description of what makes it that
 * style, and the pictures that demonstrate it. Both directions live here
 * together because they are one agreement: `elementConfig` decides which of the
 * style's fields are copied onto the node, and everything else in this file
 * reads those same fields back. Split across two files, a field added to one
 * side goes quietly missing on the other.
 *
 * The prompt matters more than it looks. Wiring an element into a Generate node
 * used to append the description invisibly, server-side, to whatever you typed.
 * A prompt you cannot see is a prompt you cannot fix when the result is wrong —
 * and the description is usually the part that needs tuning. So the intent is
 * written into the prompt field instead, as text you can read and edit.
 */

/** Config keys an element node carries. The shape `elementConfig` produces. */
interface ElementConfig {
  description?: unknown;
  name?: unknown;
}

const textOf = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/** The config an element node is created with. */
export const elementConfig = (element: Element): Record<string, unknown> => ({
  description: element.description ?? "",
  elementId: element.id,
  imageUrl: element.coverUrl ?? "",
  name: element.name,
});

/**
 * Reads the style's name and description back off an element node.
 *
 * Tolerant rather than cast: a board saved before the element carried a
 * description is simply missing the key.
 */
export const elementStyle = (
  item: BoardItem
): { description: string; name: string } => {
  const config = (item.config ?? {}) as ElementConfig;
  return {
    description: textOf(config.description),
    name: textOf(config.name),
  };
};

/**
 * Phrases a style as an instruction to restyle an attached picture.
 *
 * Names the style and stops. The description is deliberately NOT pasted in
 * here, though it was at first: an element's description is seeded from a
 * Describe node in the selection, and a Describe node set to "subject" or
 * "both" writes prose about whoever is in the reference — "a digital painting
 * of a person's head and shoulders, their head turned to the right". Dropped in
 * after "in the style of", that instructs the model to draw that person, and
 * the picture you actually wired in comes back ignored.
 *
 * The look still reaches the model, by a route that cannot be worded wrongly:
 * `ensureStyleBrief` hands the description to the vision model as an
 * instruction under `focus: "style"`, which forbids naming a subject, a person
 * or any text, and the reading it returns is what the run appends. So the
 * description steers the style rather than claiming to be it.
 *
 * The wording assumes the common case — you wire a picture in and want it
 * remade in this style — because that is what an Element is for. It is a
 * starting point; the field belongs to the author once the node exists.
 */
export const styleTransferPrompt = (item: BoardItem): string => {
  const { name } = elementStyle(item);
  const style = name ? `the style of ${name}` : "this style";
  // "Recreate this in X" reads to a model as licence to draw something new in
  // that style, and it takes it: a photograph went in and a different person
  // came back, correctly rendered. What is wanted is a change of medium, not a
  // change of subject, so the invariant is stated before the instruction.
  return `Redraw the attached image in ${style}. Keep the subject, pose, framing and likeness exactly as they are — change only the rendering.`;
};

/**
 * The config a port-spawned node starts with.
 *
 * Empty for everything else — only an element has something worth saying on the
 * new node's behalf.
 */
export const configFromSource = (
  source: BoardItem
): Record<string, unknown> => {
  if (source.nodeType !== "element") {
    return {};
  }
  const id = (source.config ?? {}) as { elementId?: unknown };
  return {
    prompt: styleTransferPrompt(source),
    // Which element this prompt was written from. The run appends a wired
    // element's description to the prompt, which is right when the description
    // is invisible — but it is in the field now, so appending it again would
    // state the style twice. Worse, the run reads the *library* row while this
    // prompt was written from the copy on the node, so once the element is
    // edited the two wordings disagree and the model is given both.
    ...(typeof id.elementId === "string" ? { styleFrom: id.elementId } : {}),
  };
};
