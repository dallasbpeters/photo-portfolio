import { ShaderView } from "../shaders/ShaderView";
import type { ShaderConfig } from "../shaders/shaderConfig";
import { renderOffscreen } from "./renderOffscreen";

/**
 * A shader stack, rendered to a file.
 *
 * The half that turns a shader from somewhere a picture ends up into something
 * you can keep. `config/nodeTypes.ts` states the limitation this removes: a
 * shader item has no output port and nothing reads from it, because until now
 * there was no rendered file for anything to read.
 *
 * Rendered offscreen at a fixed size rather than captured from the item on the
 * board — see renderOffscreen for why. The wired picture is passed in so the
 * export matches what the canvas was showing rather than the bare stack.
 */

/** Big enough to print from, small enough to store without thinking about it. */
export const SHADER_EXPORT_SIZE = 2048;

/**
 * A PNG of this stack at `size`, square by default.
 *
 * Square because a shader stack has no composition of its own to preserve — it
 * fills whatever frame it is given, unlike the halftone, whose lockup was laid
 * out for a particular aspect.
 */
export const renderShaderStack = async (
  config: ShaderConfig,
  imageUrl: string | null,
  size = SHADER_EXPORT_SIZE
): Promise<Blob> =>
  await renderOffscreen(<ShaderView config={config} imageUrl={imageUrl} />, {
    height: size,
    width: size,
  });
