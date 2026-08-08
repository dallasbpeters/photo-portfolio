import {
  ColorFilter,
  Crop,
  Download,
  Eye,
  MediaImage,
  Palette,
  Restart,
  SunLight,
  Xmark,
} from "iconoir-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ADJUSTMENT_GROUPS,
  type AdjustmentGroupId,
  createNeutralEdit,
  type EditState,
  fromDisplay,
  isNeutral,
  toDisplay,
} from "../adjustments";
import {
  DEFAULT_EXPORT,
  EXPORT_FORMATS,
  type ExportSettings,
  encodeCanvas,
  fileExtension,
  fitWithin,
  formatBytes,
  MAX_DIMENSIONS,
  MAX_UPLOAD_BYTES,
} from "../engine/export";
import { PhotoPipeline } from "../engine/pipeline";
import {
  applyLookAtStrength,
  LOOK_FAMILIES,
  type Look,
  looksInFamily,
} from "../presets";
import { EditorSlider } from "./EditorSlider";

type ToolId = AdjustmentGroupId | "looks" | "export";

const TOOLS: { id: ToolId; label: string; Icon: typeof SunLight }[] = [
  { Icon: ColorFilter, id: "looks", label: "Looks" },
  { Icon: SunLight, id: "tone", label: "Light" },
  { Icon: Palette, id: "color", label: "Colour" },
  { Icon: Crop, id: "presence", label: "Detail" },
  { Icon: MediaImage, id: "film", label: "Film" },
  { Icon: Eye, id: "finishing", label: "Finish" },
  { Icon: Download, id: "export", label: "Export" },
];

export interface PhotoEditorShellProps {
  imageUrl: string;
  onClose: () => void;
  /** Receives the graded image. Resolve to close, reject to keep the editor open. */
  onSave: (blob: Blob, extension: string) => Promise<void>;
  title: string;
}

/**
 * The editor shell: black field, left rail, hairline borders, and no chrome
 * competing with the photograph.
 *
 * Grading runs entirely on the GPU through PhotoPipeline, so there is no
 * licensed SDK involved and nothing is ever stamped onto an export.
 */
