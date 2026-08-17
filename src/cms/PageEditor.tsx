import { HugeiconsIcon } from "@hugeicons/react";
import {
  Album02Icon,
  Image01Icon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  Link01Icon,
  QuoteDownIcon,
  RedoIcon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextBoldIcon,
  TextIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  UndoIcon,
} from "@hugeicons-pro/core-stroke-standard";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import type { Editor } from "@tiptap/react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "../components/admin/ConfirmProvider";
import { portfolioService } from "../services/portfolioService";
import { AssetPicker } from "./AssetPicker";
import type { ImageAlign } from "./imageAttributes";
import { FormattedImage, IMAGE_WIDTHS } from "./imageAttributes";
import { PageVideo } from "./videoNode";

interface PageEditorProps {
  onChange: (doc: unknown) => void;
  /** TipTap document. */
  value: unknown;
}

const EMPTY_DOC = { content: [{ type: "paragraph" }], type: "doc" };

/**
 * Rich text editing for CMS pages.
 *
 * Images are uploaded through the same /api/upload the portfolio uses, so page
 * media lands in Blob storage and the document stores only a public URL — no
 * base64 payloads bloating the row.
 */
export function PageEditor({ value, onChange }: PageEditorProps) {
  const { prompt } = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPicking, setIsPicking] = useState(false);

  const editor = useEditor({
    content: (value as object | null | undefined) ?? EMPTY_DOC,
    editorProps: {
      attributes: {
        class:
          // max-w-2xl to match ContentPage's column. Authoring at the panel's
          // full width made every image look enormous and every line of text
          // twice as long as it publishes, so the width buttons were being
          // judged against a measure the reader never sees.
          "prose-invert mx-auto max-w-2xl min-h-[320px] px-5 py-4 focus:outline-none text-white/85 leading-relaxed",
      },
    },
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        // The page renders its own title, so a top-level H1 in the body would
        // compete with it.
      }),
      FormattedImage.configure({
        HTMLAttributes: { class: "rounded max-w-full h-auto" },
      }),
      // Its own node: TipTap's image renders an <img>, and an mp4 in one is a
      // broken icon for an asset that works. See src/cms/videoNode.ts.
      PageVideo.configure({
        HTMLAttributes: { class: "rounded max-w-full h-auto" },
      }),
      Link.configure({
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        openOnClick: false,
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    onUpdate: ({ editor: e }) => onChange(e.getJSON()),
  });

  /**
   * Everything the toolbar renders from, recomputed on each editor transaction.
   *
   * `useEditor` does not re-render this component when the editor changes —
   * moving the caret is a transaction, not a React state update — so reading
   * `editor.isActive(…)` straight in the markup gave whatever was true on the
   * first render and never changed. That is why clicking an image never
   * revealed its controls, and why no toolbar button ever lit up.
   *
   * `useEditorState` subscribes properly and compares the selected values, so
   * this re-renders when one of them actually changes rather than on every
   * keystroke. It has to be called before the loading branch below, since a
   * hook cannot run conditionally; the selector handles the null editor.
   */
  const toolbar = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) {
        return null;
      }
      // Only meaningful when an image is selected, and read together with
      // isImage so the width and alignment buttons agree with what is shown.
      const image = e.getAttributes("image");
      return {
        imageAlign: (image.align ?? null) as ImageAlign | null,
        imageAlt: typeof image.alt === "string" ? image.alt : "",
        imageWidth: (image.width ?? null) as number | null,
        isBlockquote: e.isActive("blockquote"),
        isBold: e.isActive("bold"),
        isBulletList: e.isActive("bulletList"),
        isHeading: e.isActive("heading", { level: 2 }),
        isImage: e.isActive("image"),
        isItalic: e.isActive("italic"),
        isLink: e.isActive("link"),
        isOrderedList: e.isActive("orderedList"),
        isStrike: e.isActive("strike"),
        textAlign:
          (["left", "center", "right"] as const).find((align) =>
            e.isActive({ textAlign: align })
          ) ?? null,
      };
    },
  });

  const uploadImage = useCallback(
    async (file: File) => {
      if (!editor) {
        return;
      }
      const toastId = toast.loading("Uploading image…");
      try {
        const { url } = await portfolioService.uploadImageFile(file);
        // No alt by default. It used to be the filename, which the page then
        // printed under the photograph as a caption — "DSC_4821.jpg" in the
        // middle of an essay, with nowhere to change it.
        editor.chain().focus().setImage({ src: url }).run();
        toast.success("Image added", { id: toastId });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed", {
          id: toastId,
        });
      }
    },
    [editor]
  );

  if (!(editor && toolbar)) {
    return (
      <div className="min-h-95 border border-white/10 bg-black/40 p-5 text-[11px] text-white/80 uppercase tracking-[0.2em]">
        Loading editor…
      </div>
    );
  }

  const setLink = async () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = await prompt({
      confirmLabel: "Apply link",
      defaultValue: previous ?? "https://",
      placeholder: "https://example.com",
      title: previous ? "Edit link" : "Add link",
    });
    if (url === null) {
      return;
    }
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="border border-white/10 bg-black/40">
      <div className="flex flex-wrap items-center gap-px border-white/[0.07] border-b bg-white/3 p-1">
        <ToolButton
          editor={editor}
          isActive={toolbar.isHeading}
          label="Heading"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <HugeiconsIcon icon={TextIcon} size={14} />
        </ToolButton>
        <ToolButton
          editor={editor}
          isActive={toolbar.isBold}
          label="Bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <HugeiconsIcon icon={TextBoldIcon} size={14} />
        </ToolButton>
        <ToolButton
          editor={editor}
          isActive={toolbar.isItalic}
          label="Italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <HugeiconsIcon icon={TextItalicIcon} size={14} />
        </ToolButton>
        <ToolButton
          editor={editor}
          isActive={toolbar.isStrike}
          label="Strikethrough"
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <HugeiconsIcon icon={TextStrikethroughIcon} size={14} />
        </ToolButton>

        <Divider />

        <ToolButton
          editor={editor}
          isActive={toolbar.isBulletList}
          label="Bulleted list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <HugeiconsIcon icon={LeftToRightListBulletIcon} size={14} />
        </ToolButton>
        <ToolButton
          editor={editor}
          isActive={toolbar.isOrderedList}
          label="Numbered list"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <HugeiconsIcon icon={LeftToRightListNumberIcon} size={14} />
        </ToolButton>
        <ToolButton
          editor={editor}
          isActive={toolbar.isBlockquote}
          label="Quote"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <HugeiconsIcon icon={QuoteDownIcon} size={14} />
        </ToolButton>

        <Divider />

        {(
          [
            ["left", TextAlignLeftIcon],
            ["center", TextAlignCenterIcon],
            ["right", TextAlignRightIcon],
          ] as const
        ).map(([align, icon]) => (
          <ToolButton
            editor={editor}
            isActive={toolbar.textAlign === align}
            key={align}
            label={`Align ${align}`}
            onClick={() => editor.chain().focus().setTextAlign(align).run()}
          >
            <HugeiconsIcon icon={icon} size={14} />
          </ToolButton>
        ))}

        <Divider />

        <ToolButton
          editor={editor}
          isActive={toolbar.isLink}
          label="Link"
          onClick={() => void setLink()}
        >
          <HugeiconsIcon icon={Link01Icon} size={14} />
        </ToolButton>
        <ToolButton
          editor={editor}
          isActive={false}
          label="Upload a picture"
          onClick={() => fileInputRef.current?.click()}
        >
          <HugeiconsIcon icon={Image01Icon} size={14} />
        </ToolButton>
        {/* Two buttons, not one with a menu: uploading and choosing from the
            library are both one click, and hiding either behind a chooser
            would make the common case slower to reach than it was. */}
        <ToolButton
          editor={editor}
          isActive={false}
          label="From your pictures"
          onClick={() => setIsPicking(true)}
        >
          <HugeiconsIcon icon={Album02Icon} size={14} />
        </ToolButton>

        <div className="flex-1" />

        <ToolButton
          editor={editor}
          isActive={false}
          label="Undo"
          onClick={() => editor.chain().focus().undo().run()}
        >
          <HugeiconsIcon icon={UndoIcon} size={14} />
        </ToolButton>
        <ToolButton
          editor={editor}
          isActive={false}
          label="Redo"
          onClick={() => editor.chain().focus().redo().run()}
        >
          <HugeiconsIcon icon={RedoIcon} size={14} />
        </ToolButton>
      </div>

      <input
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset so choosing the same file twice still fires a change.
          e.target.value = "";
          if (file) {
            void uploadImage(file);
          }
        }}
        ref={fileInputRef}
        type="file"
      />

      {isPicking ? (
        <AssetPicker
          onChoose={(url, alt, kind) => {
            // A clip becomes a video node and a picture an image: the same
            // choice ItemMedia makes on the board, for the same reason.
            if (kind === "video") {
              editor
                .chain()
                .focus()
                .insertContent({
                  attrs: { src: url, title: alt },
                  type: "pageVideo",
                })
                .run();
              return;
            }
            // The same insertion the upload path uses, so a picture from the
            // library carries the width and alignment attributes the editor's
            // image controls expect — inserting a bare <img> would leave those
            // buttons doing nothing on it.
            editor.chain().focus().setImage({ alt, src: url }).run();
          }}
          onClose={() => setIsPicking(false)}
        />
      ) : null}

      {/* Only while an image is selected: these controls are meaningless
          otherwise, and a permanently visible row of them implies they apply to
          whatever the cursor is in. */}
      {toolbar.isImage ? (
        <div className="flex flex-wrap items-center gap-1 border-white/10 border-b bg-white/2 px-2 py-1">
          <span className="px-1 text-[10px] text-white/40 uppercase tracking-[0.18em]">
            Image
          </span>
          {(
            [
              ["left", TextAlignLeftIcon],
              ["center", TextAlignCenterIcon],
              ["right", TextAlignRightIcon],
            ] as const
          ).map(([align, icon]) => (
            <ToolButton
              editor={editor}
              isActive={toolbar.imageAlign === align}
              key={align}
              label={`Image ${align}`}
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes("image", { align })
                  .run()
              }
            >
              <HugeiconsIcon icon={icon} size={14} />
            </ToolButton>
          ))}

          <Divider />

          {IMAGE_WIDTHS.map((width) => (
            <ToolButton
              editor={editor}
              isActive={toolbar.imageWidth === width}
              key={width}
              label={`Image width ${width}%`}
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes("image", { width })
                  .run()
              }
            >
              <span className="text-[10px] tabular-nums">{width}%</span>
            </ToolButton>
          ))}

          {/* The page prints this under the photograph, so it needs to be
              typed rather than inherited from the upload. On its own line
              because a caption is a sentence, not a toggle. */}
          <label className="mt-1 flex w-full items-center gap-2">
            <span className="shrink-0 px-1 text-[10px] text-white/40 uppercase tracking-[0.18em]">
              Caption
            </span>
            <input
              className="min-h-8 flex-1 border border-white/10 bg-black/40 px-2 text-[12px] text-white/85 outline-none focus:border-white/40"
              onChange={(e) =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes("image", { alt: e.target.value })
                  .run()
              }
              placeholder="Describe the photograph — shown beneath it, and read aloud to anyone who cannot see it"
              value={toolbar.imageAlt}
            />
          </label>
        </div>
      ) : null}

      <EditorContent className="cms-editor" editor={editor} />
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-4 w-px bg-white/10" />;
}

function ToolButton({
  label,
  isActive,
  onClick,
  children,
}: {
  editor: Editor;
  label: string;
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={isActive}
      className={`flex size-8 items-center justify-center transition-colors ${
        isActive
          ? "bg-white/10 text-white"
          : "text-white/90 hover:bg-white/6 hover:text-white"
      }`}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
