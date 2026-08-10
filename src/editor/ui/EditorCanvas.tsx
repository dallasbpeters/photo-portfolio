import { HugeiconsIcon } from "@hugeicons/react";
import { EyeIcon } from "@hugeicons-pro/core-stroke-standard";

interface EditorCanvasProps {
  /** Disabled when the edit is neutral — there is nothing to compare against. */
  canCompare: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  dimensions: { width: number; height: number };
  isReady: boolean;
  loadError: string | null;
  onCompareChange: (showing: boolean) => void;
  showOriginal: boolean;
  title: string;
}

/** The photograph, its header, and the compare control. */
export function EditorCanvas({
  canvasRef,
  title,
  isReady,
  loadError,
  dimensions,
  canCompare,
  showOriginal,
  onCompareChange,
}: EditorCanvasProps) {
  return (
    <main className="relative flex min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-white/[0.07] border-b px-6">
        <span className="truncate text-[10px] text-white/90 uppercase tracking-[0.22em]">
          {title}
        </span>
        <div className="flex items-center gap-5">
          {dimensions.width > 0 ? (
            <span className="font-mono text-[10px] text-white/80 tabular-nums">
              {dimensions.width} × {dimensions.height}
            </span>
          ) : null}
          <button
            className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] transition-colors disabled:opacity-80 ${
              showOriginal ? "text-white" : "text-white/90 hover:text-white/90"
            }`}
            disabled={!canCompare}
            onPointerDown={() => onCompareChange(true)}
            onPointerLeave={() => onCompareChange(false)}
            onPointerUp={() => onCompareChange(false)}
            title="Hold to compare  (\)"
            type="button"
          >
            <HugeiconsIcon icon={EyeIcon} size={13} />
            {showOriginal ? "Original" : "Compare"}
          </button>
        </div>
      </header>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-8">
        {loadError ? (
          <p className="max-w-xs text-center text-[11px] text-white/90 uppercase leading-relaxed tracking-[0.12em]">
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
            {isReady ? null : (
              <span className="absolute text-[10px] text-white/80 uppercase tracking-[0.3em]">
                Loading
              </span>
            )}
          </>
        )}
      </div>
    </main>
  );
}
