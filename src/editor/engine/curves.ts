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
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1]! - xs[i]!;
    delta.push(dx === 0 ? 0 : (ys[i + 1]! - ys[i]!) / dx);
  }

  // Tangents, then the Fritsch–Carlson clamp that guarantees monotonicity.
  const m: number[] = [delta[0] ?? 0];
  for (let i = 1; i < n - 1; i++) {
    const d0 = delta[i - 1]!;
    const d1 = delta[i]!;
    m.push(d0 * d1 <= 0 ? 0 : (d0 + d1) / 2);
  }
  m.push(delta[n - 2] ?? 0);

  for (let i = 0; i < n - 1; i++) {
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
    for (let j = 0; j < n - 1; j++) {
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
  for (let i = 0; i < 256; i++) {
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

export interface Lut {
  /** RGBA bytes laid out as `size` tiles across, each `size` x `size`. */
  data: Uint8Array;
  /** Edge length of the cube, e.g. 32. */
  size: number;
}

/**
 * Parses an Adobe .cube file into a Hald layout the shader can sample.
 *
 * Supports LUT_3D_SIZE with RGB triplets, the format every grading tool
 * exports. 1D cubes are rejected rather than silently misread as 3D.
 */
export const parseCubeLut = (
  text: string
): { lut: Lut } | { error: string } => {
  const lines = text.split(/\r?\n/);
  let size = 0;
  const values: number[] = [];
  let domainMin = [0, 0, 0];
  let domainMax = [1, 1, 1];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    if (/^TITLE/i.test(line)) {
      continue;
    }
    if (/^LUT_1D_SIZE/i.test(line)) {
      return { error: "This is a 1D LUT. Only 3D .cube files are supported." };
    }
    if (/^LUT_3D_SIZE/i.test(line)) {
      size = Number.parseInt(line.split(/\s+/)[1] ?? "", 10);
      continue;
    }
    if (/^DOMAIN_MIN/i.test(line)) {
      domainMin = line.split(/\s+/).slice(1, 4).map(Number);
      continue;
    }
    if (/^DOMAIN_MAX/i.test(line)) {
      domainMax = line.split(/\s+/).slice(1, 4).map(Number);
      continue;
    }

    const parts = line.split(/\s+/).map(Number);
    if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) {
      values.push(parts[0]!, parts[1]!, parts[2]!);
    }
  }

  if (!size || size < 2) {
    return { error: "No LUT_3D_SIZE found in this file." };
  }
  const expected = size * size * size * 3;
  if (values.length !== expected) {
    return {
      error: `Expected ${expected / 3} entries for a ${size}³ LUT, found ${values.length / 3}.`,
    };
  }
  // A 64³ table is 786kB of texture; beyond that the gain is imperceptible.
  if (size > 64) {
    return { error: `LUT size ${size} is too large (max 64).` };
  }

  // .cube iterates red fastest, then green, then blue.
  const data = new Uint8Array(size * size * size * 4);
  const span = [
    domainMax[0]! - domainMin[0]!,
    domainMax[1]! - domainMin[1]!,
    domainMax[2]! - domainMin[2]!,
  ];

  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const src = (b * size * size + g * size + r) * 3;
        // Hald layout: tiles laid left to right by blue, so the shader can
        // address a slice with a single horizontal offset.
        const x = b * size + r;
        const dst = (g * size * size + x) * 4;
        for (let c = 0; c < 3; c++) {
          const norm =
            span[c] === 0 ? 0 : (values[src + c]! - domainMin[c]!) / span[c]!;
          data[dst + c] = Math.round(Math.min(1, Math.max(0, norm)) * 255);
        }
        data[dst + 3] = 255;
      }
    }
  }

  return { lut: { data, size } };
};
