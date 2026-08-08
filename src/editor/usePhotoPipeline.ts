import { useEffect, useRef, useState } from "react";
import { createNeutralEdit, type EditState } from "./adjustments";
import { PhotoPipeline } from "./engine/pipeline";

export interface PipelineState {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** True once the image is decoded and the first frame has rendered. */
  isReady: boolean;
  loadError: string | null;
  dimensions: { width: number; height: number };
  /** Renders an edit immediately, outside the normal effect. */
  render: (edit: EditState) => void;
}

/**
 * Owns the WebGL pipeline for one image: loading it, standing up the renderer,
 * re-rendering on change, and disposing on unmount.
 *
 * Disposal matters more than it looks — browsers cap the number of live WebGL
 * contexts, so leaking one per opened photograph eventually blanks the canvas
 * with no error.
 */
export const usePhotoPipeline = (
  imageUrl: string,
  edit: EditState,
  showOriginal: boolean
): PipelineState => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pipelineRef = useRef<PhotoPipeline | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ height: 0, width: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let cancelled = false;
    let pipeline: PhotoPipeline | null = null;

    const image = new Image();
    // Without this the canvas is tainted and toBlob() throws on export. Both
    // the blob host and picsum permit it.
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

    image.onerror = () => {
      if (!cancelled) {
        setLoadError(
          "Could not load this image. It may block cross-origin reads."
        );
      }
    };

    image.src = imageUrl;

    return () => {
      cancelled = true;
      pipeline?.dispose();
      pipelineRef.current = null;
      setIsReady(false);
    };
  }, [imageUrl]);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    pipelineRef.current?.render(showOriginal ? createNeutralEdit() : edit);
  }, [edit, isReady, showOriginal]);

  const render = (next: EditState) => pipelineRef.current?.render(next);

  return { canvasRef, dimensions, isReady, loadError, render };
};
