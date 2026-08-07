import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
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
} from 'iconoir-react';
import {
  ADJUSTMENT_GROUPS,
  createNeutralEdit,
  fromDisplay,
  isNeutral,
  toDisplay,
  type AdjustmentGroupId,
  type EditState,
} from '../adjustments';
import { applyLookAtStrength, LOOKS, type Look } from '../presets';
import { PhotoPipeline } from '../engine/pipeline';
import {
  DEFAULT_EXPORT,
  encodeCanvas,
  EXPORT_FORMATS,
  fileExtension,
  fitWithin,
  formatBytes,
  MAX_DIMENSIONS,
  MAX_UPLOAD_BYTES,
  type ExportSettings,
} from '../engine/export';
import { EditorSlider } from './EditorSlider';

type ToolId = AdjustmentGroupId | 'looks' | 'export';

const TOOLS: { id: ToolId; label: string; Icon: typeof SunLight }[] = [
  { id: 'looks', label: 'Looks', Icon: ColorFilter },
  { id: 'tone', label: 'Light', Icon: SunLight },
  { id: 'color', label: 'Colour', Icon: Palette },
  { id: 'presence', label: 'Detail', Icon: Crop },
  { id: 'film', label: 'Film', Icon: MediaImage },
  { id: 'finishing', label: 'Finish', Icon: Eye },
  { id: 'export', label: 'Export', Icon: Download },
];

export interface PhotoEditorShellProps {
  imageUrl: string;
  title: string;
  onClose: () => void;
  /** Receives the graded image. Resolve to close, reject to keep the editor open. */
  onSave: (blob: Blob, extension: string) => Promise<void>;
}

/**
 * The editor shell: black field, left rail, hairline borders, and no chrome
 * competing with the photograph.
 *
 * Grading runs entirely on the GPU through PhotoPipeline, so there is no
 * licensed SDK involved and nothing is ever stamped onto an export.
 */
