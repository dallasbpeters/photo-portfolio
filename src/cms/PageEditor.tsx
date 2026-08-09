import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link as LinkIcon,
  ListSelect,
  MediaImage,
  NumberedListLeft,
  Quote,
  Redo,
  Strikethrough,
  Text as TextIcon,
  Undo,
} from "iconoir-react";
import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { useConfirm } from "../components/admin/ConfirmProvider";
import { portfolioService } from "../services/portfolioService";
import {
  FormattedImage,
  IMAGE_ALIGNMENTS,
  IMAGE_WIDTHS,
} from "./imageAttributes";

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

  const editor = useEditor({
    content: (value as object | null | undefined) ?? EMPTY_DOC,
    editorProps: {
      attributes: {
        class:
          "prose-invert max-w-none min-h-[320px] px-5 py-4 focus:outline-none text-white/85 leading-relaxed",
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
      Link.configure({
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        openOnClick: false,
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    onUpdate: ({ editor: e }) => onChange(e.getJSON()),
  });

  const uploadImage = useCallback(
    async (file: File) => {
      if (!editor) {
        return;
      }
      const toastId = toast.loading("Uploading image…");
      try {
        const { url } = await portfolioService.uploadImageFile(file);
        editor.chain().focus().setImage({ alt: file.name, src: url }).run();
        toast.success("Image added", { id: toastId });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed", {
          id: toastId,
        });
      }
    },
    [editor]
  );

  if (!editor) {
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
          isActive={editor.isActive("heading", { level: 2 })}
          label="Heading"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <TextIcon height={14} width={14} />
        </ToolButton>
        <ToolButton
          editor={editor}
          isActive={editor.isActive("bold")}
          label="Bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold height={14} width={14} />
        </ToolButton>
        <ToolButton
          editor={editor}
          isActive={editor.isActive("italic")}
          label="Italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic height={14} width={14} />
        </ToolButton>
        <ToolButton
          editor={editor}
          isActive={editor.isActive("strike")}
          label="Strikethrough"
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough height={14} width={14} />
        </ToolButton>

        <Divider />

        <ToolButton
          editor={editor}
          isActive={editor.isActive("bulletList")}
          label="Bulleted list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <ListSelect height={14} width={14} />
        </ToolButton>
        <ToolButton
          editor={editor}
          isActive={editor.isActive("orderedList")}
          label="Numbered list"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <NumberedListLeft height={14} width={14} />
        </ToolButton>
        <ToolButton
          editor={editor}
          isActive={editor.isActive("blockquote")}
          label="Quote"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote height={14} width={14} />
        </ToolButton>

        <Divider />

        {(
          [
            ["left", AlignLeft],
            ["center", AlignCenter],
            ["right", AlignRight],
          ] as const
        ).map(([align, Icon]) => (
          <ToolButton
            editor={editor}
            isActive={editor.isActive({ textAlign: align })}
            key={align}
            label={`Align ${align}`}
            onClick={() => editor.chain().focus().setTextAlign(align).run()}
          >
            <Icon height={14} width={14} />
          </ToolButton>
        ))}

        <Divider />

        <ToolButton
          editor={editor}
          isActive={editor.isActive("link")}
          label="Link"
          onClick={() => void setLink()}
        >
          <LinkIcon height={14} width={14} />
        </ToolButton>
        <ToolButton
          editor={editor}
          isActive={false}
          label="Image"
          onClick={() => fileInputRef.current?.click()}
        >
          <MediaImage height={14} width={14} />
        </ToolButton>

        <div className="flex-1" />

        <ToolButton
          editor={editor}
          isActive={false}
          label="Undo"
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo height={14} width={14} />
        </ToolButton>
        <ToolButton
          editor={editor}
          isActive={false}
          label="Redo"
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo height={14} width={14} />
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

      {/* Only while an image is selected: these controls are meaningless
          otherwise, and a permanently visible row of them implies they apply to
          whatever the cursor is in. */}
      {editor.isActive("image") ? (
        <div className="flex flex-wrap items-center gap-1 border-white/10 border-b bg-white/2 px-2 py-1">
          <span className="px-1 text-[10px] text-white/40 uppercase tracking-[0.18em]">
            Image
          </span>
          {IMAGE_ALIGNMENTS.map((align) => (
            <ToolButton
              editor={editor}
              isActive={editor.isActive("image", { align })}
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
              <span className="text-[10px] uppercase tracking-widest">
                {align}
              </span>
            </ToolButton>
          ))}

          <Divider />

          {IMAGE_WIDTHS.map((width) => (
            <ToolButton
              editor={editor}
              isActive={editor.isActive("image", { width })}
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
