import type { EditState } from "../adjustments";
import { buildCurveTexture, isIdentityCurve, type Lut } from "./curves";
import { BLUR_SHADER, GRADE_SHADER, VERTEX_SHADER } from "./shaders";

/**
 * WebGL renderer for the photo pipeline.
 *
 * Owns its GL resources and re-renders synchronously on demand, so dragging a
 * slider is a uniform update and one draw rather than any per-pixel JS. Call
 * `dispose()` when the editor unmounts — browsers cap live WebGL contexts, and
 * leaking one per opened photo will eventually blank the canvas.
 */
export class PhotoPipeline {
  private readonly gl: WebGLRenderingContext;
  private readonly canvas: HTMLCanvasElement;

  private readonly blurProgram: WebGLProgram;
  private readonly gradeProgram: WebGLProgram;
  private readonly quad: WebGLBuffer;

  private sourceTexture: WebGLTexture | null = null;
  private curveTexture: WebGLTexture | null = null;
  /** LUTs registered by id, so a look can name one without re-uploading it. */
  private readonly lutTextures = new Map<
    string,
    { texture: WebGLTexture; size: number }
  >();
  /** Serialised curve last uploaded, so an unchanged curve is not rebuilt each frame. */
  private curveKey = "";
  private pingTexture: WebGLTexture | null = null;
  private pongTexture: WebGLTexture | null = null;
  private pingFbo: WebGLFramebuffer | null = null;
  private pongFbo: WebGLFramebuffer | null = null;

