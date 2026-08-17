import { mergeAttributes, Node } from "@tiptap/react";

/**
 * A clip in a page.
 *
 * Its own node because TipTap's image node renders an `<img>`, and an mp4 in an
 * `<img>` is a broken icon for an asset that works — the same mistake the board
 * made until `ItemMedia` learned to tell them apart. Inserting a video through
 * `setImage` looked like it had worked right up to the moment the page rendered.
 *
 * A block, not inline: a clip is a figure in the flow of a page, and an inline
 * one would sit in a paragraph being wrapped around by text at whatever height
 * the file happens to be.
 *
 * It carries the same `align` and `width` attributes the formatted image does,
 * so the toolbar's existing controls mean the same thing on both and `PageContent`
 * lays them out the same way. Adding a second vocabulary for the same two
 * decisions would be two things to keep in step.
 */

export interface VideoAttributes {
  align: string;
  src: string;
  title: string | null;
  width: number | null;
}

export const PageVideo = Node.create({
  addAttributes() {
    return {
      align: {
        default: "center",
        parseHTML: (element) => element.getAttribute("data-align") ?? "center",
        renderHTML: (attributes) => ({ "data-align": attributes.align }),
      },
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute("src"),
        renderHTML: (attributes) =>
          attributes.src ? { src: attributes.src } : {},
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute("title"),
        renderHTML: (attributes) =>
          attributes.title ? { title: attributes.title } : {},
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

  addCommands() {
    return {
      setPageVideo:
        (attributes: { src: string; title?: string | null }) =>
        ({
          commands,
        }: {
          commands: { insertContent: (c: unknown) => boolean };
        }) =>
          commands.insertContent({ attrs: attributes, type: this.name }),
    } as never;
  },

  atom: true,
  draggable: true,
  group: "block",
  name: "pageVideo",

  parseHTML() {
    return [{ tag: "video[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "video",
      mergeAttributes(HTMLAttributes, {
        // Controls, unlike the board: a page is read rather than arranged, so
        // there is no drag gesture for a control bar to swallow, and a reader
        // who wants to pause should be able to.
        controls: "true",
        // Muted and looping by default, and never autoplaying: a page that makes
        // noise on load is the one thing every reader agrees about.
        loop: "true",
        muted: "true",
        playsinline: "true",
        preload: "metadata",
      }),
    ];
  },
});
