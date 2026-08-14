import { HugeiconsIcon } from "@hugeicons/react";
import { EyeIcon } from "@hugeicons-pro/core-stroke-standard";
import { useEffect, useRef, useState } from "react";
import type { CanvasTransform, RenderedRect } from "../engine/export";
import { renderTransform } from "../engine/export";
import { CropOverlay } from "./CropOverlay";

interface EditorCanvasProps {
  /** Disabled when the edit is neutral — there is nothing to compare against. */
  canCompare: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  dimensions: { width: number; height: number };
  isCropActive: boolean;
  isReady: boolean;
  loadError: string | null;
  onCompareChange: (showing: boolean) => void;
  onTransformChange: (next: CanvasTransform) => void;
  showOriginal: boolean;
  title: string;
  transform: CanvasTransform;
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
  isCropActive,
  transform,
  onTransformChange,
}: EditorCanvasProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [areaSize, setAreaSize] = useState({ height: 0, width: 0 });
  const [rendered, setRendered] = useState<RenderedRect>({
    height: 0,
    width: 0,
    x: 0,
    y: 0,
  });

  useEffect(() => {
    const el = areaRef.current;
    if (el === null) {
      return;
    }
    const update = () =>
      setAreaSize({ height: el.clientHeight, width: el.clientWidth });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!(isCropActive && isReady)) {
      return;
    }
    const source = canvasRef.current;
    const preview = previewRef.current;
    if (source === null || preview === null || areaSize.width === 0) {
      return;
    }
    preview.width = areaSize.width;
    preview.height = areaSize.height;
    const ctx = preview.getContext("2d");
    if (!ctx) {
      return;
    }
    const rect = renderTransform(
      ctx,
      source,
      transform,
      areaSize.width,
      areaSize.height
    );
    setRendered(rect);
  }, [areaSize, canvasRef, isCropActive, isReady, transform]);

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

      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden p-8"
        ref={areaRef}
      >
        {loadError ? (
          <p className="max-w-xs text-center text-[11px] text-white/90 uppercase leading-relaxed tracking-[0.12em]">
            {loadError}
          </p>
        ) : (
          <>
            <canvas
              className={`max-h-full max-w-full object-contain transition-opacity duration-500 ${
                isReady ? "opacity-100" : "opacity-0"
              } ${isCropActive ? "invisible" : ""}`}
              ref={canvasRef}
            />
            {isCropActive && isReady ? (
              <>
                <canvas
                  className="absolute inset-0 h-full w-full"
                  ref={previewRef}
                />
                {rendered.width > 0 ? (
                  <CropOverlay
                    isDisabled={showOriginal}
                    onChange={onTransformChange}
                    rendered={rendered}
                    transform={transform}
                  />
                ) : null}
              </>
            ) : null}
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
