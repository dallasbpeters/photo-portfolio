import { createElement, type ReactNode, useMemo, useRef } from "react";
// biome-ignore lint/performance/noNamespaceImport: layers name their effect at runtime, and there are 189 of them — a named-import list would be a second registry to keep in step with the real one
import * as ShaderComponents from "shaders/react";
import {
  isEffect,
  normalizeLayers,
  type ShaderConfig,
  type ShaderLayer,
} from "./shaderConfig";
import { useIsOnScreen } from "./useIsOnScreen";

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

/** The library's own image source: a shader that draws a picture. */
const IMAGE_LAYER = "ImageTexture";

const hasImageLayer = (layers: ShaderLayer[]): boolean =>
  layers.some(
    (layer) => layer.name === IMAGE_LAYER || hasImageLayer(layer.children ?? [])
  );

const bindImage = (layers: ShaderLayer[], url: string): ShaderLayer[] =>
  layers.map((layer) =>
    layer.name === IMAGE_LAYER
      ? { ...layer, props: { ...layer.props, url } }
      : { ...layer, children: bindImage(layer.children ?? [], url) }
  );

/**
 * Puts the image where an effect will actually reach it: innermost.
 *
 * Following the last layer inwards lands inside every effect wrapping it, which
 * is what someone dragging a picture into a stack of effects means — restyle
 * this, not sit beside it.
 */
const insertImage = (layers: ShaderLayer[], url: string): ShaderLayer[] => {
  const last = layers.at(-1);
  const image = {
    id: `wired-${IMAGE_LAYER}`,
    name: IMAGE_LAYER,
    props: { url },
  };
  if (!(last && isEffect(last.name))) {
    return [...layers, image];
  }
  return [
    ...layers.slice(0, -1),
    { ...last, children: insertImage(last.children ?? [], url) },
  ];
};

/**
 * The stack as it should render, with a wired image bound into it.
 *
 * Done here rather than written into the item's config, so the picture stays a
 * property of the wire: unplug it and the stack is exactly what it was, with no
 * stale URL left behind in the saved board. An explicit ImageTexture layer is
 * filled in wherever it sits, which lets the image be placed deliberately.
 */
const withImage = (
  layers: ShaderLayer[],
  imageUrl: string | null | undefined
): ShaderLayer[] => {
  if (!imageUrl) {
    return layers;
  }
  return hasImageLayer(layers)
    ? bindImage(layers, imageUrl)
    : insertImage(layers, imageUrl);
};

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
    <div className="h-full w-full" ref={frame}>
      {content}
    </div>
  );

  if (layers.length === 0) {
    return framed(
      <div className="flex h-full w-full items-center justify-center bg-board-panel text-[11px] text-board-ink/40">
        No shader chosen
      </div>
    );
  }

  // An effect holding nothing renders as an empty box, which reads as a broken
  // shader rather than an unfinished one. Say which effect, in the terms the
  // panel uses, and offer the fix here rather than pointing at a panel.
  const empty = emptyEffect(layers);
  if (empty) {
    return framed(
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-board-panel p-3 text-center">
        <p className="text-[11px] text-board-ink/50">
          <span className="text-board-ink/80">{empty.name}</span> is an effect —
          it changes a picture, and it is empty.
        </p>
        {onAddSource ? (
          <button
            className="rounded border border-board-ink/20 px-2 py-1 text-[11px] text-board-ink/80 transition-colors hover:border-board-ink/50 hover:text-board-ink"
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
      <div className="flex h-full w-full items-center justify-center bg-board-panel text-[11px] text-red-300">
        Shader runtime unavailable
      </div>
    );
  }

  return framed(
    <div className="h-full w-full overflow-hidden bg-board-surface">
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
