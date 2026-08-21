import React from "react";
import { containRect } from "../boards/canvas/containRect";

interface StandardShaderProps {
  animate: boolean;
  background: string;
  baseDensity: number;
  blue: string;
  breathing: number;
  clearFeather: number;
  clearSize: number;
  cornerRadius: number;
  description: string;
  descriptionSize: number;
  dotSize: number;
  dots: string;
  fieldSize: number;
  fieldStrength: number;
  height?: number;
  iconOnly: boolean;
  iconSize: number;
  /**
   * A picture to dither instead of the brand mark.
   *
   * The renderer has always been a halftone of a texture; this simply supplies
   * a different one. Null keeps the mark, which is what every existing caller
   * gets without changing.
   */
  imageUrl?: string | null;
  ink: string;
  lockupGap: number;
  markSize: number;
  padding: number;
  reverseBackground: string;
  reverseDots: string;
  reversed: boolean;
  reverseInk: string;
  rotation: number;
  showDescription: boolean;
  speed: number;
  spiralAmount: number;
  spiralArms: number;
  spiralOverlap: number;
  spiralTightness: number;
  style?: React.CSSProperties;
  tracking: number;
  typeSize: number;
  typeWeight: number;
  verticalGap: number;
  width?: number;
  wordmark: string;
}

const HEX_COLOR = /^#([\da-f]{3}|[\da-f]{6})$/i;
const RGB_COLOR = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i;

/**
 * Ported from Framer's RenderTarget check: a static render — a server render,
 * a test environment, a still export — has no frame loop to drive, so the
 * shader paints one frame and stops there.
 */
const isStaticRenderer = typeof requestAnimationFrame !== "function";

interface MarkPath {
  /** Outline in the mark's own square coordinate space. */
  d: string;
  /** Which of the two brand colours fills this path. */
  tone: "blue" | "ink";
}

interface Mark {
  label: string;
  paths: MarkPath[];
  size: number;
}

/**
 * The bearing mark. Only its alpha reaches the shader — the fill colours are
 * there so the same glyph can be drawn on its own elsewhere.
 */
const mark: Mark = {
  label: "bearing mark",
  paths: [
    { d: "M50 2 L58 50 L50 98 L42 50 Z", tone: "ink" },
    { d: "M2 50 L50 42 L98 50 L50 58 Z", tone: "blue" },
  ],
  size: 100,
};