export function PhotoEditorShell({
  imageUrl,
  title,
  onClose,
  onSave,
}: PhotoEditorShellProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pipelineRef = useRef<PhotoPipeline | null>(null);

  const [edit, setEdit] = useState<EditState>(createNeutralEdit);
  const [tool, setTool] = useState<ToolId>("looks");
  const [activeLook, setActiveLook] = useState<Look | null>(null);
  const [lookStrength, setLookStrength] = useState(100);
  const [exportSettings, setExportSettings] =
    useState<ExportSettings>(DEFAULT_EXPORT);

  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ height: 0, width: 0 });
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);

  // ── Load the image and stand up the GL pipeline ───────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let cancelled = false;
    let pipeline: PhotoPipeline | null = null;

    const image = new Image();
    // The blob and picsum hosts both allow this; without it the canvas is
    // tainted and toBlob() throws on export.
    image.crossOrigin = "anonymous";

    image.onload = () => {
      if (cancelled) {
        return;
      }
      try {
        pipeline = new PhotoPipeline(canvas);
        pipeline.setImage(image, image.naturalWidth, image.naturalHeight);
        pipelineRef.current = pipeline;
        setDimensions({
          height: image.naturalHeight,
          width: image.naturalWidth,
        });
        pipeline.render(createNeutralEdit());
        setIsReady(true);
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Could not start the editor"
        );
      }
    };

    image.onerror = () =>
      !cancelled &&
      setLoadError(
        "Could not load this image. It may block cross-origin reads."
      );

    image.src = imageUrl;

    return () => {
      cancelled = true;
      pipeline?.dispose();
      pipelineRef.current = null;
    };
  }, [imageUrl]);

  // ── Re-render whenever the edit changes ───────────────────────────────────
  useEffect(() => {
    if (!isReady) {
      return;
    }
    pipelineRef.current?.render(showOriginal ? createNeutralEdit() : edit);
  }, [edit, isReady, showOriginal]);

  // Estimating on every keystroke would encode the full image repeatedly, so
  // it is debounced and only runs while the export panel is open.
  useEffect(() => {
    if (!isReady || tool !== "export") {
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        const canvas = canvasRef.current;
        if (!canvas) {
          return;
        }
        const blob = await encodeCanvas(canvas, exportSettings);
        setEstimatedSize(blob?.size ?? null);
      })();
    }, 350);
    return () => clearTimeout(timer);
  }, [exportSettings, isReady, tool]);

  const setValue = useCallback((key: keyof EditState, display: number) => {
    setEdit((prev) => ({ ...prev, [key]: fromDisplay(display) }));
    // A manual change means the result is no longer purely the chosen look.
    setActiveLook(null);
  }, []);

  const chooseLook = useCallback(
    (look: Look) => {
      const next = look.id === activeLook?.id ? null : look;
      setActiveLook(next);
      setLookStrength(100);
      setEdit(next ? applyLookAtStrength(next, 1) : createNeutralEdit());
    },
    [activeLook]
  );

  const changeStrength = useCallback(
    (strength: number) => {
      setLookStrength(strength);
      if (activeLook) {
        setEdit(applyLookAtStrength(activeLook, strength / 100));
      }
    },
    [activeLook]
  );

  const reset = useCallback(() => {
    setEdit(createNeutralEdit());
    setActiveLook(null);
    setLookStrength(100);
  }, []);

  const handleSave = async () => {
    const pipeline = pipelineRef.current;
    if (!pipeline) {
      return;
    }

    setIsSaving(true);
    try {
      // Always render the real edit, never whatever compare state is showing.
      pipeline.render(edit);
      const canvas = canvasRef.current;
      if (!canvas) {
        throw new Error("Canvas is unavailable");
      }
      const blob = await encodeCanvas(canvas, exportSettings);
      if (!blob) {
        throw new Error("Could not encode the image");
      }

      if (blob.size > MAX_UPLOAD_BYTES) {
        throw new Error(
          `${formatBytes(blob.size)} exceeds the ${formatBytes(MAX_UPLOAD_BYTES)} upload limit. Lower the quality or the maximum size.`
        );
      }

      await onSave(blob, fileExtension(exportSettings.format));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setIsSaving(false);
      pipeline.render(showOriginal ? createNeutralEdit() : edit);
    }
  };

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
    const up = (e: KeyboardEvent) => e.key === "\\" && setShowOriginal(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [isSaving, onClose]);

  const exportedSize = useMemo(
    () =>
      fitWithin(
        dimensions.width,
        dimensions.height,
        exportSettings.maxDimension
      ),
    [dimensions, exportSettings.maxDimension]
  );

  const dirty = !isNeutral(edit);

  return (
    <div className="fixed inset-0 z-100 flex bg-black text-white">
      {/* ── Left rail ───────────────────────────────────────────────────── */}
      <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-white/[0.07] border-r py-4">
        <button
          aria-label="Close editor"
          className="mb-4 flex size-9 items-center justify-center text-white/35 transition-colors hover:text-white"
          onClick={onClose}
          type="button"
        >
          <Xmark height={16} width={16} />
        </button>

        {TOOLS.map(({ id, label, Icon }) => (
          <button
            aria-label={label}
            aria-pressed={tool === id}
            className={`relative flex size-9 items-center justify-center transition-colors duration-200 ${
              tool === id ? "text-white" : "text-white/30 hover:text-white/60"
            }`}
            key={id}
            onClick={() => setTool(id)}
            title={label}
            type="button"
          >
            {tool === id ? (
              <span aria-hidden className="absolute left-0 h-4 w-px bg-white" />
            ) : null}
            <Icon height={16} width={16} />
          </button>
        ))}
      </nav>

      {/* ── Panel ───────────────────────────────────────────────────────── */}
      <aside className="flex w-[276px] shrink-0 flex-col border-white/[0.07] border-r">
        <header className="flex h-12 shrink-0 items-center border-white/[0.07] border-b px-5">
          <h2 className="text-[10px] text-white/45 uppercase tracking-[0.28em]">
            {TOOLS.find((t) => t.id === tool)?.label}
          </h2>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {tool === "looks" ? (
            <LooksPanel
              active={activeLook}
              onChoose={chooseLook}
              onStrength={changeStrength}
              strength={lookStrength}
            />
          ) : null}

          {tool === "export" ? (
            <ExportPanel
              estimatedSize={estimatedSize}
              height={exportedSize.height}
              onChange={setExportSettings}
              settings={exportSettings}
              width={exportedSize.width}
            />
          ) : null}

          {ADJUSTMENT_GROUPS.filter((g) => g.id === tool).map((group) => (
            <div className="divide-y divide-white/[0.05]" key={group.id}>
              {group.items.map((def) => (
                <EditorSlider
                  centered={def.centered}
                  key={def.key}
                  label={def.label}
                  max={toDisplay(def.max)}
                  min={toDisplay(def.min)}
                  onChange={(v) => setValue(def.key, v)}
                  value={toDisplay(edit[def.key])}
                />
              ))}
            </div>
          ))}
        </div>

        <footer className="flex h-14 shrink-0 items-center gap-2 border-white/[0.07] border-t px-5">
          <button
            className="flex items-center gap-1.5 text-[10px] text-white/35 uppercase tracking-[0.18em] transition-colors hover:text-white disabled:pointer-events-none disabled:opacity-25"
            disabled={!dirty}
            onClick={reset}
            type="button"
          >
            <Restart height={13} width={13} />
            Reset
          </button>
          <div className="flex-1" />
          <button
            className="h-8 bg-white px-4 text-[10px] text-black uppercase tracking-[0.18em] transition-colors hover:bg-white/85 disabled:pointer-events-none disabled:bg-white/15 disabled:text-white/40"
            disabled={!isReady || isSaving || !dirty}
            onClick={() => void handleSave()}
            type="button"
          >
            {isSaving ? "Saving" : "Save"}
          </button>
        </footer>
      </aside>

      {/* ── Canvas ──────────────────────────────────────────────────────── */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-white/[0.07] border-b px-6">
          <span className="truncate text-[10px] text-white/40 uppercase tracking-[0.22em]">
            {title}
          </span>
          <div className="flex items-center gap-5">
            {dimensions.width > 0 ? (
              <span className="font-mono text-[10px] text-white/25 tabular-nums">
                {dimensions.width} × {dimensions.height}
              </span>
            ) : null}
            <button
              className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] transition-colors disabled:opacity-20 ${
                showOriginal
                  ? "text-white"
                  : "text-white/35 hover:text-white/70"
              }`}
              disabled={!dirty}
              onPointerDown={() => setShowOriginal(true)}
              onPointerLeave={() => setShowOriginal(false)}
              onPointerUp={() => setShowOriginal(false)}
              title="Hold to compare  (\)"
              type="button"
            >
              <Eye height={13} width={13} />
              {showOriginal ? "Original" : "Compare"}
            </button>
          </div>
        </header>

        <div className="relative flex flex-1 items-center justify-center overflow-hidden p-8">
          {loadError ? (
            <p className="max-w-xs text-center text-[11px] text-white/40 uppercase leading-relaxed tracking-[0.12em]">
              {loadError}
            </p>
          ) : (
            <>
              <canvas
                className={`max-h-full max-w-full object-contain transition-opacity duration-500 ${
                  isReady ? "opacity-100" : "opacity-0"
                }`}
                ref={canvasRef}
              />
              {!isReady ? (
                <span className="absolute text-[10px] text-white/25 uppercase tracking-[0.3em]">
                  Loading
                </span>
              ) : null}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

// ── Panels ──────────────────────────────────────────────────────────────────

function LooksPanel({
  active,
  strength,
  onChoose,
  onStrength,
}: {
  active: Look | null;
  strength: number;
  onChoose: (look: Look) => void;
  onStrength: (value: number) => void;
}) {
  // Opens on the active look's family so returning to the panel lands where the
  // photograph already is.
  const [openFamily, setOpenFamily] = useState<string>(active?.family ?? "a");
  const family =
    LOOK_FAMILIES.find((f) => f.id === openFamily) ?? LOOK_FAMILIES[0]!;

  return (
    <div className="space-y-5 py-1">
      {/* Family rail — the signature colour is the whole affordance. */}
      <div className="flex gap-px bg-white/[0.06]">
        {LOOK_FAMILIES.map((f) => {
          const isOpen = f.id === family.id;
          const holdsActive = active?.family === f.id;
          return (
            <button
              aria-pressed={isOpen}
              className={`flex flex-1 flex-col items-center gap-1.5 bg-black py-2.5 transition-colors ${
                isOpen ? "text-white" : "text-white/30 hover:text-white/60"
              }`}
              key={f.id}
              onClick={() => setOpenFamily(f.id)}
              title={`${f.name} — ${f.description}`}
              type="button"
            >
              <span className="font-mono text-[11px] tracking-wider">
                {f.letter}
              </span>
              <span
                aria-hidden
                className="h-[3px] w-4 rounded-full transition-opacity"
                style={{
                  backgroundColor: f.color,
                  opacity: isOpen ? 1 : holdsActive ? 0.7 : 0.28,
                }}
              />
            </button>
          );
        })}
      </div>

      <div>
        <p className="pb-2 text-[10px] text-white/35 uppercase tracking-[0.18em]">
          {family.name}
          <span className="ml-2 text-white/20 normal-case tracking-normal">
            {family.description}
          </span>
        </p>

        <div className="grid grid-cols-4 gap-px bg-white/[0.06]">
          {looksInFamily(family.id).map((look) => {
            const isActive = active?.id === look.id;
            return (
              <button
                className={`flex aspect-square flex-col items-center justify-center gap-1 bg-black transition-colors duration-200 ${
                  isActive ? "text-white" : "text-white/30 hover:text-white/70"
                }`}
                key={look.id}
                onClick={() => onChoose(look)}
                style={
                  isActive
                    ? { backgroundColor: `${family.color}14` }
                    : undefined
                }
                title={look.name}
                type="button"
              >
                <span className="font-mono text-[11px] tracking-wider">
                  {look.code}
                </span>
                <span
                  aria-hidden
                  className="h-px w-3 transition-opacity"
                  style={{
                    backgroundColor: family.color,
                    opacity: isActive ? 1 : 0,
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {active ? (
        <div className="border-white/[0.06] border-t pt-1">
          <EditorSlider
            label={`${active.code} · ${active.name}`}
            max={100}
            min={0}
            onChange={onStrength}
            value={strength}
          />
        </div>
      ) : null}
    </div>
  );
}

function ExportPanel({
  settings,
  onChange,
  width,
  height,
  estimatedSize,
}: {
  settings: ExportSettings;
  onChange: (next: ExportSettings) => void;
  width: number;
  height: number;
  estimatedSize: number | null;
}) {
  const tooLarge = estimatedSize !== null && estimatedSize > MAX_UPLOAD_BYTES;

  return (
    <div className="space-y-6 py-2">
      <section className="space-y-2">
        <p className="text-[10px] text-white/35 uppercase tracking-[0.18em]">
          Format
        </p>
        <div className="grid grid-cols-3 gap-px bg-white/[0.06]">
          {EXPORT_FORMATS.map((f) => (
            <button
              className={`bg-black py-2 text-[10px] uppercase tracking-[0.14em] transition-colors ${
                settings.format === f.value
                  ? "text-white"
                  : "text-white/30 hover:text-white/60"
              }`}
              key={f.value}
              onClick={() => onChange({ ...settings, format: f.value })}
              title={f.note}
              type="button"
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {settings.format !== "image/png" ? (
        <EditorSlider
          label="Quality"
          max={100}
          min={40}
          onChange={(v) => onChange({ ...settings, quality: v / 100 })}
          value={Math.round(settings.quality * 100)}
        />
      ) : null}

      <section className="space-y-2">
        <p className="text-[10px] text-white/35 uppercase tracking-[0.18em]">
          Longest edge
        </p>
        <div className="grid grid-cols-5 gap-px bg-white/[0.06]">
          {MAX_DIMENSIONS.map((d) => (
            <button
              className={`bg-black py-2 font-mono text-[10px] tabular-nums transition-colors ${
                settings.maxDimension === d
                  ? "text-white"
                  : "text-white/30 hover:text-white/60"
              }`}
              key={d}
              onClick={() => onChange({ ...settings, maxDimension: d })}
              type="button"
            >
              {d}
            </button>
          ))}
        </div>
      </section>

      <dl className="space-y-1.5 border-white/[0.06] border-t pt-4 text-[10px] uppercase tracking-[0.14em]">
        <div className="flex justify-between">
          <dt className="text-white/30">Output</dt>
          <dd className="font-mono text-white/55 tabular-nums">
            {width} × {height}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-white/30">Size</dt>
          <dd
            className={`font-mono tabular-nums ${tooLarge ? "text-amber-400/90" : "text-white/55"}`}
          >
            {estimatedSize === null ? "—" : formatBytes(estimatedSize)}
          </dd>
        </div>
      </dl>

      {tooLarge ? (
        <p className="text-[10px] text-amber-400/70 leading-relaxed tracking-[0.05em]">
          Over the {formatBytes(MAX_UPLOAD_BYTES)} upload limit. Lower the
          quality or the longest edge.
        </p>
      ) : null}
    </div>
  );
}