export function PhotoEditorShell({ imageUrl, title, onClose, onSave }: PhotoEditorShellProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pipelineRef = useRef<PhotoPipeline | null>(null);

  const [edit, setEdit] = useState<EditState>(createNeutralEdit);
  const [tool, setTool] = useState<ToolId>('looks');
  const [activeLook, setActiveLook] = useState<Look | null>(null);
  const [lookStrength, setLookStrength] = useState(100);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(DEFAULT_EXPORT);

  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [estimatedSize, setEstimatedSize] = useState<number | null>(null);

  // ── Load the image and stand up the GL pipeline ───────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let pipeline: PhotoPipeline | null = null;

    const image = new Image();
    // The blob and picsum hosts both allow this; without it the canvas is
    // tainted and toBlob() throws on export.
    image.crossOrigin = 'anonymous';

    image.onload = () => {
      if (cancelled) return;
      try {
        pipeline = new PhotoPipeline(canvas);
        pipeline.setImage(image, image.naturalWidth, image.naturalHeight);
        pipelineRef.current = pipeline;
        setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
        pipeline.render(createNeutralEdit());
        setIsReady(true);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Could not start the editor');
      }
    };

    image.onerror = () =>
      !cancelled && setLoadError('Could not load this image. It may block cross-origin reads.');

    image.src = imageUrl;

    return () => {
      cancelled = true;
      pipeline?.dispose();
      pipelineRef.current = null;
    };
  }, [imageUrl]);

  // ── Re-render whenever the edit changes ───────────────────────────────────
  useEffect(() => {
    if (!isReady) return;
    pipelineRef.current?.render(showOriginal ? createNeutralEdit() : edit);
  }, [edit, isReady, showOriginal]);

  // Estimating on every keystroke would encode the full image repeatedly, so
  // it is debounced and only runs while the export panel is open.
  useEffect(() => {
    if (!isReady || tool !== 'export') return;
    const timer = setTimeout(() => {
      void (async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const blob = await encodeCanvas(canvas, exportSettings);
        setEstimatedSize(blob?.size ?? null);
      })();
    }, 350);
    return () => clearTimeout(timer);
  }, [exportSettings, isReady, tool, edit]);

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
    [activeLook],
  );

  const changeStrength = useCallback(
    (strength: number) => {
      setLookStrength(strength);
      if (activeLook) setEdit(applyLookAtStrength(activeLook, strength / 100));
    },
    [activeLook],
  );

  const reset = useCallback(() => {
    setEdit(createNeutralEdit());
    setActiveLook(null);
    setLookStrength(100);
  }, []);

  const handleSave = async () => {
    const pipeline = pipelineRef.current;
    if (!pipeline) return;

    setIsSaving(true);
    try {
      // Always render the real edit, never whatever compare state is showing.
      pipeline.render(edit);
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Canvas is unavailable');
      const blob = await encodeCanvas(canvas, exportSettings);
      if (!blob) throw new Error('Could not encode the image');

      if (blob.size > MAX_UPLOAD_BYTES) {
        throw new Error(
          `${formatBytes(blob.size)} exceeds the ${formatBytes(MAX_UPLOAD_BYTES)} upload limit. Lower the quality or the maximum size.`,
        );
      }

      await onSave(blob, fileExtension(exportSettings.format));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setIsSaving(false);
      pipeline.render(showOriginal ? createNeutralEdit() : edit);
    }
  };

  // Hold \ to compare, the way every darkroom tool does it.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === '\\') setShowOriginal(true);
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    const up = (e: KeyboardEvent) => e.key === '\\' && setShowOriginal(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [isSaving, onClose]);

  const exportedSize = useMemo(
    () => fitWithin(dimensions.width, dimensions.height, exportSettings.maxDimension),
    [dimensions, exportSettings.maxDimension],
  );

  const dirty = !isNeutral(edit);

  return (
    <div className="fixed inset-0 z-100 flex bg-black text-white">
      {/* ── Left rail ───────────────────────────────────────────────────── */}
      <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-white/[0.07] py-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close editor"
          className="mb-4 flex size-9 items-center justify-center text-white/35 transition-colors hover:text-white"
        >
          <Xmark width={16} height={16} />
        </button>

        {TOOLS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTool(id)}
            aria-label={label}
            aria-pressed={tool === id}
            title={label}
            className={`relative flex size-9 items-center justify-center transition-colors duration-200 ${
              tool === id ? 'text-white' : 'text-white/30 hover:text-white/60'
            }`}
          >
            {tool === id && (
              <span className="absolute left-0 h-4 w-px bg-white" aria-hidden />
            )}
            <Icon width={16} height={16} />
          </button>
        ))}
      </nav>

      {/* ── Panel ───────────────────────────────────────────────────────── */}
      <aside className="flex w-[276px] shrink-0 flex-col border-r border-white/[0.07]">
        <header className="flex h-12 shrink-0 items-center border-b border-white/[0.07] px-5">
          <h2 className="text-[10px] uppercase tracking-[0.28em] text-white/45">
            {TOOLS.find((t) => t.id === tool)?.label}
          </h2>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {tool === 'looks' && (
            <LooksPanel
              active={activeLook}
              strength={lookStrength}
              onChoose={chooseLook}
              onStrength={changeStrength}
            />
          )}

          {tool === 'export' && (
            <ExportPanel
              settings={exportSettings}
              onChange={setExportSettings}
              width={exportedSize.width}
              height={exportedSize.height}
              estimatedSize={estimatedSize}
            />
          )}

          {ADJUSTMENT_GROUPS.filter((g) => g.id === tool).map((group) => (
            <div key={group.id} className="divide-y divide-white/[0.05]">
              {group.items.map((def) => (
                <EditorSlider
                  key={def.key}
                  label={def.label}
                  value={toDisplay(edit[def.key])}
                  min={toDisplay(def.min)}
                  max={toDisplay(def.max)}
                  centered={def.centered}
                  onChange={(v) => setValue(def.key, v)}
                />
              ))}
            </div>
          ))}
        </div>

        <footer className="flex h-14 shrink-0 items-center gap-2 border-t border-white/[0.07] px-5">
          <button
            type="button"
            onClick={reset}
            disabled={!dirty}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/35 transition-colors hover:text-white disabled:pointer-events-none disabled:opacity-25"
          >
            <Restart width={13} height={13} />
            Reset
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!isReady || isSaving || !dirty}
            className="h-8 px-4 text-[10px] uppercase tracking-[0.18em] text-black transition-colors bg-white hover:bg-white/85 disabled:pointer-events-none disabled:bg-white/15 disabled:text-white/40"
          >
            {isSaving ? 'Saving' : 'Save'}
          </button>
        </footer>
      </aside>

      {/* ── Canvas ──────────────────────────────────────────────────────── */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.07] px-6">
          <span className="truncate text-[10px] uppercase tracking-[0.22em] text-white/40">
            {title}
          </span>
          <div className="flex items-center gap-5">
            {dimensions.width > 0 && (
              <span className="font-mono text-[10px] tabular-nums text-white/25">
                {dimensions.width} × {dimensions.height}
              </span>
            )}
            <button
              type="button"
              onPointerDown={() => setShowOriginal(true)}
              onPointerUp={() => setShowOriginal(false)}
              onPointerLeave={() => setShowOriginal(false)}
              disabled={!dirty}
              title="Hold to compare  (\)"
              className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] transition-colors disabled:opacity-20 ${
                showOriginal ? 'text-white' : 'text-white/35 hover:text-white/70'
              }`}
            >
              <Eye width={13} height={13} />
              {showOriginal ? 'Original' : 'Compare'}
            </button>
          </div>
        </header>

        <div className="relative flex flex-1 items-center justify-center overflow-hidden p-8">
          {loadError ? (
            <p className="max-w-xs text-center text-[11px] leading-relaxed uppercase tracking-[0.12em] text-white/40">
              {loadError}
            </p>
          ) : (
            <>
              <canvas
                ref={canvasRef}
                className={`max-h-full max-w-full object-contain transition-opacity duration-500 ${
                  isReady ? 'opacity-100' : 'opacity-0'
                }`}
              />
              {!isReady && (
                <span className="absolute text-[10px] uppercase tracking-[0.3em] text-white/25">
                  Loading
                </span>
              )}
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
  return (
    <div className="space-y-5 py-1">
      <div className="grid grid-cols-4 gap-px bg-white/[0.06]">
        {LOOKS.map((look) => (
          <button
            key={look.id}
            type="button"
            onClick={() => onChoose(look)}
            title={look.name}
            className={`flex aspect-square flex-col items-center justify-center gap-1 bg-black transition-colors duration-200 ${
              active?.id === look.id ? 'text-white' : 'text-white/30 hover:text-white/70'
            }`}
          >
            <span className="font-mono text-[11px] tracking-wider">{look.code}</span>
            {active?.id === look.id && <span className="h-px w-3 bg-white" aria-hidden />}
          </button>
        ))}
      </div>

      {active && (
        <div className="border-t border-white/[0.06] pt-1">
          <EditorSlider
            label={active.name}
            value={strength}
            min={0}
            max={100}
            onChange={onStrength}
          />
        </div>
      )}
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
  const tooLarge = estimatedSize != null && estimatedSize > MAX_UPLOAD_BYTES;

  return (
    <div className="space-y-6 py-2">
      <section className="space-y-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Format</p>
        <div className="grid grid-cols-3 gap-px bg-white/[0.06]">
          {EXPORT_FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => onChange({ ...settings, format: f.value })}
              title={f.note}
              className={`bg-black py-2 text-[10px] uppercase tracking-[0.14em] transition-colors ${
                settings.format === f.value ? 'text-white' : 'text-white/30 hover:text-white/60'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {settings.format !== 'image/png' && (
        <EditorSlider
          label="Quality"
          value={Math.round(settings.quality * 100)}
          min={40}
          max={100}
          onChange={(v) => onChange({ ...settings, quality: v / 100 })}
        />
      )}

      <section className="space-y-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Longest edge</p>
        <div className="grid grid-cols-5 gap-px bg-white/[0.06]">
          {MAX_DIMENSIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onChange({ ...settings, maxDimension: d })}
              className={`bg-black py-2 font-mono text-[10px] tabular-nums transition-colors ${
                settings.maxDimension === d ? 'text-white' : 'text-white/30 hover:text-white/60'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </section>

      <dl className="space-y-1.5 border-t border-white/[0.06] pt-4 text-[10px] uppercase tracking-[0.14em]">
        <div className="flex justify-between">
          <dt className="text-white/30">Output</dt>
          <dd className="font-mono tabular-nums text-white/55">
            {width} × {height}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-white/30">Size</dt>
          <dd
            className={`font-mono tabular-nums ${tooLarge ? 'text-amber-400/90' : 'text-white/55'}`}
          >
            {estimatedSize == null ? '—' : formatBytes(estimatedSize)}
          </dd>
        </div>
      </dl>

      {tooLarge && (
        <p className="text-[10px] leading-relaxed tracking-[0.05em] text-amber-400/70">
          Over the {formatBytes(MAX_UPLOAD_BYTES)} upload limit. Lower the quality or the longest
          edge.
        </p>
      )}
    </div>
  );
}
