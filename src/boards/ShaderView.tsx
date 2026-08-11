import { createElement, Fragment, type ReactNode } from "react";
// biome-ignore lint/performance/noNamespaceImport: layers name their effect at runtime, and there are 189 of them — a named-import list would be a second registry to keep in step with the real one
import * as ShaderComponents from "shaders/react";
import type { ShaderConfig } from "./shaderConfig";
import { shaderMeta } from "./shaderConfig";

/**
 * A stack of shader effects, rendered live on the canvas.
 *
 * Effects compose by nesting, not by stacking. Roughly half the library
 * "requires a child": it transforms whatever is inside it rather than drawing
 * on its own — a Dither wrapping a Plasma, not a Dither beside one. So a
 * wrapping effect takes everything below it in the stack as its children, and
 * effects that draw for themselves sit as siblings:
 *
 *   [Dither, Plasma, WaveDistortion]
 *     → <Dither><Plasma /><WaveDistortion /></Dither>
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
 * Renders layers from `index` down.
 *
 * A wrapping effect consumes the rest of the stack; anything else renders in
 * place and the walk continues, so no layer is dropped whatever the order.
 */
const buildChain = (
  layers: ShaderConfig["layers"],
  index: number
): ReactNode => {
  if (index >= layers.length) {
    return null;
  }
  const layer = layers[index];
  if (!layer) {
    return null;
  }

  const component = componentFor(layer.name);
  // A name the installed package does not know — an effect removed upstream, or
  // a board written by a newer version. Skipped rather than thrown: one unknown
  // layer should not blank the whole item.
  if (!isRenderable(component)) {
    return buildChain(layers, index + 1);
  }

  const key = `${layer.name}-${index}`;
  const props = { key, ...layer.props };

  if (shaderMeta(layer.name)?.requiresChild) {
    return createElement(
      component as never,
      props,
      buildChain(layers, index + 1)
    );
  }

  return createElement(
    Fragment,
    { key },
    createElement(component as never, { ...layer.props }),
    buildChain(layers, index + 1)
  );
};

interface ShaderViewProps {
  config: ShaderConfig;
  /** A picture wired into this shader, bound in at render time. */
  imageUrl?: string | null;
  /** Appends a default source when the stack has nothing left to transform. */
  onAddSource?: () => void;
}

/**
 * True when the stack ends on an effect that transforms a picture, leaving it
 * nothing to transform.
 *
 * New stacks are built so this cannot happen, but removing the source layer or
 * dragging a wrapper to the bottom gets there, and the result is an empty box
 * that looks like a bug rather than a stack that is one layer short.
 */
const lacksSource = (layers: ShaderConfig["layers"]): boolean => {
  const last = layers.at(-1);
  return last ? shaderMeta(last.name)?.requiresChild === true : false;
};

/** The library's own image source: a shader that draws a picture. */
const IMAGE_LAYER = "ImageTexture";

/**
 * The stack as it should actually render, with a wired image bound into it.
 *
 * Done here rather than written into the item's config, so the picture stays a
 * property of the wire: unplug it and the stack is exactly what it was, with no
 * stale URL left behind in the saved board.
 *
 * An explicit ImageTexture layer is filled in wherever it sits, which lets the
 * image be layered deliberately. Without one it is appended, and the bottom of
 * the stack is what every effect above it transforms — the thing someone
 * dragging a wire into a shader plainly means.
 */
const withImage = (
  layers: ShaderConfig["layers"],
  imageUrl: string | null | undefined
): ShaderConfig["layers"] => {
  if (!imageUrl) {
    return layers;
  }
  const bound = layers.map((layer) =>
    layer.name === IMAGE_LAYER
      ? { ...layer, props: { ...layer.props, url: imageUrl } }
      : layer
  );
  if (bound.some((layer) => layer.name === IMAGE_LAYER)) {
    return bound;
  }
  return [
    ...bound,
    { id: `wired-${IMAGE_LAYER}`, name: IMAGE_LAYER, props: { url: imageUrl } },
  ];
};

export function ShaderView({ config, imageUrl, onAddSource }: ShaderViewProps) {
  const layers = withImage(config.layers, imageUrl);
  const Shader = componentFor("Shader");

  if (layers.length > 0 && lacksSource(layers)) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-neutral-900 p-3 text-center">
        <p className="text-[11px] text-white/50">
          “{layers.at(-1)?.name}” transforms whatever is beneath it, and there
          is nothing beneath it yet.
        </p>
        {/* The fix offered where the problem is seen. Telling someone to add a
            layer is useless if the only way to do it is a panel they have to
            know exists. */}
        {onAddSource ? (
          <button
            className="rounded border border-white/20 px-2 py-1 text-[11px] text-white/80 transition-colors hover:border-white/50 hover:text-white"
            onClick={onAddSource}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            Add something to transform
          </button>
        ) : null}
      </div>
    );
  }

  if (layers.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-neutral-900 text-[11px] text-white/40">
        No shader chosen
      </div>
    );
  }

  if (typeof Shader !== "function") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-neutral-900 text-[11px] text-red-300">
        Shader runtime unavailable
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden bg-black">
      {createElement(
        Shader as never,
        { style: { height: "100%", width: "100%" } },
        buildChain(layers, 0)
      )}
    </div>
  );
}