function markDataUri(glyph: Mark, blue: string, ink: string) {
  const shapes = glyph.paths
    .map(
      (path) =>
        `<path d="${path.d}" fill="${path.tone === "blue" ? blue : ink}"/>`
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${glyph.size} ${glyph.size}">${shapes}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function colorVector(value: string, fallback: [number, number, number]) {
  const hex = HEX_COLOR.exec(value.trim());
  if (hex) {
    const raw =
      hex[1].length === 3
        ? hex[1]
            .split("")
            .map((v) => v + v)
            .join("")
        : hex[1];
    return [0, 2, 4].map(
      (offset) => Number.parseInt(raw.slice(offset, offset + 2), 16) / 255
    ) as [number, number, number];
  }
  const rgb = RGB_COLOR.exec(value);
  if (rgb) {
    return [
      Number(rgb[1]) / 255,
      Number(rgb[2]) / 255,
      Number(rgb[3]) / 255,
    ] as [number, number, number];
  }
  return fallback;
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
) {
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
}

export function StandardShader(props: StandardShaderProps) {
  const {
    reversed,
    animate,
    speed,
    dotSize,
    fieldSize,
    fieldStrength,
    baseDensity,
    spiralAmount,
    spiralOverlap,
    spiralArms,
    spiralTightness,
    rotation,
    breathing,
    clearSize,
    clearFeather,
    cornerRadius,
    imageUrl,
    wordmark,
    blue,
    ink,
    reverseInk,
    background,
    reverseBackground,
    dots,
    reverseDots,
    style,
  } = props;

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const activeInk = reversed ? reverseInk : ink;
  const activeBackground = reversed ? reverseBackground : background;
  const activeDots = reversed ? reverseDots : dots;
  const markUri = React.useMemo(
    () => imageUrl ?? markDataUri(mark, blue, activeInk),
    [blue, activeInk, imageUrl]
  );

  React.useEffect(() => {
    const canvas: HTMLCanvasElement | null = canvasRef.current;
    if (!canvas) {
      return;
    }
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      // Required to export the node. WebGL is free to discard the drawing
      // buffer once it has been composited, and does — so toBlob and
      // readPixels return a blank image on every frame except the one that
      // drew it. Keeping the buffer costs a little memory and is the only way
      // a picture can be taken of this at an arbitrary moment.
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      return;
    }

    const vertexSource =
      "attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}";
    const fragmentSource = `
            precision highp float;
            uniform vec2 r;
            uniform float d;
            uniform float t;
            uniform float fieldSize;
            uniform float fieldStrength;
            uniform float baseDensity;
            uniform float spiralAmount;
            uniform float spiralOverlap;
            uniform float spiralArms;
            uniform float spiralTightness;
            uniform float rotation;
            uniform float breathing;
            uniform float clearSize;
            uniform float clearFeather;
            uniform sampler2D markTex;
            uniform float useLuma;
            uniform float imageMode;
            uniform vec3 bg;
            uniform vec3 dots;
            varying vec2 v;
            float coverage(vec2 uv){
                vec4 c=texture2D(markTex,uv);
                // The mark arrives as a shape on transparency, so its alpha is
                // the shape. A photograph is opaque everywhere, so alpha would
                // dither into a solid block — its darkness is the shape instead.
                float luma=dot(c.rgb,vec3(.299,.587,.114));
                return mix(c.a,c.a*(1.-luma),useLuma);
            }
            float bayer2(vec2 p){vec2 q=mod(p,2.);if(q.y<1.)return q.x<1.?0.:2.;return q.x<1.?3.:1.;}
            float bayer4(vec2 p){return 4.*bayer2(mod(p,2.))+bayer2(floor(p/2.));}
            float bayer8(vec2 p){return 4.*bayer4(mod(p,4.))+bayer2(floor(p/4.));}
            float markAt(vec2 uv,float scale,float angle){
                vec2 q=uv-.5;
                // A wired picture is uploaded into a texture that already
                // matches the canvas aspect, so it is sampled one to one. The
                // mark is a square drawn into a square, and needs the frame's
                // aspect divided out of it first.
                if(imageMode<.5){q.x*=r.x/r.y;}
                q=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*q;
                vec2 muv=q*scale+.5;
                if(muv.x<0.||muv.x>1.||muv.y<0.||muv.y>1.)return 0.;
                return coverage(muv);
            }
            float markSpiral(vec2 uv,float scale,float angle,float phase){
                vec2 q=uv-.5;
                if(imageMode<.5){q.x*=r.x/r.y;}
                float radius=length(q);
                float theta=atan(q.y,q.x)+radius*spiralTightness*(spiralArms/4.)+phase+angle;
                q=vec2(cos(theta),sin(theta))*radius*scale+.5;
                if(q.x<0.||q.x>1.||q.y<0.||q.y>1.)return 0.;
                return coverage(q);
            }
            void main(){
                float pxSize=d;
                vec2 px=floor(gl_FragCoord.xy/pxSize);
                float breathe=breathing*sin(t*2.4);
                float spin=t*rotation;
                float original=imageMode>.5
                    ?markAt(v,1./max(fieldSize,.01),spin)
                    :.42*markAt(v,(1.27+breathe)*fieldSize,spin)+.28*markAt(v,(1.01-breathe*.55)*fieldSize,spin)+.17*markAt(v,(.78+breathe*.3)*fieldSize,spin);
                float trailA=.42*markSpiral(v,(1.08+breathe)*fieldSize,spin,0.);
                float trailB=.28*markSpiral(v,(.94-breathe*.55)*fieldSize,spin,2.094);
                float trailC=.17*markSpiral(v,(.78+breathe*.3)*fieldSize,spin,4.189);
                float trail=(trailA+trailB+trailC)*mix(.42,.72,spiralOverlap);
                float shape=baseDensity+fieldStrength*(original+trail*spiralAmount*.48);
                /* Over a picture the trail above does nothing visible: it
                   resamples the texture along a warped path, and a photograph
                   has something everywhere, so every warped sample hits
                   something and the arms never separate. A sparse mark on
                   transparency is what makes that read as a spiral.

                   So in image mode the spiral *modulates* the field instead of
                   resampling it — the arms cut density out of the picture,
                   which is the same gesture applied to a different kind of
                   source. */
                if(imageMode>.5){
                    vec2 sq=v-.5;sq.x*=r.x/r.y;
                    float arms=.5+.5*sin(atan(sq.y,sq.x)*spiralArms+length(sq)*spiralTightness+spin);
                    shape*=mix(1.,arms,clamp(spiralAmount,0.,1.));
                }
                vec2 center=v-.5;center.x*=r.x/r.y;
                float centerClear=1.-smoothstep(clearSize,clearSize+clearFeather,length(center));
                shape=clamp(shape*(1.-centerClear),0.,1.);
                float threshold=1.-bayer8(mod(px,8.))/64.;
                gl_FragColor=vec4(mix(bg,dots,step(threshold,shape)),1.);
            }`;

    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    if (!(vertex && fragment)) {
      return;
    }
    const program = gl.createProgram();
    if (!program) {
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      return;
    }
    // Bound rather than called through `gl` so the name is not read as a hook.
    const activateProgram = gl.useProgram.bind(gl);
    activateProgram(program);

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

    const resolutionUniform = gl.getUniformLocation(program, "r");
    const densityUniform = gl.getUniformLocation(program, "d");
    const timeUniform = gl.getUniformLocation(program, "t");
    const fieldSizeUniform = gl.getUniformLocation(program, "fieldSize");
    const fieldStrengthUniform = gl.getUniformLocation(
      program,
      "fieldStrength"
    );
    const baseDensityUniform = gl.getUniformLocation(program, "baseDensity");
    const spiralAmountUniform = gl.getUniformLocation(program, "spiralAmount");
    const spiralOverlapUniform = gl.getUniformLocation(
      program,
      "spiralOverlap"
    );
    const spiralArmsUniform = gl.getUniformLocation(program, "spiralArms");
    const spiralTightnessUniform = gl.getUniformLocation(
      program,
      "spiralTightness"
    );
    const rotationUniform = gl.getUniformLocation(program, "rotation");
    const breathingUniform = gl.getUniformLocation(program, "breathing");
    const clearSizeUniform = gl.getUniformLocation(program, "clearSize");
    const clearFeatherUniform = gl.getUniformLocation(program, "clearFeather");
    const backgroundUniform = gl.getUniformLocation(program, "bg");
    const dotsUniform = gl.getUniformLocation(program, "dots");
    gl.uniform3fv(
      backgroundUniform,
      colorVector(
        activeBackground,
        reversed ? [0.153, 0.267, 0.302] : [1, 1, 1]
      )
    );
    gl.uniform3fv(
      dotsUniform,
      colorVector(
        activeDots,
        reversed ? [0.94, 0.96, 0.96] : [0.153, 0.267, 0.302]
      )
    );

    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );
    gl.uniform1i(gl.getUniformLocation(program, "markTex"), 0);
    gl.uniform1f(gl.getUniformLocation(program, "useLuma"), imageUrl ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(program, "imageMode"), imageUrl ? 1 : 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    let frame = 0;
    const start = performance.now();
    const shouldAnimate =
      animate &&
      !isStaticRenderer &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
      const height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    const draw = (now = start) => {
      resize();
      gl.uniform2f(resolutionUniform, canvas.width, canvas.height);
      gl.uniform1f(
        densityUniform,
        dotSize * (canvas.width / Math.max(1, canvas.clientWidth))
      );
      gl.uniform1f(
        timeUniform,
        shouldAnimate ? ((now - start) / 1000) * speed : 0
      );
      gl.uniform1f(fieldSizeUniform, fieldSize);
      gl.uniform1f(fieldStrengthUniform, fieldStrength);
      gl.uniform1f(baseDensityUniform, baseDensity);
      gl.uniform1f(spiralAmountUniform, spiralAmount);
      gl.uniform1f(spiralOverlapUniform, spiralOverlap);
      gl.uniform1f(spiralArmsUniform, spiralArms);
      gl.uniform1f(spiralTightnessUniform, spiralTightness);
      gl.uniform1f(rotationUniform, rotation);
      gl.uniform1f(breathingUniform, breathing);
      // The centre clear exists to hold the mark lockup. Over a photograph it
      // punches a hole through the middle of the picture, which is not a
      // composition choice anyone made.
      gl.uniform1f(clearSizeUniform, imageUrl ? 0 : clearSize);
      gl.uniform1f(clearFeatherUniform, clearFeather);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (shouldAnimate) {
        frame = requestAnimationFrame(draw);
      }
    };

    const image = new Image();
    // A picture from blob storage is cross-origin, and drawing one into the
    // texture canvas without this taints it — after which toBlob and
    // readPixels both throw, and the node could never be exported. Harmless
    // for the mark, which is a data URI.
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const textureCanvas = document.createElement("canvas");
      // Square for the mark, which is square. For a picture the texture takes
      // the frame's own aspect, so the shader can sample it one to one and the
      // whole of it is reachable — a square texture stretched across a wide
      // frame is the squashing this replaced.
      const frameAspect =
        canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 1;
      textureCanvas.width = 512;
      textureCanvas.height = imageUrl
        ? Math.max(1, Math.round(512 / frameAspect))
        : 512;
      const context = textureCanvas.getContext("2d");
      if (!context) {
        return;
      }
      context.clearRect(0, 0, textureCanvas.width, textureCanvas.height);
      // Contained, not stretched. The texture is a fixed square and a wired
      // picture is whatever shape it was taken in; drawing one straight into
      // the square squashes it, which on a halftone reads as a squeezed subject
      // rather than as a bug. The padding stays transparent, and the shader
      // treats transparency as nothing to draw.
      const fit = containRect(
        image.naturalWidth,
        image.naturalHeight,
        textureCanvas.width,
        textureCanvas.height
      );
      context.drawImage(image, fit.x, fit.y, fit.width, fit.height);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        textureCanvas
      );
      draw();
    };
    image.src = markUri;

    const observer = new ResizeObserver(() => {
      if (!shouldAnimate) {
        draw();
      }
    });
    observer.observe(canvas);
    draw();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, [
    activeBackground,
    activeDots,
    animate,
    baseDensity,
    breathing,
    clearFeather,
    clearSize,
    dotSize,
    fieldSize,
    fieldStrength,
    imageUrl,
    markUri,
    reversed,
    rotation,
    speed,
    spiralAmount,
    spiralArms,
    spiralOverlap,
    spiralTightness,
  ]);

  return (
    <div
      aria-label={`${wordmark} — ${mark.label}`}
      role="img"
      style={{
        ...style,
        background: activeBackground,
        borderRadius: cornerRadius,
        fontFamily: '"Proxima Nova", "proxima-nova", Arial, sans-serif',
        height: "100%",
        minHeight: 160,
        overflow: "hidden",
        position: "relative",
        width: "100%",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          height: "100%",
          inset: 0,
          position: "absolute",
          width: "100%",
        }}
      />
    </div>
  );
}

