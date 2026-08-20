/**
 * A photograph resolved to two brand colours by an ordered dither.
 *
 * Lifted from the `<halftone-image>` element on the brand site, where it has
 * been in production and correct. Using the same shader here is the point: the
 * canvas should produce the treatment the brand already uses, not a second
 * approximation of it that drifts.
 *
 * It also answers, by not having them, the four faults the shader library's
 * Halftone had here:
 *
 * - **Two colours, both chosen.** `mix(paper, ink, …)` takes both ends, so
 *   inverting is swapping them. The library exposed only the dark end in the
 *   mode that worked, and two attempts to map the light end failed because its
 *   dot size is derived from the brightness it is handed.
 * - **A dot is measured in pixels.** The library measures cells across the
 *   frame, so the same number meant a different thing at every size and aliased
 *   into moiré on a small node. A pixel pitch cannot.
 * - **WebGL, so it can be read back.** The library draws through WebGPU, whose
 *   canvas hands back a fully transparent image to `toBlob`, `drawImage` and
 *   `createImageBitmap` alike — measured, every pixel at alpha zero — which is
 *   why exporting needed a `captureStream` detour.
 * - **Cover-fit in the shader.** No fighting `objectFit` and no frame of the
 *   wrong shape.
 *
 * The dot pitch is in *output* pixels, which is what a print screen ruling is:
 * a fixed pitch, so a bigger sheet carries more dots rather than bigger ones.
 */

export interface HalftoneOptions {
  /** Dot pitch in output pixels. */
  dot: number;
  /** Tone curve. Above 1 lightens the midtones, below 1 darkens them. */
  gamma: number;
  ink: string;
  paper: string;
}

export const HALFTONE_DEFAULTS: HalftoneOptions = {
  dot: 3,
  gamma: 1.25,
  ink: "#27444D",
  paper: "#FAFAFA",
};

const HEX = /^#(?<hex>[\da-f]{3}|[\da-f]{6})$/iu;

/** `#rgb` or `#rrggbb` as three 0–1 floats, or the fallback if it is neither. */
export const colorVector = (
  value: unknown,
  fallback: [number, number, number]
): [number, number, number] => {
  const matched = String(value).trim().match(HEX);
  const raw = matched?.groups?.hex;
  if (!raw) {
    return fallback;
  }
  const full =
    raw.length === 3
      ? [...raw].map((character) => character + character).join("")
      : raw;
  return [0, 2, 4].map(
    (offset) => Number.parseInt(full.slice(offset, offset + 2), 16) / 255
  ) as [number, number, number];
};

const VERTEX_SOURCE =
  "attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}";

const FRAGMENT_SOURCE = `
precision highp float;
uniform vec2 r;
uniform float d;
uniform float imgAspect;
uniform float gamma;
uniform sampler2D photoTex;
uniform vec3 paper;
uniform vec3 ink;
varying vec2 v;
float bayer2(vec2 p){vec2 q=mod(p,2.);if(q.y<1.)return q.x<1.?0.:2.;return q.x<1.?3.:1.;}
float bayer4(vec2 p){return 4.*bayer2(mod(p,2.))+bayer2(floor(p/2.));}
float bayer8(vec2 p){return 4.*bayer4(mod(p,4.))+bayer2(floor(p/4.));}
// Cover-fit: scale the sampled range down on the axis that overflows, so the
// photo fills the box and the excess is cropped rather than squashed.
vec2 coverUV(vec2 uv){
    float canvasAspect = r.x / r.y;
    vec2 s = canvasAspect > imgAspect
        ? vec2(1., imgAspect / canvasAspect)
        : vec2(canvasAspect / imgAspect, 1.);
    return (uv - .5) * s + .5;
}
void main(){
    vec2 px = floor(gl_FragCoord.xy / d);
    vec3 photo = texture2D(photoTex, coverUV(v)).rgb;
    float luma = dot(photo, vec3(.299, .587, .114));
    float coverage = pow(clamp(1. - luma, 0., 1.), gamma);
    float threshold = 1. - bayer8(mod(px, 8.)) / 64.;
    gl_FragColor = vec4(mix(paper, ink, step(threshold, coverage)), 1.);
}`;

const compile = (
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null => {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

export class HalftoneError extends Error {}

/**
 * Draws `image` into `canvas`, at whatever size the canvas already is.
 *
 * `preserveDrawingBuffer`, because the point of drawing it is to read it back:
 * without it a WebGL canvas is emptied as soon as it is composited, and every
 * capture after the frame that drew it comes back blank.
 */
export const paintHalftone = (
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  options: HalftoneOptions
): void => {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) {
    throw new HalftoneError("This browser cannot draw the halftone.");
  }

  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
  if (!(vertex && fragment)) {
    throw new HalftoneError("The halftone shader would not compile.");
  }
  const program = gl.createProgram();
  if (!program) {
    throw new HalftoneError("The halftone shader would not compile.");
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new HalftoneError("The halftone shader would not link.");
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  const position = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  } catch (error) {
    // A cross-origin picture without CORS headers cannot become a texture, and
    // the browser will not say which one — so name the cause here.
    throw new HalftoneError(
      "That picture could not be read. It came from another origin without permission.",
      { cause: error }
    );
  }

  const uniform = (name: string) => gl.getUniformLocation(program, name);
  gl.uniform1i(uniform("photoTex"), 0);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform2f(uniform("r"), canvas.width, canvas.height);
  gl.uniform1f(uniform("d"), Math.max(1, options.dot));
  gl.uniform1f(
    uniform("imgAspect"),
    image.naturalWidth / Math.max(1, image.naturalHeight)
  );
  gl.uniform1f(uniform("gamma"), Math.max(0.01, options.gamma));
  gl.uniform3fv(uniform("paper"), colorVector(options.paper, [1, 1, 1]));
  gl.uniform3fv(
    uniform("ink"),
    colorVector(options.ink, [0.153, 0.267, 0.302])
  );
  gl.drawArrays(gl.TRIANGLES, 0, 6);
};

const number = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const text = (value: unknown, fallback: string): string =>
  typeof value === "string" && HEX.test(value.trim()) ? value.trim() : fallback;

/** A node's stored settings, read as options. Unset or malformed falls back. */
export const halftoneOptionsFrom = (
  config: Record<string, unknown>
): HalftoneOptions => ({
  dot: number(config.dot, HALFTONE_DEFAULTS.dot),
  gamma: number(config.gamma, HALFTONE_DEFAULTS.gamma),
  ink: text(config.ink, HALFTONE_DEFAULTS.ink),
  paper: text(config.paper, HALFTONE_DEFAULTS.paper),
});

/** The picture, loaded and ready to be a texture. */
export const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new HalftoneError("That picture could not be loaded."));
    image.src = url;
  });
