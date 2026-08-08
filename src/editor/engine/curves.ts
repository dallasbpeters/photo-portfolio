/**
 * Tone curves and 3D LUTs, prepared on the client for the shader to look up.
 *
 * Evaluating a spline per pixel in GLSL would be wasteful when the input domain
 * is only 256 values wide. Curves are baked into a 256x1 RGBA texture once per
 * change; the shader does three texture reads.
 */

/** A control point on a curve. Both axes are 0–1. */
export interface CurvePoint {
  x: number;
  y: number;
}

/** Per-channel curves. Any channel left out is identity. */
export interface ToneCurve {
  b?: CurvePoint[];
  g?: CurvePoint[];
  r?: CurvePoint[];
  rgb?: CurvePoint[];
}

const IDENTITY: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

/**
 * Monotone cubic interpolation (Fritsch–Carlson).
 *
 * A natural cubic spline through hand-placed points overshoots, which on a tone
 * curve shows up as a dark halo above a highlight roll-off or a lifted patch in
 * the shadows. This variant cannot overshoot between control points.
 */
const buildInterpolator = (points: CurvePoint[]): ((x: number) => number) => {
  const pts = [...points].sort((a, b) => a.x - b.x);
  const n = pts.length;
  if (n === 0) {
    return (x) => x;
  }
  if (n === 1) {
    return () => pts[0]?.y;
  }

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);

  // Secant slopes between consecutive points.
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const dx = xs[i + 1]! - xs[i]!;
    delta.push(dx === 0 ? 0 : (ys[i + 1]! - ys[i]!) / dx);
  }

  // Tangents, then the Fritsch–Carlson clamp that guarantees monotonicity.
  const m: number[] = [delta[0] ?? 0];
  for (let i = 1; i < n - 1; i += 1) {
    const d0 = delta[i - 1]!;
    const d1 = delta[i]!;
    m.push(d0 * d1 <= 0 ? 0 : (d0 + d1) / 2);
  }
  m.push(delta[n - 2] ?? 0);

  for (let i = 0; i < n - 1; i += 1) {
    const d = delta[i]!;
    if (d === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / d;
    const b = m[i + 1]! / d;
    const h = Math.hypot(a, b);
    if (h > 3) {
      const t = 3 / h;
      m[i] = t * a * d;
      m[i + 1] = t * b * d;
    }
  }

  return (x: number): number => {
    if (x <= xs[0]!) {
      return ys[0]!;
    }
    if (x >= xs[n - 1]!) {
      return ys[n - 1]!;
    }

    let i = n - 2;
    for (let j = 0; j < n - 1; j += 1) {
      if (x < xs[j + 1]!) {
        i = j;
        break;
      }
    }

    const h = xs[i + 1]! - xs[i]!;
    const t = (x - xs[i]!) / h;
    const t2 = t * t;
    const t3 = t2 * t;

    // Hermite basis.
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i]! +
      (t3 - 2 * t2 + t) * h * m[i]! +
      (-2 * t3 + 3 * t2) * ys[i + 1]! +
      (t3 - t2) * h * m[i + 1]!
    );
  };
};

/** 256x1 RGBA data: R/G/B hold each channel's mapping, A holds the master. */
export const buildCurveTexture = (curve: ToneCurve): Uint8Array => {
  const master = buildInterpolator(curve.rgb ?? IDENTITY);
  const red = buildInterpolator(curve.r ?? IDENTITY);
  const green = buildInterpolator(curve.g ?? IDENTITY);
  const blue = buildInterpolator(curve.b ?? IDENTITY);

  const data = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i += 1) {
    const x = i / 255;
    // The master is composed with each channel so a single RGB curve still
    // affects all three without the shader needing a second lookup.
    const encode = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
    data[i * 4 + 0] = encode(master(red(x)));
    data[i * 4 + 1] = encode(master(green(x)));
    data[i * 4 + 2] = encode(master(blue(x)));
    data[i * 4 + 3] = encode(master(x));
  }
  return data;
};

export const isIdentityCurve = (curve: ToneCurve | undefined): boolean =>
  !(curve && (curve.rgb || curve.r || curve.g || curve.b));

// ── 3D LUT ────────────────────────────────────────────────────────────────────

/** Largest cube accepted; a 64³ table is already 786kB of texture. */
const MAX_LUT_SIZE = 64;

