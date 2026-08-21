import { createElement, type ReactNode, useMemo, useRef } from "react";
// biome-ignore lint/performance/noNamespaceImport: layers name their effect at runtime, and there are 189 of them — a named-import list would be a second registry to keep in step with the real one
import * as ShaderComponents from "shaders/react";
import { useIsOnScreen } from "../hooks/useIsOnScreen";
import {
  isEffect,
  normalizeLayers,
  type ShaderConfig,
  type ShaderLayer,
  withImage,
} from "./shaderConfig";
import "./ShaderView.css";

/**
 * A stack of shaders, rendered live on the canvas.
 *
 * The library has two kinds of thing in it. A **source** draws a picture — a
 * texture, a gradient, a shape. An **effect** changes a picture that already
 * exists — a blur, a dither, an adjustment — so it has to be given something to
 * work on, which it holds as its children:
 *
 *   Dither
 *     └─ Plasma          → <Dither><Plasma /></Dither>
 *
 * That containment is stored explicitly. It used to be implied by position in a
 * flat list, where an effect took everything after it, and that could only ever
 * mean "all of the rest" — so Group, whose whole purpose is to hold a chosen
 * few, had nothing to hold.
 *
 * Components are looked up by name rather than imported one by one: there are
 * 189 of them, and an import list would be a second registry to keep in step
 * with the real one.
 */

type ShaderModule = Record<string, unknown>;

const componentFor = (name: string): unknown =>
  (ShaderComponents as ShaderModule)[name];

const isRenderable = (component: unknown): boolean =>
  typeof component === "function" ||
  (typeof component === "object" && component !== null);

/**
 * Renders sibling layers, each with whatever it contains.
 *
 * An effect renders its own children and nothing else, so it covers exactly
 * what was put inside it.
 */
const renderLayers = (layers: ShaderLayer[]): ReactNode =>
  layers.map((layer, index) => {
    const component = componentFor(layer.name);
    // A name the installed package does not know — an effect removed upstream,
    // or a board written by a newer version. Skipped rather than thrown: one
    // unknown layer should not blank the whole item.
    if (!isRenderable(component)) {
      return null;
    }
    const key = layer.id || `${layer.name}-${index}`;
    const children = layer.children?.length
      ? renderLayers(layer.children)
      : null;
    return createElement(component as never, { key, ...layer.props }, children);
  });

/** The first effect found with nothing inside it, or null. */
const emptyEffect = (layers: ShaderLayer[]): ShaderLayer | null => {
  for (const layer of layers) {
    if (isEffect(layer.name) && !layer.children?.length) {
      return layer;
    }
    const nested = emptyEffect(layer.children ?? []);
    if (nested) {
      return nested;
    }
  }
  return null;
};

interface ShaderViewProps {
  config: ShaderConfig;
  /** A picture wired into this shader, bound in at render time. */
  imageUrl?: string | null;
  /** Fills an empty effect with a source, from the canvas rather than a panel. */
  onAddSource?: (layerId: string) => void;
}

export function ShaderView({ config, imageUrl, onAddSource }: ShaderViewProps) {
  const frame = useRef<HTMLDivElement>(null);
  const isOnScreen = useIsOnScreen(frame);
  // Recomputing these on a render that only toggles visibility is wasted, and
  // both walk the whole tree.
  const layers = useMemo(
    () => withImage(normalizeLayers(config.layers), imageUrl),
    [config.layers, imageUrl]
  );
  const Shader = componentFor("Shader");

  const framed = (content: ReactNode) => (
    <div className="shader-view" ref={frame}>
      {content}
    </div>
  );

  if (layers.length === 0) {
    return framed(<div className="shader-view__state">No shader chosen</div>);
  }

  // An effect holding nothing renders as an empty box, which reads as a broken
  // shader rather than an unfinished one. Say which effect, in the terms the
  // panel uses, and offer the fix here rather than pointing at a panel.
  const empty = emptyEffect(layers);
  if (empty) {
    return framed(
      <div className="shader-view__empty">
        <p className="shader-view__empty-text">
          <span className="shader-view__empty-name">{empty.name}</span> is an
          effect — it changes a picture, and it is empty.
        </p>
        {onAddSource ? (
          <button
            className="shader-view__empty-action"
            onClick={() => onAddSource(empty.id)}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            Put something in it
          </button>
        ) : null}
      </div>
    );
  }

  if (typeof Shader !== "function") {
    return framed(
      <div className="shader-view__state shader-view__state--error">
        Shader runtime unavailable
      </div>
    );
  }

  return framed(
    <div className="shader-view__canvas">
      {/* Unmounted while off screen, which is the only way to stop it: the
          library's root component takes no `paused` prop, so a mounted shader
          animates on a GPU frame loop forever whether or not anyone can see
          it. On a large board that was every shader at once, always. */}
      {isOnScreen
        ? createElement(
            Shader as never,
            { style: { height: "100%", width: "100%" } },
            renderLayers(layers)
          )
        : null}
    </div>
  );
}
