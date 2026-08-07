/**
 * GLSL for the photo pipeline.
 *
 * WebGL1 / GLSL ES 1.00 for maximum device coverage — nothing here needs WebGL2,
 * and WebGL1 works on every browser the admin is likely to be opened in.
 *
 * Rendering is three passes:
 *   1. horizontal gaussian  →  half-res texture
 *   2. vertical gaussian    →  the blur used by clarity, halation and denoise
 *   3. grade                →  the full pipeline, sampling original + blur
 *
 * Keeping the blur at half resolution costs nothing visually for these effects
 * and keeps large images interactive while a slider is being dragged.
 */

export const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;

void main() {
  // aPosition is a fullscreen quad in clip space; derive UV from it.
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/** Separable gaussian. uDirection is (1,0) horizontally then (0,1) vertically. */
export const BLUR_SHADER = `
precision highp float;

uniform sampler2D uImage;
uniform vec2 uTexel;
uniform vec2 uDirection;
uniform float uRadius;

varying vec2 vUv;

void main() {
  // 9-tap gaussian; weights sum to 1.
  float weights[5];
  weights[0] = 0.2270270270;
  weights[1] = 0.1945945946;
  weights[2] = 0.1216216216;
  weights[3] = 0.0540540541;
  weights[4] = 0.0162162162;

  vec4 sum = texture2D(uImage, vUv) * weights[0];
  for (int i = 1; i < 5; i++) {
    vec2 offset = uTexel * uDirection * float(i) * uRadius;
    sum += texture2D(uImage, vUv + offset) * weights[i];
    sum += texture2D(uImage, vUv - offset) * weights[i];
  }
  gl_FragColor = sum;
}
`;

export const GRADE_SHADER = `
precision highp float;

uniform sampler2D uImage;
uniform sampler2D uBlur;
uniform vec2 uResolution;

// Tone
uniform float uExposure;
uniform float uContrast;
uniform float uHighlights;
uniform float uShadows;
uniform float uWhites;
uniform float uBlacks;

// Colour
uniform float uSaturation;
uniform float uTemperature;
uniform float uTint;

// Presence
uniform float uClarity;
uniform float uSharpness;
uniform float uDenoise;

// Film
uniform float uGrain;
uniform float uHalation;
uniform float uFade;
uniform vec3  uSplitShadow;
uniform vec3  uSplitHighlight;
uniform float uSplitBalance;

// Finishing
uniform float uVignette;

uniform float uSeed;

varying vec2 vUv;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float luminance(vec3 c) { return dot(c, LUMA); }

/** Hash-based value noise — deterministic per pixel for a given seed. */
float hash(vec2 p) {
  p = fract(p * vec2(443.8975, 397.2973));
  p += dot(p.xy, p.yx + 19.19);
  return fract(p.x * p.y);
}

/** Soft, non-clipping highlight/shadow recovery weighted by luminance. */
vec3 toneRegions(vec3 c, float highlights, float shadows) {
  float l = luminance(c);
  // Smooth masks so recovery never produces a hard edge at the pivot.
  float hiMask = smoothstep(0.5, 1.0, l);
  float loMask = 1.0 - smoothstep(0.0, 0.5, l);
  c += highlights * hiMask * (1.0 - c) * 0.6;
  c += shadows * loMask * c * 0.9;
  return c;
}

void main() {
  vec3 color = texture2D(uImage, vUv).rgb;
  vec3 blurred = texture2D(uBlur, vUv).rgb;

  // ── White balance ────────────────────────────────────────────────────────
  // Applied first, like a raw pipeline: everything downstream sees corrected
  // colour rather than compounding a cast.
  color.r += uTemperature * 0.12;
  color.b -= uTemperature * 0.12;
  color.g += uTint * 0.10;
  color = clamp(color, 0.0, 1.0);

  // ── Denoise ──────────────────────────────────────────────────────────────
  // Blend toward the blur only where local detail is low, so grain and noise
  // soften but edges survive.
  if (uDenoise > 0.0) {
    float detail = abs(luminance(color) - luminance(blurred));
    // Named flatness, not flat: flat is a reserved word in GLSL.
    float flatness = 1.0 - smoothstep(0.0, 0.08, detail);
    color = mix(color, blurred, uDenoise * flatness);
  }

  // ── Exposure ─────────────────────────────────────────────────────────────
  color *= pow(2.0, uExposure * 2.0);

  // ── Highlights / shadows ─────────────────────────────────────────────────
  color = toneRegions(color, uHighlights, uShadows);

  // ── Whites / blacks ──────────────────────────────────────────────────────
  color += uWhites * 0.25 * smoothstep(0.55, 1.0, luminance(color));
  color += uBlacks * 0.25 * (1.0 - smoothstep(0.0, 0.45, luminance(color)));

  // ── Contrast around mid-grey ─────────────────────────────────────────────
  color = (color - 0.5) * (1.0 + uContrast) + 0.5;
  color = clamp(color, 0.0, 1.0);

  // ── Clarity: local contrast against the blurred copy ──────────────────────
  if (uClarity != 0.0) {
    float l = luminance(color);
    float lb = luminance(blurred);
    // Weighted toward midtones so clarity does not crush blacks or blow highlights.
    float mid = 1.0 - abs(l - 0.5) * 2.0;
    color += (l - lb) * uClarity * 1.5 * max(mid, 0.0);
  }

  // ── Sharpen: unsharp mask ────────────────────────────────────────────────
  if (uSharpness > 0.0) {
    color += (color - blurred) * uSharpness * 1.8;
  }

  color = clamp(color, 0.0, 1.0);

  // ── Saturation ───────────────────────────────────────────────────────────
  float l2 = luminance(color);
  color = mix(vec3(l2), color, 1.0 + uSaturation);
  color = clamp(color, 0.0, 1.0);

  // ── Split tone ───────────────────────────────────────────────────────────
  // uSplitBalance shifts the pivot between the two ranges.
  if (uSplitShadow != vec3(0.0) || uSplitHighlight != vec3(0.0)) {
    float l3 = luminance(color);
    float pivot = 0.5 + uSplitBalance * 0.3;
    float hi = smoothstep(pivot - 0.25, pivot + 0.25, l3);
    float lo = 1.0 - hi;
    color += uSplitShadow * lo;
    color += uSplitHighlight * hi;
    color = clamp(color, 0.0, 1.0);
  }

  // ── Halation ─────────────────────────────────────────────────────────────
  // Bloom that only the brightest areas feed, warmed slightly the way film
  // halation reads around highlights.
  if (uHalation > 0.0) {
    vec3 glow = blurred * smoothstep(0.6, 1.0, luminance(blurred));
    glow *= vec3(1.0, 0.72, 0.52);
    color += glow * uHalation * 1.2;
  }

  // ── Fade / matte ─────────────────────────────────────────────────────────
  // Compresses the tonal range upward from the black point, which is what a
  // faded print does: shadows lift, highlights barely move.
  if (uFade > 0.0) {
    float lift = uFade * 0.16;
    color = color * (1.0 - lift) + lift;
  }

  // ── Vignette ─────────────────────────────────────────────────────────────
  if (uVignette != 0.0) {
    vec2 centered = vUv - 0.5;
    // Correct for aspect so the falloff stays circular, not oval.
    centered.x *= uResolution.x / uResolution.y;
    float d = length(centered);
    float v = smoothstep(0.35, 0.85, d);
    color *= 1.0 - v * uVignette;
  }

  // ── Grain ────────────────────────────────────────────────────────────────
  // Scaled by luminance so shadows stay cleaner than midtones, like real film.
  if (uGrain > 0.0) {
    float n = hash(vUv * uResolution * 0.5 + uSeed) - 0.5;
    float shaped = n * uGrain * 0.32;
    shaped *= mix(0.4, 1.0, smoothstep(0.0, 0.5, luminance(color)));
    color += shaped;
  }

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;