// Hoisted out of the parse loop: these run once per line of a .cube file, which
// is up to 262,144 lines for a 64³ table.
const CUBE_COMMENT = /^#/;
const CUBE_TITLE = /^TITLE/i;
const CUBE_1D_SIZE = /^LUT_1D_SIZE/i;
const CUBE_3D_SIZE = /^LUT_3D_SIZE/i;
const CUBE_DOMAIN_MIN = /^DOMAIN_MIN/i;
const CUBE_DOMAIN_MAX = /^DOMAIN_MAX/i;
const CUBE_WHITESPACE = /\s+/;
const CUBE_LINE_BREAK = /\r?\n/;

export interface Lut {
  /** RGBA bytes laid out as `size` tiles across, each `size` x `size`. */
  data: Uint8Array;
  /** Edge length of the cube, e.g. 32. */
  size: number;
}

/** What a .cube file declares, before validation. */
type CubeScan = {
  size: number;
  values: number[];
  domainMin: number[];
  domainMax: number[];
  /** Set when the file declares itself 1D, which this cannot represent. */
  is1d: boolean;
};

/** Reads the header directives and the RGB triplets. Performs no validation. */
const scanCube = (text: string): CubeScan => {
  const scan: CubeScan = {
    domainMax: [1, 1, 1],
    domainMin: [0, 0, 0],
    is1d: false,
    size: 0,
    values: [],
  };

  for (const raw of text.split(CUBE_LINE_BREAK)) {
    const line = raw.trim();
    if (!line || CUBE_COMMENT.test(line) || CUBE_TITLE.test(line)) {
      continue;
    }
    if (CUBE_1D_SIZE.test(line)) {
      scan.is1d = true;
      return scan;
    }
    if (CUBE_3D_SIZE.test(line)) {
      scan.size = Number.parseInt(line.split(CUBE_WHITESPACE)[1] ?? "", 10);
      continue;
    }
    if (CUBE_DOMAIN_MIN.test(line)) {
      scan.domainMin = line.split(CUBE_WHITESPACE).slice(1, 4).map(Number);
      continue;
    }
    if (CUBE_DOMAIN_MAX.test(line)) {
      scan.domainMax = line.split(CUBE_WHITESPACE).slice(1, 4).map(Number);
      continue;
    }

    const parts = line.split(CUBE_WHITESPACE).map(Number);
    if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) {
      scan.values.push(parts[0]!, parts[1]!, parts[2]!);
    }
  }

  return scan;
};

/** Returns the reason a scan cannot become a LUT, or null when it can. */
const validateCube = (scan: CubeScan): string | null => {
  if (scan.is1d) {
    return "This is a 1D LUT. Only 3D .cube files are supported.";
  }
  if (!scan.size || scan.size < 2) {
    return "No LUT_3D_SIZE found in this file.";
  }
  // A 64³ table is 786kB of texture; beyond that the gain is imperceptible.
  if (scan.size > MAX_LUT_SIZE) {
    return `LUT size ${scan.size} is too large (max ${MAX_LUT_SIZE}).`;
  }
  const expected = scan.size ** 3 * 3;
  if (scan.values.length !== expected) {
    return `Expected ${expected / 3} entries for a ${scan.size}³ LUT, found ${scan.values.length / 3}.`;
  }
  return null;
};

/**
 * Repacks the scanned triplets into the Hald layout the shader samples.
 *
 * .cube iterates red fastest then green then blue; Hald lays the blue slices
 * left to right, so the shader can address one with a horizontal offset.
 */
const packHaldLut = (scan: CubeScan): Lut => {
  const { size, values, domainMin, domainMax } = scan;
  const data = new Uint8Array(size ** 3 * 4);
  const span = [
    domainMax[0]! - domainMin[0]!,
    domainMax[1]! - domainMin[1]!,
    domainMax[2]! - domainMin[2]!,
  ];

  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        const src = (b * size * size + g * size + r) * 3;
        const dst = (g * size * size + (b * size + r)) * 4;
        for (let c = 0; c < 3; c += 1) {
          const norm =
            span[c] === 0 ? 0 : (values[src + c]! - domainMin[c]!) / span[c]!;
          data[dst + c] = Math.round(Math.min(1, Math.max(0, norm)) * 255);
        }
        data[dst + 3] = 255;
      }
    }
  }

  return { data, size };
};

/**
 * Parses an Adobe .cube file into a Hald layout the shader can sample.
 *
 * Supports LUT_3D_SIZE with RGB triplets, the format every grading tool
 * exports. 1D cubes are rejected rather than silently misread as 3D.
 */
export const parseCubeLut = (
  text: string
): { lut: Lut } | { error: string } => {
  const scan = scanCube(text);
  const error = validateCube(scan);
  return error ? { error } : { lut: packHaldLut(scan) };
};