/**
 * The shader as designed.
 *
 * Exported so a caller that renders it — the Halftone node — starts from this
 * composition and overrides only what it must, rather than restating three
 * dozen props and quietly inventing a different picture.
 */
export const DEFAULT_PROPS: StandardShaderProps = {
  animate: true,
  background: "#FFFFFF",
  baseDensity: 0.012,
  blue: "#3A70B3",
  breathing: 0.035,
  clearFeather: 0.12,
  clearSize: 0.27,
  cornerRadius: 16,
  description: "Standard",
  descriptionSize: 17,
  dotSize: 4.5,
  dots: "#27444D",
  fieldSize: 1,
  fieldStrength: 1,
  height: 700,
  iconOnly: false,
  iconSize: 180,
  ink: "#131415",
  lockupGap: 10,
  markSize: 104,
  padding: 8,
  reverseBackground: "#27444D",
  reverseDots: "#EEF3F4",
  reversed: true,
  reverseInk: "#FFFFFF",
  rotation: 0.55,
  showDescription: true,
  speed: 0.15,
  spiralAmount: 0.35,
  spiralArms: 3,
  spiralOverlap: 0.58,
  spiralTightness: 18,
  tracking: -0.035,
  typeSize: 92,
  typeWeight: 700,
  verticalGap: 20,
  width: 1200,
  wordmark: "Standard",
};

StandardShader.defaultProps = DEFAULT_PROPS;
