import { HugeiconsIcon } from "@hugeicons/react";
import { RefreshIcon } from "@hugeicons-pro/core-stroke-standard";
import { useEffect, useMemo, useState } from "react";
import { isNeutral } from "../adjustments";
import { fitWithin } from "../engine/export";
import { useEditorExport } from "../useEditorExport";
import { useEditState } from "../useEditState";
import { usePhotoPipeline } from "../usePhotoPipeline";
import { AdjustmentPanel } from "./AdjustmentPanel";
import { EditorCanvas } from "./EditorCanvas";
import { EditorRail } from "./EditorRail";
import { ExportPanel } from "./ExportPanel";
import { LooksPanel } from "./LooksPanel";
import { TOOLS, type ToolId } from "./tools";

export interface PhotoEditorShellProps {
  imageUrl: string;
  onClose: () => void;
  /** Receives the graded image. Resolve to close, reject to keep the editor open. */
  onSave: (blob: Blob, extension: string) => Promise<void>;
  title: string;
}

/**
 * Composes the editor: a rail, a contextual panel, and the photograph.
 *
 * Deliberately holds no grading logic of its own — the GL lifecycle lives in
 * usePhotoPipeline, the edit and its relationship to the looks in useEditState,
 * and encoding in useEditorExport.
 */
export function PhotoEditorShell({
  imageUrl,
  title,
  onClose,
  onSave,
}: PhotoEditorShellProps) {
  const [tool, setTool] = useState<ToolId>("looks");
  const [showOriginal, setShowOriginal] = useState(false);

  const {
    edit,
    activeLook,
    lookStrength,
    setValue,
    chooseLook,
    setLookStrength,
    reset,
  } = useEditState();

  const { canvasRef, isReady, loadError, dimensions, render } =
    usePhotoPipeline(imageUrl, edit, showOriginal);

  const { settings, setSettings, estimatedSize, isSaving, save } =
    useEditorExport(
      canvasRef,
      edit,
      showOriginal,
      isReady,
      tool === "export",
      render,
      onSave
    );

  const dirty = !isNeutral(edit);

  // Hold \ to compare, the way every darkroom tool does it.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "\\") {
        setShowOriginal(true);
      }
      if (e.key === "Escape" && !isSaving) {
        onClose();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "\\") {
        setShowOriginal(false);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [isSaving, onClose]);

  const exportedSize = useMemo(
    () => fitWithin(dimensions.width, dimensions.height, settings.maxDimension),
    [dimensions, settings.maxDimension]
  );

  // Controls freeze while comparing, so a stray drag is never attributed to the
  // "original" the user is looking at.
  const isDisabled = showOriginal;
  const isAdjustmentTool = tool !== "looks" && tool !== "export";

  return (
    <div className="fixed inset-0 z-100 flex h-full bg-black text-white">
      <EditorRail active={tool} onClose={onClose} onSelect={setTool} />

      <aside className="flex w-69 shrink-0 flex-col border-white/[0.07] border-r">
        <header className="flex h-12 shrink-0 items-center border-white/[0.07] border-b px-5">
          <h2 className="text-[10px] text-white/90 uppercase tracking-[0.28em]">
            {TOOLS.find((t) => t.id === tool)?.label}
          </h2>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {tool === "looks" ? (
            <LooksPanel
              active={activeLook}
              onChoose={chooseLook}
              onStrength={setLookStrength}
              strength={lookStrength}
            />
          ) : null}

          {tool === "export" ? (
            <ExportPanel
              estimatedSize={estimatedSize}
              height={exportedSize.height}
              onChange={setSettings}
              settings={settings}
              width={exportedSize.width}
            />
          ) : null}

          {isAdjustmentTool ? (
            <AdjustmentPanel
              edit={edit}
              groupId={tool}
              isDisabled={isDisabled}
              onChange={setValue}
            />
          ) : null}
        </div>

        <footer className="flex h-14 shrink-0 items-center gap-2 border-white/[0.07] border-t px-5">
          <button
            className="flex items-center gap-1.5 text-[10px] text-white/90 uppercase tracking-[0.18em] transition-colors hover:text-white disabled:pointer-events-none disabled:opacity-60"
            disabled={!dirty}
            onClick={reset}
            type="button"
          >
            <HugeiconsIcon icon={RefreshIcon} size={13} />
            Reset
          </button>
          <div className="flex-1" />
          <button
            className="h-8 bg-white px-4 text-[10px] text-black uppercase tracking-[0.18em] transition-colors hover:bg-white/85 disabled:pointer-events-none disabled:bg-white/15 disabled:text-white/90"
            disabled={!isReady || isSaving || !dirty}
            onClick={() => void save()}
            type="button"
          >
            {isSaving ? "Saving" : "Save"}
          </button>
        </footer>
      </aside>

      <EditorCanvas
        canCompare={dirty}
        canvasRef={canvasRef}
        dimensions={dimensions}
        isReady={isReady}
        loadError={loadError}
        onCompareChange={setShowOriginal}
        showOriginal={showOriginal}
        title={title}
      />
    </div>
  );
}
