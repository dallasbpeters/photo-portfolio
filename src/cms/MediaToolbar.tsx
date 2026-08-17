import { HugeiconsIcon } from "@hugeicons/react";
import {
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
} from "@hugeicons-pro/core-stroke-standard";
import type { Editor } from "@tiptap/react";
import type { ImageAlign } from "./imageAttributes";
import { IMAGE_WIDTHS } from "./imageAttributes";

/**
 * The row that appears when a picture or a clip is selected.
 *
 * Its own file because PageEditor was at the size ceiling and this is the half
 * that grows: every media attribute needs a control, and a node that declares
 * one with nothing to set it is a setting that exists only in the database.
 * Video was exactly that — `pageVideo` has carried `align` and `width` since it
 * was written, and no toolbar has ever offered them.
 *
 * One component for both because the two rows are the same row: a clip is laid
 * out in a page the way a photograph is, and giving them separate vocabularies
 * would be two things to keep in step for no reader's benefit.
 */

const ALIGNMENTS = [
  ["left", TextAlignLeftIcon],
  ["center", TextAlignCenterIcon],
  ["right", TextAlignRightIcon],
] as const;

export interface MediaToolbarState {
  imageAlign: ImageAlign | null;
  imageAlt: string;
  imageWidth: number | null;
  isImage: boolean;
  isVideo: boolean;
  videoAlign: ImageAlign | null;
  videoControls: boolean;
  videoWidth: number | null;
}

function ToolButton({
  children,
  isActive,
  label,
  onClick,
}: {
  children: React.ReactNode;
  isActive: boolean;
  label: string;
  onClick: () => void;
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

function Row({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-white/10 border-b bg-white/2 px-2 py-1">
      <span className="px-1 text-[10px] text-white/40 uppercase tracking-[0.18em]">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Alignment and width, which mean the same thing on both node types. */
function Layout({
  align,
  editor,
  node,
  width,
}: {
  align: ImageAlign | null;
  editor: Editor;
  node: "image" | "pageVideo";
  width: number | null;
}) {
  const set = (attrs: Record<string, unknown>) =>
    editor.chain().focus().updateAttributes(node, attrs).run();

  return (
    <>
      {ALIGNMENTS.map(([value, icon]) => (
        <ToolButton
          isActive={align === value}
          key={value}
          label={`Align ${value}`}
          onClick={() => set({ align: value })}
        >
          <HugeiconsIcon icon={icon} size={14} />
        </ToolButton>
      ))}

      <span aria-hidden className="mx-1 h-4 w-px bg-white/10" />

      {IMAGE_WIDTHS.map((value) => (
        <ToolButton
          isActive={width === value}
          key={value}
          label={`Width ${value}%`}
          onClick={() => set({ width: value })}
        >
          <span className="text-[10px] tabular-nums">{value}%</span>
        </ToolButton>
      ))}
    </>
  );
}

export function MediaToolbar({
  editor,
  state,
}: {
  editor: Editor;
  state: MediaToolbarState;
}) {
  if (state.isImage) {
    return (
      <Row label="Image">
        <Layout
          align={state.imageAlign}
          editor={editor}
          node="image"
          width={state.imageWidth}
        />

        {/* The page prints this under the photograph, so it needs to be typed
            rather than inherited from the upload. On its own line because a
            caption is a sentence, not a toggle. */}
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
            value={state.imageAlt}
          />
        </label>
      </Row>
    );
  }

  if (!state.isVideo) {
    return null;
  }

  return (
    <Row label="Video">
      <Layout
        align={state.videoAlign}
        editor={editor}
        node="pageVideo"
        width={state.videoWidth}
      />

      <span aria-hidden className="mx-1 h-4 w-px bg-white/10" />

      {/* Labelled by what the reader gets, not by what pressing it does — the
          two are opposite, and a button that says "Hide controls" while the
          controls are already hidden is the usual way that goes wrong. */}
      <ToolButton
        isActive={state.videoControls}
        label={
          state.videoControls
            ? "Controls shown — press to hide"
            : "Controls hidden — press to show"
        }
        onClick={() =>
          editor
            .chain()
            .focus()
            .updateAttributes("pageVideo", { controls: !state.videoControls })
            .run()
        }
      >
        <span className="text-[10px]">
          {state.videoControls ? "Controls" : "Bare"}
        </span>
      </ToolButton>
    </Row>
  );
}
