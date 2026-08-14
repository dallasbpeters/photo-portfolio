import { useRef } from "react";
import type { CanvasTransform, CropRect, RenderedRect } from "../engine/export";

/** Display-space minimum crop edge, in pixels. */
const MIN_CROP_PX = 48;
/** Degrees around the cardinal points the rotation snaps to. */
const SNAP_DEG = 6;
/** Radius of the free-rotate handle. */
const HANDLE_RADIUS = 14;

type DragMode = "create" | "move" | "rotate" | "resize";
type Corner = "br" | "bl" | "nw" | "se";

interface CropOverlayProps {
  isDisabled: boolean;
  onChange: (next: CanvasTransform) => void;
  rendered: RenderedRect;
  transform: CanvasTransform;
}

interface Drag {
  corner: Corner | null;
  mode: DragMode;
  startCrop: CropRect;
  startX: number;
  startY: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const cropFromCreate = (
  anchor: CropRect,
  x: number,
  y: number,
  minW: number,
  minH: number
): CropRect => ({
  height: Math.max(minH, Math.abs(y - anchor.y)),
  width: Math.max(minW, Math.abs(x - anchor.x)),
  x: Math.min(anchor.x, x),
  y: Math.min(anchor.y, y),
});

const cropFromMove = (
  start: CropRect,
  startX: number,
  startY: number,
  x: number,
  y: number
): CropRect => ({
  height: start.height,
  width: start.width,
  x: clamp(start.x + (x - startX), 0, 1 - start.width),
  y: clamp(start.y + (y - startY), 0, 1 - start.height),
});

const cropFromResize = (
  start: CropRect,
  corner: Corner,
  x: number,
  y: number,
  minW: number,
  minH: number
): CropRect => {
  const leftEdge = corner === "nw" || corner === "bl";
  const topEdge = corner === "nw" || corner === "br";
  const left = leftEdge ? Math.min(x, start.x + start.width - minW) : start.x;
  const top = topEdge ? Math.min(y, start.y + start.height - minH) : start.y;
  const right = leftEdge ? start.x + start.width : Math.max(x, start.x + minW);
  const bottom = topEdge ? start.y + start.height : Math.max(y, start.y + minH);
  return { height: bottom - top, width: right - left, x: left, y: top };
};

const rotationFromPointer = (
  px: number,
  py: number,
  centerX: number,
  centerY: number
): number => {
  const dx = px - centerX;
  const dy = py - centerY;
  let degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
  degrees = (degrees + 360) % 360;
  for (const snap of [0, 90, 180, 270]) {
    const distance = Math.min(
      Math.abs(degrees - snap),
      360 - Math.abs(degrees - snap)
    );
    if (distance <= SNAP_DEG) {
      degrees = snap;
      break;
    }
  }
  return Math.round(degrees);
};

export function CropOverlay({
  isDisabled,
  onChange,
  rendered,
  transform,
}: CropOverlayProps) {
  const drag = useRef<Drag | null>(null);

  const { height: dH, width: dW, x: ox, y: oy } = rendered;
  const { crop } = transform;

  const box = crop
    ? {
        height: dH * crop.height,
        width: dW * crop.width,
        x: ox + dW * crop.x,
        y: oy + dH * crop.y,
      }
    : { height: dH, width: dW, x: ox, y: oy };

  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const topY = box.y;
  const handleX = centerX;
  // Kept inside the svg: when the image fills the stage edge to edge the
  // handle would otherwise sit above the stage and could never be grabbed.
  const handleY = Math.max(topY - 22, 14);

  const toLocal = (clientX: number, clientY: number, current: SVGElement) => {
    const rect = current.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const toNormalized = (px: number, py: number) => {
    const minW = MIN_CROP_PX / dW;
    const minH = MIN_CROP_PX / dH;
    return {
      minH,
      minW,
      x: clamp((px - ox) / dW, 0, 1),
      y: clamp((py - oy) / dH, 0, 1),
    };
  };

  const cornerAt = (px: number, py: number): Corner | null => {
    const edge = 12;
    if (Math.abs(px - box.x) <= edge && Math.abs(py - box.y) <= edge) {
      return "nw";
    }
    if (
      Math.abs(px - (box.x + box.width)) <= edge &&
      Math.abs(py - box.y) <= edge
    ) {
      return "br";
    }
    if (
      Math.abs(px - box.x) <= edge &&
      Math.abs(py - (box.y + box.height)) <= edge
    ) {
      return "bl";
    }
    if (
      Math.abs(px - (box.x + box.width)) <= edge &&
      Math.abs(py - (box.y + box.height)) <= edge
    ) {
      return "se";
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isDisabled || dW === 0 || dH === 0) {
      return;
    }
    const { x, y } = toLocal(e.clientX, e.clientY, e.currentTarget);
    const { x: nx, y: ny } = toNormalized(x, y);

    if (Math.hypot(x - handleX, y - handleY) <= HANDLE_RADIUS * 2) {
      drag.current = {
        corner: null,
        mode: "rotate",
        startCrop: crop ?? { height: 1, width: 1, x: 0, y: 0 },
        startX: 0,
        startY: 0,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    const corner = cornerAt(x, y);
    if (corner && crop) {
      drag.current = {
        corner,
        mode: "resize",
        startCrop: crop,
        startX: 0,
        startY: 0,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (
      crop &&
      x >= box.x &&
      x <= box.x + box.width &&
      y >= box.y &&
      y <= box.y + box.height
    ) {
      drag.current = {
        corner: null,
        mode: "move",
        startCrop: crop,
        startX: nx,
        startY: ny,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // A fresh crop: the drag start is one corner, the pointer the opposite.
    drag.current = {
      corner: "se",
      mode: "create",
      startCrop: { height: 0, width: 0, x: nx, y: ny },
      startX: nx,
      startY: ny,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const active = drag.current;
    if (active === null || isDisabled) {
      return;
    }
    const { x, y } = toLocal(e.clientX, e.clientY, e.currentTarget);

    if (active.mode === "rotate") {
      onChange({
        crop: transform.crop,
        rotation: rotationFromPointer(x, y, centerX, centerY),
      });
      return;
    }

    const { minH, minW, x: nx, y: ny } = toNormalized(x, y);
    let nextCrop: CropRect;
    if (active.mode === "create") {
      nextCrop = cropFromCreate(active.startCrop, nx, ny, minW, minH);
    } else if (active.mode === "move") {
      nextCrop = cropFromMove(
        active.startCrop,
        active.startX,
        active.startY,
        nx,
        ny
      );
    } else {
      nextCrop = cropFromResize(
        active.startCrop,
        active.corner ?? "se",
        nx,
        ny,
        minW,
        minH
      );
    }
    onChange({ crop: nextCrop, rotation: transform.rotation });
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <svg
      aria-label="Crop and rotate controls"
      className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="img"
    >
      <title>Crop and rotate controls</title>
      {crop ? (
        <>
          <rect
            fill="none"
            height={box.height}
            stroke="rgba(255,255,255,0.95)"
            strokeWidth={1.5}
            width={box.width}
            x={box.x}
            y={box.y}
          />
          {(
            [
              [box.x, box.y, "nw"],
              [box.x + box.width, box.y, "br"],
              [box.x, box.y + box.height, "bl"],
              [box.x + box.width, box.y + box.height, "se"],
            ] as const
          ).map(([hx, hy, key]) => (
            <rect
              fill="white"
              height={10}
              key={key}
              stroke="rgba(0,0,0,0.4)"
              strokeWidth={1}
              width={10}
              x={hx - 5}
              y={hy - 5}
            />
          ))}
        </>
      ) : null}
      <line
        stroke="rgba(255,255,255,0.9)"
        strokeWidth={1.5}
        x1={centerX}
        x2={handleX}
        y1={topY}
        y2={handleY}
      />
      <circle
        cx={handleX}
        cy={handleY}
        fill="white"
        r={HANDLE_RADIUS}
        stroke="rgba(0,0,0,0.4)"
        strokeWidth={1}
      />
      <circle cx={handleX} cy={handleY} fill="rgba(0,0,0,0.55)" r={4} />
      {crop ? null : (
        <text
          fill="rgba(255,255,255,0.85)"
          fontSize={11}
          textAnchor="middle"
          x={centerX}
          y={oy + dH / 2 - 8}
        >
          Drag to crop · drag the dial to rotate
        </text>
      )}
    </svg>
  );
}
