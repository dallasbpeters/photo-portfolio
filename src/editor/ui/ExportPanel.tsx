import {
  EXPORT_FORMATS,
  type ExportSettings,
  formatBytes,
  MAX_DIMENSIONS,
  MAX_UPLOAD_BYTES,
} from "../engine/export";
import { EditorSlider } from "./EditorSlider";

/**
 * Export controls, with the encoded size shown before saving so the upload
 * ceiling is visible rather than discovered on failure.
 */
export function ExportPanel({
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

      {settings.format === "image/png" ? null : (
        <EditorSlider
          label="Quality"
          max={100}
          min={40}
          onChange={(v) => onChange({ ...settings, quality: v / 100 })}
          value={Math.round(settings.quality * 100)}
        />
      )}

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
