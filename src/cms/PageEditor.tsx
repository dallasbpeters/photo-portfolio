import { useCallback, useRef } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import { toast } from 'sonner';
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
  Strikethrough,
  Text as TextIcon,
  Undo,
  Redo,
} from 'iconoir-react';
import { portfolioService } from '../services/portfolioService';

interface PageEditorProps {
  /** TipTap document. */
  value: unknown;
  onChange: (doc: unknown) => void;
}

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

/**
 * Rich text editing for CMS pages.
 *
 * Images are uploaded through the same /api/upload the portfolio uses, so page
 * media lands in Blob storage and the document stores only a public URL — no
 * base64 payloads bloating the row.
 */
export function PageEditor({ value, onChange }: PageEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        // The page renders its own title, so a top-level H1 in the body would
        // compete with it.
      }),
      Image.configure({ HTMLAttributes: { class: 'rounded max-w-full h-auto' } }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: (value as object) ?? EMPTY_DOC,
    editorProps: {
      attributes: {
        class:
          'prose-invert max-w-none min-h-[320px] px-5 py-4 focus:outline-none text-white/85 leading-relaxed',
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getJSON()),
  });

  const uploadImage = useCallback(
    async (file: File) => {
      if (!editor) return;
      const toastId = toast.loading('Uploading image…');
      try {
        const { url } = await portfolioService.uploadImageFile(file);
        editor.chain().focus().setImage({ src: url, alt: file.name }).run();
        toast.success('Image added', { id: toastId });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Upload failed', { id: toastId });
      }
    },
    [editor],
  );

  if (!editor) {
    return (
      <div className="min-h-[380px] border border-white/10 bg-black/40 p-5 text-[11px] uppercase tracking-[0.2em] text-white/25">
        Loading editor…
      </div>
    );
  }

  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', previous ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="border border-white/10 bg-black/40">
      <div className="flex flex-wrap items-center gap-px border-b border-white/[0.07] bg-white/[0.03] p-1">
        <ToolButton
          editor={editor}
          label="Heading"
          isActive={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <TextIcon width={14} height={14} />
        </ToolButton>
        <ToolButton
          editor={editor}
          label="Bold"
          isActive={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold width={14} height={14} />
        </ToolButton>
        <ToolButton
          editor={editor}
          label="Italic"
          isActive={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic width={14} height={14} />
        </ToolButton>
        <ToolButton
          editor={editor}
          label="Strikethrough"
          isActive={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough width={14} height={14} />
        </ToolButton>

        <Divider />

        <ToolButton
          editor={editor}
          label="Bulleted list"
          isActive={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <ListSelect width={14} height={14} />
        </ToolButton>
        <ToolButton
          editor={editor}
          label="Numbered list"
          isActive={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <NumberedListLeft width={14} height={14} />
        </ToolButton>
        <ToolButton
          editor={editor}
          label="Quote"
          isActive={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote width={14} height={14} />
        </ToolButton>

        <Divider />

        {(
          [
            ['left', AlignLeft],
            ['center', AlignCenter],
            ['right', AlignRight],
          ] as const
        ).map(([align, Icon]) => (
          <ToolButton
            key={align}
            editor={editor}
            label={`Align ${align}`}
            isActive={editor.isActive({ textAlign: align })}
            onClick={() => editor.chain().focus().setTextAlign(align).run()}
          >
            <Icon width={14} height={14} />
          </ToolButton>
        ))}

        <Divider />

        <ToolButton
          editor={editor}
          label="Link"
          isActive={editor.isActive('link')}
          onClick={setLink}
        >
          <LinkIcon width={14} height={14} />
        </ToolButton>
        <ToolButton
          editor={editor}
          label="Image"
          isActive={false}
          onClick={() => fileInputRef.current?.click()}
        >
          <MediaImage width={14} height={14} />
        </ToolButton>

        <div className="flex-1" />

        <ToolButton
          editor={editor}
          label="Undo"
          isActive={false}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo width={14} height={14} />
        </ToolButton>
        <ToolButton
          editor={editor}
          label="Redo"
          isActive={false}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo width={14} height={14} />
        </ToolButton>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset so choosing the same file twice still fires a change.
          e.target.value = '';
          if (file) void uploadImage(file);
        }}
      />

      <EditorContent editor={editor} className="cms-editor" />
    </div>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-white/10" aria-hidden />;
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
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={isActive}
      className={`flex size-8 items-center justify-center transition-colors ${
        isActive ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
