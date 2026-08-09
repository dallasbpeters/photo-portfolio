import Image from "@tiptap/extension-image";

/**
 * Image formatting shared by the editor and the public page.
 *
 * The stored document is ProseMirror JSON that the site renders itself, so
 * anything the editor can set has to be understood at both ends — an alignment
 * only the editor honours would look right while writing and wrong once
 * published.
 */

export type ImageAlign = "left" | "center" | "right" | "full";

export const IMAGE_ALIGNMENTS: ImageAlign[] = [
  "left",
  "center",
  "right",
  "full",
];

export const isImageAlign = (value: unknown): value is ImageAlign =>
  typeof value === "string" && (IMAGE_ALIGNMENTS as string[]).includes(value);

/** Width as a percentage of the column. Null means the alignment decides. */
export const IMAGE_WIDTHS = [25, 50, 75, 100] as const;

/**
 * Image with alignment and width.
 *
 * Stored as plain attributes rather than wrapper nodes, so an existing document
 * keeps working: an image saved before this simply has no align attribute and
 * falls back to the previous full-width behaviour.
 */
export const FormattedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: "center",
        parseHTML: (element) => element.getAttribute("data-align") ?? "center",
        renderHTML: (attributes) => ({ "data-align": attributes.align }),
      },
      width: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-width");
          return raw ? Number(raw) : null;
        },
        renderHTML: (attributes) =>
          attributes.width ? { "data-width": String(attributes.width) } : {},
      },
    };
  },
});

/**
 * Layout for one image, used by the editor's stylesheet and the page renderer.
 *
 * "full" deliberately ignores the width: it means edge to edge, and pairing it
 * with a percentage would be contradictory.
 */
export const imageLayout = (
  align: ImageAlign,
  width: number | null
): { className: string; style: React.CSSProperties } => {
  if (align === "full") {
    return { className: "w-full", style: {} };
  }

  const style: React.CSSProperties = {
    width: width ? `${width}%` : "100%",
  };

  if (align === "left") {
    return { className: "mr-auto ml-0", style };
  }
  if (align === "right") {
    return { className: "mr-0 ml-auto", style };
  }
  return { className: "mx-auto", style };
};
