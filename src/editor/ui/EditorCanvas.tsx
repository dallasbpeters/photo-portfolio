import { Eye } from "iconoir-react";

interface EditorCanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  title: string;
  isReady: boolean;
  loadError: string | null;
  dimensions: { width: number; height: number };
  /** Disabled when the edit is neutral — there is nothing to compare against. */
  canCompare: boolean;
  showOriginal: boolean;
  onCompareChange: (showing: boolean) => void;
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
              showOriginal ? "text-white" : "text-white/35 hover:text-white/70"
            }`}
            disabled={!canCompare}
            onPointerDown={() => onCompareChange(true)}
            onPointerLeave={() => onCompareChange(false)}
            onPointerUp={() => onCompareChange(false)}
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
            {isReady ? null : (
              <span className="absolute text-[10px] text-white/25 uppercase tracking-[0.3em]">
                Loading
              </span>
            )}
          </>
        )}
      </div>
    </main>
  );
}
