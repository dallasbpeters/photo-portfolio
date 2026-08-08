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
/** One span between adjacent control points, with its Hermite tangents. */
interface Segment {
  /** x1 - x0. */
  h: number;
  m0: number;
  m1: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Builds the spans and their tangents.
 *
 * Works on pairs rather than indices so every value is obtained by
 * destructuring a known element — the previous version needed a non-null
 * assertion on each of a dozen array reads, which asserts away exactly the
 * mistake this is most likely to contain.
 */
/** Adjacent control points with the secant slope between them. */
interface Pair {
  a: CurvePoint;
  b: CurvePoint;
  delta: number;
}

/** Pairs each control point with the next, skipping any gap in the input. */
const buildPairs = (pts: CurvePoint[]): Pair[] => {
  const pairs: Pair[] = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!(a && b)) {
      continue;
    }
    const dx = b.x - a.x;
    pairs.push({ a, b, delta: dx === 0 ? 0 : (b.y - a.y) / dx });
  }
  return pairs;
};

/**
 * Tangent at each control point: the average of the slopes either side,
 * flattened wherever the direction reverses.
 */
const rawTangents = (pairs: Pair[], first: Pair, last: Pair): number[] => {
  const tangents: number[] = [first.delta];
  for (let i = 1; i < pairs.length; i += 1) {
    const prev = pairs[i - 1];
    const next = pairs[i];
    if (!(prev && next)) {
      continue;
    }
    const reverses = prev.delta * next.delta <= 0;
    tangents.push(reverses ? 0 : (prev.delta + next.delta) / 2);
  }
  tangents.push(last.delta);
  return tangents;
};

/**
 * Fritsch–Carlson clamp: pull each tangent pair inside the circle of radius 3,
 * which is the condition that guarantees the curve cannot overshoot.
 */
const clampTangents = (pairs: Pair[], tangents: number[]): void => {
  for (let i = 0; i < pairs.length; i += 1) {
    const pair = pairs[i];
    const t0 = tangents[i];
    const t1 = tangents[i + 1];
    if (!pair || t0 === undefined || t1 === undefined) {
      continue;
    }
    if (pair.delta === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = t0 / pair.delta;
    const b = t1 / pair.delta;
    const hyp = Math.hypot(a, b);
    if (hyp > 3) {
      const scale = 3 / hyp;
      tangents[i] = scale * a * pair.delta;
      tangents[i + 1] = scale * b * pair.delta;
    }
  }
};

/** Builds the spans and their tangents. */
const buildSegments = (pts: CurvePoint[]): Segment[] => {
  const pairs = buildPairs(pts);
  const [first] = pairs;
  const last = pairs.at(-1);
  if (!(first && last)) {
    return [];
  }

  const tangents = rawTangents(pairs, first, last);
  clampTangents(pairs, tangents);

  return pairs.flatMap((pair, i) => {
    const m0 = tangents[i];
    const m1 = tangents[i + 1];
    if (m0 === undefined || m1 === undefined) {
      return [];
    }
    return [
      {
        h: pair.b.x - pair.a.x,
        m0,
        m1,
        x0: pair.a.x,
        x1: pair.b.x,
        y0: pair.a.y,
        y1: pair.b.y,
      },
    ];
  });
};

const buildInterpolator = (points: CurvePoint[]): ((x: number) => number) => {
  const pts = [...points].sort((a, b) => a.x - b.x);
  const only = pts.length === 1 ? pts[0] : undefined;
  if (only) {
    return () => only.y;
  }

  const segments = buildSegments(pts);
  const [first] = segments;
  const last = segments.at(-1);
  if (!(first && last)) {
    // No usable span — pass the input through unchanged.
    return (x) => x;
  }

  return (x: number): number => {
    if (x <= first.x0) {
      return first.y0;
    }
    if (x >= last.x1) {
      return last.y1;
    }

    const segment = segments.find((s) => x < s.x1) ?? last;
    const t = segment.h === 0 ? 0 : (x - segment.x0) / segment.h;
    const t2 = t * t;
    const t3 = t2 * t;

    // Hermite basis.
    return (
      (2 * t3 - 3 * t2 + 1) * segment.y0 +
      (t3 - 2 * t2 + t) * segment.h * segment.m0 +
      (-2 * t3 + 3 * t2) * segment.y1 +
      (t3 - t2) * segment.h * segment.m1
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
interface CubeScan {
  domainMax: number[];
  domainMin: number[];
  /** Set when the file declares itself 1D, which this cannot represent. */
  is1d: boolean;
  size: number;
  values: number[];
}

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

    const [r, g, b] = line.split(CUBE_WHITESPACE).map(Number);
    if ([r, g, b].every((n) => n !== undefined && Number.isFinite(n))) {
      scan.values.push(r as number, g as number, b as number);
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
  // A file may declare fewer than three domain components; default to the
  // full 0–1 range rather than asserting they are present.
  const minAt = (c: number) => domainMin[c] ?? 0;
  const maxAt = (c: number) => domainMax[c] ?? 1;
  const span = [0, 1, 2].map((c) => maxAt(c) - minAt(c));

  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        const src = (b * size * size + g * size + r) * 3;
        const dst = (g * size * size + (b * size + r)) * 4;
        for (let c = 0; c < 3; c += 1) {
          const width = span[c] ?? 1;
          const raw = values[src + c] ?? 0;
          const norm = width === 0 ? 0 : (raw - minAt(c)) / width;
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