  private imageWidth = 0;
  private imageHeight = 0;
  /** Blur runs at half resolution — invisible for these effects, much cheaper. */
  private blurWidth = 0;
  private blurHeight = 0;

  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", {
      antialias: false,
      premultipliedAlpha: false,
      // Reading pixels back for export requires the drawing buffer to survive
      // the composite.
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      throw new Error("WebGL is not available in this browser");
    }
    this.gl = gl;

    this.blurProgram = this.buildProgram(VERTEX_SHADER, BLUR_SHADER);
    this.gradeProgram = this.buildProgram(VERTEX_SHADER, GRADE_SHADER);

    const quad = gl.createBuffer();
    if (!quad) {
      throw new Error("Could not allocate vertex buffer");
    }
    this.quad = quad;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
  }

  // ── Setup ─────────────────────────────────────────────────────────────────

  /** Uploads the image and sizes every intermediate target to match. */
  setImage(
    image: HTMLImageElement | ImageBitmap,
    width: number,
    height: number
  ): void {
    const gl = this.gl;

    this.imageWidth = width;
    this.imageHeight = height;
    this.blurWidth = Math.max(1, Math.floor(width / 2));
    this.blurHeight = Math.max(1, Math.floor(height / 2));

    this.canvas.width = width;
    this.canvas.height = height;

    this.deleteTexture(this.sourceTexture);
    this.sourceTexture = this.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    this.releaseTargets();
    const ping = this.createRenderTarget(this.blurWidth, this.blurHeight);
    const pong = this.createRenderTarget(this.blurWidth, this.blurHeight);
    this.pingTexture = ping.texture;
    this.pingFbo = ping.fbo;
    this.pongTexture = pong.texture;
    this.pongFbo = pong.fbo;
  }

  /**
   * Registers a 3D LUT under an id. Uploading is idempotent, so a look can be
   * applied repeatedly without re-sending the table.
   */
  registerLut(id: string, lut: Lut): void {
    if (this.disposed || this.lutTextures.has(id)) {
      return;
    }
    const gl = this.gl;
    const texture = this.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // NEAREST on the vertical axis would band; the shader interpolates the
    // blue axis itself and relies on LINEAR for red and green.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      lut.size * lut.size,
      lut.size,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      lut.data
    );
    this.lutTextures.set(id, { size: lut.size, texture });
  }

  hasLut(id: string): boolean {
    return this.lutTextures.has(id);
  }

  /** Rebuilds the 256x1 curve texture, skipping the work when nothing changed. */
  private syncCurve(edit: EditState): void {
    const gl = this.gl;
    const key =
      edit.curveAmount > 0 && edit.curve ? JSON.stringify(edit.curve) : "";
    if (key === this.curveKey && this.curveTexture) {
      return;
    }
    this.curveKey = key;

    if (!this.curveTexture) {
      this.curveTexture = this.createTexture();
    }
    // An identity ramp keeps the sampler valid when no curve is active, so the
    // shader never reads an unbound texture.
    const data = key ? buildCurveTexture(edit.curve!) : buildCurveTexture({});

    gl.bindTexture(gl.TEXTURE_2D, this.curveTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      256,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  render(edit: EditState): void {
    if (this.disposed || !this.sourceTexture) {
      return;
    }
    const gl = this.gl;

    // Blur radius scales with the effects that consume it, so a neutral edit
    // does the cheapest possible blur rather than a wasted wide one.
    const blurRadius =
      1.0 +
      Math.abs(edit.clarity) * 3.0 +
      edit.halation * 5.0 +
      edit.denoise * 4.0 +
      edit.sharpness * 1.5;

    // Pass 1 — horizontal
    this.bindTarget(this.pingFbo, this.blurWidth, this.blurHeight);
    // biome-ignore lint/correctness/useHookAtTopLevel: gl.useProgram is the WebGL API, not a React hook — the rule matches on the `use` prefix
    gl.useProgram(this.blurProgram);
    this.bindQuad(this.blurProgram);
    this.setTexture(this.blurProgram, "uImage", this.sourceTexture, 0);
    gl.uniform2f(
      this.loc(this.blurProgram, "uTexel"),
      1 / this.blurWidth,
      1 / this.blurHeight
    );
    gl.uniform2f(this.loc(this.blurProgram, "uDirection"), 1, 0);
    gl.uniform1f(this.loc(this.blurProgram, "uRadius"), blurRadius);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Pass 2 — vertical
    this.bindTarget(this.pongFbo, this.blurWidth, this.blurHeight);
    this.setTexture(this.blurProgram, "uImage", this.pingTexture, 0);
    gl.uniform2f(this.loc(this.blurProgram, "uDirection"), 0, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Pass 3 — grade to the visible canvas
    this.bindTarget(null, this.imageWidth, this.imageHeight);
    // biome-ignore lint/correctness/useHookAtTopLevel: gl.useProgram is the WebGL API, not a React hook
    gl.useProgram(this.gradeProgram);
    this.bindQuad(this.gradeProgram);
    this.setTexture(this.gradeProgram, "uImage", this.sourceTexture, 0);
    this.setTexture(this.gradeProgram, "uBlur", this.pongTexture, 1);

    const p = this.gradeProgram;
    gl.uniform2f(this.loc(p, "uResolution"), this.imageWidth, this.imageHeight);

    gl.uniform1f(this.loc(p, "uExposure"), edit.exposure);
    gl.uniform1f(this.loc(p, "uContrast"), edit.contrast);
    gl.uniform1f(this.loc(p, "uHighlights"), edit.highlights);
    gl.uniform1f(this.loc(p, "uShadows"), edit.shadows);
    gl.uniform1f(this.loc(p, "uWhites"), edit.whites);
    gl.uniform1f(this.loc(p, "uBlacks"), edit.blacks);

    gl.uniform1f(this.loc(p, "uSaturation"), edit.saturation);
    gl.uniform1f(this.loc(p, "uTemperature"), edit.temperature);
    gl.uniform1f(this.loc(p, "uTint"), edit.tint);

    gl.uniform1f(this.loc(p, "uClarity"), edit.clarity);
    gl.uniform1f(this.loc(p, "uSharpness"), edit.sharpness);
    gl.uniform1f(this.loc(p, "uDenoise"), edit.denoise);

    gl.uniform1f(this.loc(p, "uGrain"), edit.grain);
    gl.uniform1f(this.loc(p, "uHalation"), edit.halation);
    gl.uniform1f(this.loc(p, "uFade"), edit.fade);
    gl.uniform1f(this.loc(p, "uSplitBalance"), edit.splitBalance);
    gl.uniform3f(
      this.loc(p, "uSplitShadow"),
      edit.splitShadow.r,
      edit.splitShadow.g,
      edit.splitShadow.b
    );
    gl.uniform3f(
      this.loc(p, "uSplitHighlight"),
      edit.splitHighlight.r,
      edit.splitHighlight.g,
      edit.splitHighlight.b
    );

    gl.uniform1f(this.loc(p, "uVignette"), edit.vignette);
    gl.uniform1f(this.loc(p, "uGrainSize"), edit.grainSize);
    gl.uniform1f(this.loc(p, "uGrainRoughness"), edit.grainRoughness);

    // Tone curve
    this.syncCurve(edit);
    this.setTexture(p, "uCurve", this.curveTexture, 2);
    gl.uniform1f(
      this.loc(p, "uCurveAmount"),
      isIdentityCurve(edit.curve) ? 0 : edit.curveAmount
    );

    // HSL bands, flattened to the vec3 array the shader declares.
    const bands = new Float32Array(24);
    for (let i = 0; i < 8; i += 1) {
      const band = edit.hsl[i];
      bands[i * 3 + 0] = band?.hue ?? 0;
      bands[i * 3 + 1] = band?.saturation ?? 0;
      bands[i * 3 + 2] = band?.luminance ?? 0;
    }
    gl.uniform3fv(this.loc(p, "uHsl[0]"), bands);
    gl.uniform1f(this.loc(p, "uHslAmount"), edit.hslAmount);

    // 3D LUT — only bound when the look names one that has been registered.
    const lut = edit.lutId ? this.lutTextures.get(edit.lutId) : undefined;
    this.setTexture(p, "uLut", lut?.texture ?? this.curveTexture, 3);
    gl.uniform1f(this.loc(p, "uLutSize"), lut?.size ?? 0);
    gl.uniform1f(this.loc(p, "uLutAmount"), lut ? edit.lutAmount : 0);
    // Fixed seed: grain must not crawl between renders while a slider moves.
    gl.uniform1f(this.loc(p, "uSeed"), 17.0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /** Encodes the current canvas. Render first. */
  toBlob(type: string, quality: number): Promise<Blob | null> {
    return new Promise((resolve) => this.canvas.toBlob(resolve, type, quality));
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const gl = this.gl;
    this.deleteTexture(this.sourceTexture);
    this.deleteTexture(this.curveTexture);
    for (const { texture } of this.lutTextures.values()) {
      this.deleteTexture(texture);
    }
    this.lutTextures.clear();
    this.releaseTargets();
    gl.deleteProgram(this.blurProgram);
    gl.deleteProgram(this.gradeProgram);
    gl.deleteBuffer(this.quad);
    // Free the context immediately rather than waiting for GC — browsers allow
    // only a handful of live contexts per page.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private buildProgram(vertexSrc: string, fragmentSrc: string): WebGLProgram {
    const gl = this.gl;
    const program = gl.createProgram();
    if (!program) {
      throw new Error("Could not allocate shader program");
    }

    const vs = this.compile(gl.VERTEX_SHADER, vertexSrc);
    const fs = this.compile(gl.FRAGMENT_SHADER, fragmentSrc);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      throw new Error(`Shader link failed: ${log ?? "unknown"}`);
    }
    // Attached shaders are retained by the linked program.
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return program;
  }

  private compile(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) {
      throw new Error("Could not allocate shader");
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile failed: ${log ?? "unknown"}`);
    }
    return shader;
  }

  private createTexture(): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) {
      throw new Error("Could not allocate texture");
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // CLAMP_TO_EDGE + LINEAR keeps non-power-of-two photos legal in WebGL1.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  private createRenderTarget(
    width: number,
    height: number
  ): { texture: WebGLTexture; fbo: WebGLFramebuffer } {
    const gl = this.gl;
    const texture = this.createTexture();
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );

    const fbo = gl.createFramebuffer();
    if (!fbo) {
      throw new Error("Could not allocate framebuffer");
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, texture };
  }

  private bindTarget(
    fbo: WebGLFramebuffer | null,
    width: number,
    height: number
  ): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, width, height);
  }

  private bindQuad(program: WebGLProgram): void {
    const gl = this.gl;
    const attr = gl.getAttribLocation(program, "aPosition");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(attr);
    gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);
  }

  private setTexture(
    program: WebGLProgram,
    name: string,
    texture: WebGLTexture | null,
    unit: number
  ): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.loc(program, name), unit);
  }

  private loc(
    program: WebGLProgram,
    name: string
  ): WebGLUniformLocation | null {
    return this.gl.getUniformLocation(program, name);
  }

  private deleteTexture(texture: WebGLTexture | null): void {
    if (texture) {
      this.gl.deleteTexture(texture);
    }
  }

  private releaseTargets(): void {
    const gl = this.gl;
    this.deleteTexture(this.pingTexture);
    this.deleteTexture(this.pongTexture);
    if (this.pingFbo) {
      gl.deleteFramebuffer(this.pingFbo);
    }
    if (this.pongFbo) {
      gl.deleteFramebuffer(this.pongFbo);
    }
    this.pingTexture = null;
    this.pongTexture = null;
    this.pingFbo = null;
    this.pongFbo = null;
  }
}
