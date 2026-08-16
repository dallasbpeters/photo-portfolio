# Canvas baseline — measured 2026-08-16

What the canvas does today, measured rather than asserted, so Wave 0's claims
can be checked against a number instead of a feeling.

Everything here was taken by observation. No application source file was
edited, no board or item was created, changed or deleted, and nothing was
committed. The two instrumented numbers (React render counts) were obtained by
rewriting the JavaScript **as the browser received it**, not on disk — see
[Method](#method).

---

## Verdict in one line

Panning a 500-item board today produces **≈500 React re-renders of
`BoardItemView` per input event** — about **26,500 item re-renders in a
one-second pan** — against an acceptance criterion of zero. But on this
machine those re-renders do **not** currently drop frames in a production
build; what they cost is headroom and input latency, not visible jank.

---

## Conditions

| | |
|---|---|
| Machine | Apple M4 Max, macOS 26.6.1 |
| Browser | Chromium 151.0.7922.34 (Playwright 1.62.1, the devDependency already installed) |
| Viewport | 1440 × 900, `deviceScaleFactor: 1` |
| Dev server | `pnpm dev:dallas-images` → http://localhost:3006 (vercel dev + Vite, React **development** build, `<StrictMode>` on) |
| Production build | `vite build` to a scratchpad dir, served by a throwaway static server on :3999 with `/api` proxied to :3006 |
| Board | `/board/rolemodel-stickers` — the public, read-only `BoardViewPage`, whose `onChange` is `() => undefined` |
| Database | `ep-royal-field-awz7f3lw-pooler...neon.tech/neondb` (the live one) — read only |
| Date | 2026-08-16 |
| Repo state | branch `feat/canvas-wave-0` at `f72f493` plus other agents' in-flight Wave 0 extraction files |

### The 500-item board does not exist

The whole database contains **four** boards. Largest first:

| Board | Slug | Public | Items |
|---|---|---|---|
| RoleModel Stickers | `rolemodel-stickers` | yes | **31** |
| Cruise Shirts | `cruise-shirts` | yes | 29 |
| Logo Ideas | `logo-ideas` | no | 17 |
| T-Shirts | — | no | 10 |

There is no 500-item board and no way to reach one without writing to the live
database, which was out of bounds. So the 500- and 2000-item figures below are
**synthetic**: the browser's `GET /api/boards/<slug>` response was intercepted
and its 31 real items tiled into a grid until the list reached the target
count. The clones keep the real items' geometry, kind and image URLs, so the
component tree, the props and the images are the real thing — only the
quantity is invented. Nothing was written anywhere; the server and the database
never saw the inflated list.

Read the 31-item rows as measurement of reality, and the 500/2000 rows as
measurement of a plausible future.

---

## 1. React re-renders during a gesture

The spec's acceptance criterion: *"panning and zooming a 500-item board
produces zero React re-renders of item components during the gesture."*

Counted by wrapping the components at the module boundary (see Method). The
dev server runs under `<StrictMode>`, which invokes every component function
**twice** per commit, so both numbers are given: raw invocations, and the
commit-equivalent (raw ÷ 2) which is what production would do.

**Dev build, one-second gesture:**

| Board | Gesture | Input events | Viewport commits | `BoardCanvas` calls (renders) | `BoardItemView` calls (renders) |
|---|---|---:|---:|---:|---:|
| 31 real | pan | 73 | 71 | 148 (74) | **4,588 (2,294)** |
| 31 real | zoom | 41 | 40 | 80 (40) | **2,480 (1,240)** |
| 500 cloned | pan | 52 | 50 | 106 (53) | **53,000 (26,500)** |
| 500 cloned | zoom | 38 | 37 | 74 (37) | **37,000 (18,500)** |

The relationship is exact, not approximate:

```
BoardItemView invocations  =  BoardCanvas invocations × item count
53,000 = 106 × 500        4,588 = 148 × 31        37,000 = 74 × 500
```

and `BoardCanvas` renders once per `pointermove` / `wheel` event, ±1 for
`pointerdown`/`pointerup` flipping `isPanning`. So:

- **Every item component re-renders on every input event of a pan or zoom.**
- No item is ever skipped. There is no bailout, no memo, no culling.

In production (no StrictMode) the count per commit is identical, and the input
rate is higher because each commit is cheaper: the production run at 500 items
delivered **70 viewport commits per second of pan**, i.e. **≈35,000
`BoardItemView` renders per second**.

Measured against "zero", the criterion fails by five orders of magnitude.

### Why `React.memo` alone would not fix it

`BoardItemView` is a plain function component (`src/boards/BoardItemView.tsx:699`
— no `memo`). Even wrapped in `memo` it would still re-render every frame,
because `BoardCanvas.tsx:1319-1383` hands every item a fresh object identity on
every render: `onDelete`, `onEditBody`, `onFontSize`, `onSelect`, `onBeginEdit`,
`ports`, and — decisively — `scale={view.viewport.scale}`, a value that changes
on every zoom frame by definition. The viewport moving out of React state is
the prerequisite; memoisation is the follow-on.

Confirmed in source, as the spec states:

- `src/boards/useCanvasViewport.ts:172` — `useState<Viewport>`; `:449` writes it
  from `onPointerMove`; `:382` writes it from the wheel handler.
- `src/boards/BoardCanvas.tsx:358` — `useState<number[]>` selection, by index.
- `src/boards/BoardCanvas.tsx:360` — marquee rect in state, written per move.
- `src/boards/BoardCanvas.tsx:437` — stroke points in state, same.
- `src/boards/BoardCanvas.tsx:1243` — the transform is a template string in JSX,
  so moving the board *is* a React commit.

---

## 2. Frame timing

`requestAnimationFrame` deltas, `PerformanceObserver({entryTypes:['longtask']})`
(supported; it reported entries when there were any), and a
`MutationObserver` on the board layer's `style` measuring **input → committed
transform** latency. One second per gesture, plus a one-second no-input control.

### Production build, unthrottled CPU

| Items | Gesture | Commits/s | input→transform med / p95 / max (ms) | rAF fps | frames >20ms | frames >33ms | long tasks | CPU busy in the 1 s window |
|---:|---|---:|---|---:|---:|---:|---:|---|
| 31 | idle | 0 | — | 120.0 | 0 | 0 | 0 | — |
| 31 | pan | 87 | **0.4 / 0.7 / 17.0** | 120.9 | 0 | 0 | 0 | 75 ms / 1131 ms |
| 31 | zoom | 40 | 0.3 / 0.5 / 17.4 | 118.5 | 0 | 0 | 0 | 52 ms / 1056 ms |
| 500 | pan | 68 | **1.4 / 2.0 / 34.3** | 120.1 | 0 | 0 | 0 | 183 ms / 1135 ms |
| 500 | zoom | 39 | 1.2 / 1.6 / 17.7 | 117.0 | 1 | 0 | 0 | 118 ms / 1037 ms |
| 2000 | pan | 59 | **4.4 / 5.4 / 53.3** | 118.1 | 0 | 0 | 0 | 468 ms / 1182 ms |
| 2000 | zoom | 40 | 4.8 / 5.3 / 20.7 | 117.1 | 1 | 0 | 0 | 340 ms / 1057 ms |

### Production build, CPU throttled (a stand-in for a slower machine)

| Items | Throttle | Gesture | input→transform med / p95 / max (ms) | frames >20ms | frames >33ms | CPU busy |
|---:|---:|---|---|---:|---:|---|
| 31 | 4× | pan | — | 0 | 0 | 433 ms / 1455 ms |
| 500 | 4× | pan | — | 1 | 0 | 774 ms / 1466 ms |
| 31 | 6× | pan | — | 0 | 0 | 625 ms / 1678 ms |
| 500 | 6× | pan | **9.8 / 13.7 / 90.0** | 1 | 1 | **1090 ms / 1682 ms (65 %)** |

At 6× throttle with 500 items the harness could only get 40 pointer moves
delivered in a second instead of ~70 — the main thread was too busy to take
input at full rate. That is the first configuration measured where a user
would notice.

### Dev build (what you actually work in)

| Items | Gesture | Commits/s | input→transform med / p95 / max (ms) | rAF fps | >20ms | >33ms | long tasks | CPU busy |
|---:|---|---:|---|---:|---:|---:|---:|---|
| 31 | pan | 71 | 1.0 / 3.4 / 28.3 | 119.1 | 0 | 0 | 0 | 205 ms / 1187 ms |
| 31 | zoom | 40 | 2.9 / 3.2 / 19.7 | 118.1 | 0 | 0 | 0 | 139 ms / 1067 ms |
| 500 | pan | 50 | **8.1 / 33.0 / 125.7** | 111.1 | **3** | **2** | **1 × 55 ms** | **907 ms / 1309 ms (69 %)** |
| 500 | zoom | 37 | 8.0 / 35.2 / 60.8 | 113.1 | 2 | 1 | 0 | 616 ms / 1119 ms |

The dev build is **≈6× more expensive per viewport update** than production
(18.1 ms vs 2.9 ms at 500 items). Anyone benchmarking Wave 0 against the dev
server will measure a much larger win than users get. Take before/after numbers
from a production build.

### Headless vs headed

A headed run of the same production 500-item pan, on the real display:
60.1 fps (the display is 60 Hz; headless Chromium free-runs at a 120 Hz
cadence), 0 frames over 20 ms, input→transform median 1.5 ms, CPU busy
172 ms/1123 ms. Busy time and latency agree with headless within noise, so
headless is fine for CPU and latency numbers — but its `fps` figure is a
cadence, not the user's frame rate.

---

## 3. Where the time actually goes

CDP `Profiler` at a 100 µs sampling interval, over the same one-second pan.

**Dev build, 500 items, pan** — 836 ms busy of 1299 ms, 35.6 % idle:

| Self time | ms | % of busy |
|---|---:|---:|
| `jsxDEV` + `jsxDEVImpl` (react/jsx-dev-runtime) | 298 | 35.7 |
| `(program)` — style, layout, paint, non-JS | 89 | 10.6 |
| `addObjectDiffToProperties` (react-dom) | 52 | 6.2 |
| `(garbage collector)` | 31 | 3.7 |
| **`BoardItemView` body itself** | **29** | **3.5** |
| `logComponentRender`, `validateProperty`, `warnUnknownProperties`, `runWithFiberInDEV` (react-dom, dev-only) | 65 | 7.8 |
| `updateProperties` + `commitUpdate` (react-dom, real DOM writes) | 24 | 2.9 |

Inclusive: `react-dom` 710 ms, `BoardItemView` 118 ms, `BoardCanvas` 111 ms.

The item components' own logic is a rounding error. The cost is React creating
and diffing ~26,500 elements per second.

### The decisive control: move the same DOM without React

The board layer's `style.transform` was written directly from a `rAF` loop —
same 501 (or 2001) DOM nodes, same compositing, same repaints, zero React
involvement:

| Items | Build | Path | Viewport updates | CPU busy | **ms per viewport update** |
|---:|---|---|---:|---:|---:|
| 500 | prod | React pan | 70 | 202 ms | **2.9** |
| 500 | prod | direct `style.transform` | 121 | 65 ms | **0.53** |
| 2000 | prod | React pan | 60 | 491 ms | **8.2** |
| 2000 | prod | direct `style.transform` | 121 | 151 ms | **1.25** |
| 31 | dev | React pan | 71 | 205 ms | **2.9** |
| 31 | dev | direct `style.transform` | 121 | 24 ms | **0.20** |
| 500 | dev | React pan | 50 | 907 ms | **18.1** |
| 500 | dev | direct `style.transform` | 122 | 60 ms | **0.49** |

**React costs 5.5× the DOM in production and 37× the DOM in development.**
Moving 500 items by writing one transform is a half-millisecond operation, and
its cost is the same in both builds — as it must be, since it is browser work,
not React work.

> **This confirms the spec's diagnosis.** The problem is React re-rendering
> from viewport state, not the DOM. The evidence does not contradict it.

---

## 4. How item count affects it

Production build, unthrottled, per viewport update during a pan:

| Items | ms/update (React) | ms/update (direct DOM) | input→transform median |
|---:|---:|---:|---:|
| 31 | 0.9 | — | 0.4 ms |
| 500 | 2.9 | 0.53 | 1.4 ms |
| 2000 | 8.2 | 1.25 | 4.4 ms |

Roughly linear in item count, ~3.8 µs per item per viewport update in
production, ~36 µs in dev. Extrapolating the production line, a 60 Hz frame
budget (16.7 ms) is consumed entirely by React at around **4,300 items** on
this machine — or, at 6× less CPU, around **700**.

### A caveat about culling

At 500 synthetic items the viewport's auto-framing clamps at `MIN_SCALE`
(0.05), and **491 of 501 items are inside the viewport**. At 2000 items, 637 of
2001 are. So in the "fit the whole board" state that opening a board lands in,
viewport culling removes almost nothing — its payoff is when zoomed in on part
of a large board, not on load. Do not expect culling to move these particular
numbers.

---

## 5. What is *not* wrong today

Recorded deliberately, because a baseline that only lists problems is a
sales pitch:

- On the real boards that exist (31 items, 29 items), there is nothing
  measurably wrong. Zero dropped frames, zero long tasks, 0.4 ms input
  latency in production, 7 % CPU during a pan.
- Even at a synthetic 500 items the production build sustains the display's
  refresh rate with **zero** frames over 20 ms and no long tasks.
- Even at 2000 items, production drops no frames on this machine.
- The only measured configurations that produce dropped frames are the **dev
  build at 500 items** (3 frames >20 ms, 2 >33 ms, one 55 ms long task) and
  **production at 500 items with a 6× CPU handicap** (1 frame >33 ms).

So the honest case for Wave 0 is not "panning is janky" — on this hardware,
with these boards, it is not. It is that a pan burns 20 % of a second's CPU at
500 items (65 % on a slower machine) doing work with no output, that input
latency grows linearly with board size, and that a screen-anchored contextual
bar cannot be built on top of a component tree that re-renders wholesale every
frame. Wave 0's win should be claimed and measured in **re-render count, CPU
busy time and input→transform latency**, not in frame rate — the frame-rate
claim is unfalsifiable on this machine.

---

## Method

### What was intercepted, and why nothing was edited

The only two numbers that could not be read from outside the app are the render
counts. Rather than editing `BoardCanvas.tsx` or `BoardItemView.tsx` (forbidden
by the wave's rules, and by this task), the Vite dev server's *response* for a
module was rewritten in flight by Playwright, turning

```js
import { BoardItemView } from "/src/boards/BoardItemView.tsx";
```

into

```js
import { BoardItemView as __orig_BoardItemView } from "/src/boards/BoardItemView.tsx";
const BoardItemView = (p) => {
  const c = (globalThis.__rc ||= {});
  c.BoardItemView = (c.BoardItemView || 0) + 1;
  return __orig_BoardItemView(p);
};
```

and the same for `BoardCanvas` inside `BoardViewPage.tsx`. The files on disk
were never touched. **No temporary local edit was made, and therefore none
needed reverting.**

Cross-check that the wrapping did not invent the result: the uninstrumented
production runs count the same thing from the outside, via a `MutationObserver`
on the board layer's `style` attribute. Transform writes per second (68–70 at
500 items) match input events one-for-one, and `BoardItemView` invocations
equal `BoardCanvas` invocations × item count exactly. Instrumented and
uninstrumented runs agree on CPU busy time within ~8 %.

### Read-only guarantees

- All measurement used `/board/<slug>`, the published-board page, where
  `BoardViewPage` passes `onChange={() => undefined}`.
- The route interception only rewrote **GET** responses; every other method was
  passed through untouched, and none were issued.
- Board and item counts were checked in the database before and after: all four
  boards unchanged, `rolemodel-stickers` still 31 items.
- **Unrelated observation:** a fifth board, "Untitled board" with 0 items, was
  created at 19:19:15 UTC during the measurement window by user
  `e15747b1-…`. It was not created by this work — `POST /api/boards` requires an
  admin bearer token, and these browser sessions were unauthenticated and only
  ever issued GETs against the public page. It appears to coincide with other
  work on this machine.

### Reproducing

```bash
# 1. dev server (prints which database it uses — it is the live one)
pnpm dev:dallas-images                      # http://localhost:3006

# 2. production build, into a scratch dir so the repo's dist/ is untouched
VITE_SITE=dallas-images npx vite build --outDir /tmp/canvas-baseline/prodbuild --emptyOutDir
node /tmp/canvas-baseline/serve-prod.mjs    # :3999, static + /api proxy to :3006

# 3. runs
node measure.mjs                                     # dev, real 31-item board
COUNTS=1 node measure.mjs                            # + render counts
TARGET_ITEMS=500 COUNTS=1 node measure.mjs           # dev, 500 synthetic items
BASE=http://localhost:3999 PROFILE=1 TARGET_ITEMS=500 node measure.mjs
BASE=http://localhost:3999 PROFILE=1 THROTTLE=6 TARGET_ITEMS=500 node measure.mjs
BASE=http://localhost:3999 PROFILE=1 TARGET_ITEMS=2000 node measure.mjs
HEADED=1 BASE=http://localhost:3999 PROFILE=1 TARGET_ITEMS=500 node measure.mjs
```

Every run does the same five things in order: a 1 s no-input control, a 1 s
pan, a 1 s direct-`transform` control, a 1 s zoom, each with a CPU profile.
The pan presses on empty board background at 25 % / 80 % of the canvas area and
traces a sine-modulated drag; the zoom sends `wheel` deltas of −40 at the
canvas centre.

<details>
<summary><code>measure.mjs</code> — the whole harness (lived outside the repo)</summary>

```js
/**
 * Canvas baseline measurement. Read-only: never POSTs/PUTs/DELETEs anything.
 *
 * Env:
 *   BASE=<origin>      default http://localhost:3006
 *   SLUG=<board slug>  default rolemodel-stickers
 *   TARGET_ITEMS=<n>   clone the board's items client-side to n (0 = real board)
 *   COUNTS=1           wrap BoardCanvas/BoardItemView to count React renders
 *   PROFILE=1          take CDP CPU profiles
 *   THROTTLE=<n>       Emulation.setCPUThrottlingRate
 *   HEADED=1           run headed
 *   OUT=<path>         write JSON result here
 */
import fs from "node:fs";
import pw from "<repo>/node_modules/playwright/index.js";

const { chromium } = pw;

const BASE = process.env.BASE || "http://localhost:3006";
const SLUG = process.env.SLUG || "rolemodel-stickers";
const TARGET = Number(process.env.TARGET_ITEMS || 0);
const COUNTS = process.env.COUNTS === "1";
const PROFILE = process.env.PROFILE === "1";
const HEADED = process.env.HEADED === "1";
const OUT = process.env.OUT || "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  args: ["--force-device-scale-factor=1"],
  headless: !HEADED,
});
const ctx = await browser.newContext({
  deviceScaleFactor: 1,
  viewport: { height: 900, width: 1440 },
});
const page = await ctx.newPage();

/* ---------- 1. Inflate the item list, client-side only ---------- */
if (TARGET > 0) {
  await page.route(`**/api/boards/${SLUG}*`, async (route) => {
    if (route.request().method() !== "GET") {
      return route.continue();
    }
    const res = await route.fetch();
    const json = await res.json();
    const src = json.items || [];
    if (src.length === 0) {
      return route.fulfill({ response: res });
    }
    const minX = Math.min(...src.map((i) => i.x));
    const minY = Math.min(...src.map((i) => i.y));
    const maxX = Math.max(...src.map((i) => i.x + i.width));
    const maxY = Math.max(...src.map((i) => i.y + i.height));
    const bw = maxX - minX + 200;
    const bh = maxY - minY + 200;
    const cols = Math.ceil(Math.sqrt(TARGET / src.length));
    const out = [];
    for (let tile = 0; out.length < TARGET; tile++) {
      const cx = tile % cols;
      const cy = Math.floor(tile / cols);
      for (const item of src) {
        if (out.length >= TARGET) {
          break;
        }
        out.push({
          ...item,
          id: `${item.id}-c${tile}`,
          x: item.x + cx * bw,
          y: item.y + cy * bh,
        });
      }
    }
    json.items = out;
    json.wires = []; // wires reference original ids only
    await route.fulfill({
      body: JSON.stringify(json),
      contentType: "application/json",
      status: 200,
    });
  });
}

/* ---------- 2. Wrap components to count renders (dev server only) ---------- */
if (COUNTS) {
  const wrap = async (route, name) => {
    const res = await route.fetch();
    let body = await res.text();
    const re = new RegExp(
      `import\\s*\\{\\s*${name}\\s*\\}\\s*from\\s*("[^"]+"|'[^']+');`
    );
    if (!re.test(body)) {
      throw new Error(`could not find import of ${name}`);
    }
    body = body.replace(
      re,
      (_m, spec) =>
        `import { ${name} as __orig_${name} } from ${spec};\n` +
        `const ${name} = (p) => { const c = (globalThis.__rc ||= {}); ` +
        `c["${name}"] = (c["${name}"] || 0) + 1; return __orig_${name}(p); };\n`
    );
    await route.fulfill({
      body,
      headers: { ...res.headers(), "content-type": "application/javascript" },
      status: 200,
    });
  };
  await page.route("**/src/boards/BoardCanvas.tsx*", (r) =>
    wrap(r, "BoardItemView")
  );
  await page.route("**/src/pages/BoardViewPage.tsx*", (r) =>
    wrap(r, "BoardCanvas")
  );
}

/* ---------- 3. Load ---------- */
const url = `${BASE}/board/${SLUG}`;
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForFunction(
  () => {
    const layer = document.querySelector(
      "div[style*='translate('][style*='scale(']"
    );
    return !!layer && layer.children.length > 1;
  },
  null,
  { timeout: 90_000 }
);
await sleep(8000); // let images load and decode

const renderedCount = await page.evaluate(() => {
  const layer = document.querySelector(
    "div[style*='translate('][style*='scale(']"
  );
  return layer ? layer.children.length : -1;
});

/* ---------- 4. Instrumentation ---------- */
const startMeasure = () =>
  page.evaluate(() => {
    const m = { frames: [], longtasks: [], run: true };
    window.__m = m;
    try {
      m.po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          m.longtasks.push({ dur: e.duration, start: e.startTime });
        }
      });
      m.po.observe({ entryTypes: ["longtask"] });
    } catch {
      m.longtaskUnsupported = true;
    }
    const tick = (t) => {
      m.frames.push(t);
      if (m.run) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);

    // input -> committed transform
    m.latencies = [];
    m.transformWrites = 0;
    m.inputs = 0;
    let pending = null;
    m.onInput = () => {
      m.inputs++;
      if (pending === null) {
        pending = performance.now();
      }
    };
    addEventListener("pointermove", m.onInput, { capture: true });
    addEventListener("wheel", m.onInput, { capture: true, passive: true });
    const layer = document.querySelector(
      "div[style*='translate('][style*='scale(']"
    );
    if (layer) {
      let last = layer.style.transform;
      m.mo = new MutationObserver(() => {
        if (layer.style.transform === last) {
          return;
        }
        last = layer.style.transform;
        m.transformWrites++;
        if (pending !== null) {
          m.latencies.push(performance.now() - pending);
          pending = null;
        }
      });
      m.mo.observe(layer, { attributeFilter: ["style"], attributes: true });
    }
    window.__rcAtStart = JSON.parse(JSON.stringify(globalThis.__rc || {}));
  });

const stopMeasure = () =>
  page.evaluate(() => {
    const m = window.__m;
    m.run = false;
    m.po?.disconnect();
    m.mo?.disconnect();
    removeEventListener("pointermove", m.onInput, { capture: true });
    removeEventListener("wheel", m.onInput, { capture: true });
    const lat = [...m.latencies].sort((a, b) => a - b);
    const lp = (p) =>
      lat.length
        ? +lat[Math.min(lat.length - 1, Math.floor(lat.length * p))].toFixed(2)
        : null;
    const f = m.frames;
    const deltas = [];
    for (let i = 1; i < f.length; i++) {
      deltas.push(f[i] - f[i - 1]);
    }
    deltas.sort((a, b) => a - b);
    const pct = (p) =>
      deltas.length
        ? deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * p))]
        : null;
    const before = window.__rcAtStart || {};
    const after = globalThis.__rc || {};
    const renders = {};
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      renders[k] = (after[k] || 0) - (before[k] || 0);
    }
    const span = f.length ? f.at(-1) - f[0] : 0;
    return {
      fps: span > 0 ? +((f.length - 1) / (span / 1000)).toFixed(1) : null,
      frameDeltaMedianMs: pct(0.5) && +pct(0.5).toFixed(2),
      frameDeltaP95Ms: pct(0.95) && +pct(0.95).toFixed(2),
      frameDeltaMaxMs: deltas.length ? +deltas.at(-1).toFixed(2) : null,
      framesOver20ms: deltas.filter((d) => d > 20).length,
      framesOver33ms: deltas.filter((d) => d > 33).length,
      inputEvents: m.inputs,
      inputToTransformMedianMs: lp(0.5),
      inputToTransformP95Ms: lp(0.95),
      inputToTransformMaxMs: lat.length ? +lat.at(-1).toFixed(2) : null,
      longtaskCount: m.longtasks.length,
      longtaskMaxMs: +Math.max(0, ...m.longtasks.map((l) => l.dur)).toFixed(1),
      longtaskUnsupported: !!m.longtaskUnsupported,
      renders,
      spanMs: +span.toFixed(1),
      transformWrites: m.transformWrites,
    };
  });

/* ---------- 5. Gestures ---------- */
const box = await page.evaluate(() => {
  const el = document.querySelector(
    "div[style*='translate('][style*='scale(']"
  )?.parentElement;
  const r = (el || document.body).getBoundingClientRect();
  return { h: r.height, w: r.width, x: r.x, y: r.y };
});

const panOnce = async (ms) => {
  const sx = box.x + box.w * 0.25;
  const sy = box.y + box.h * 0.8;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const p = (Date.now() - t0) / ms;
    await page.mouse.move(sx + Math.sin(p * Math.PI * 2) * 220, sy - p * 160);
    await sleep(6);
  }
  await page.mouse.up();
};

const zoomOnce = async (ms) => {
  await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await page.mouse.wheel(0, -40);
    await sleep(12);
  }
};

const result = { board: SLUG, headless: !HEADED, itemsInDom: renderedCount, url };

const session = await ctx.newCDPSession(page);
if (PROFILE) {
  await session.send("Profiler.enable");
  await session.send("Profiler.setSamplingInterval", { interval: 100 });
}
const THROTTLE = Number(process.env.THROTTLE || 1);
if (THROTTLE > 1) {
  await session.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
}
result.cpuThrottle = THROTTLE;

// how much of the board is on screen
result.viewportState = await page.evaluate(() => {
  const layer = document.querySelector(
    "div[style*='translate('][style*='scale(']"
  );
  const scale = Number(
    /scale\(([^)]+)\)/.exec(layer?.style.transform || "")?.[1] ?? 0
  );
  let visible = 0;
  for (const child of layer ? layer.children : []) {
    const r = child.getBoundingClientRect();
    if (r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight && r.width) {
      visible++;
    }
  }
  return { domChildren: layer ? layer.children.length : 0, scale, visible };
});

const phase = async (name, body) => {
  if (PROFILE) {
    await session.send("Profiler.start");
  }
  await startMeasure();
  await body();
  result[name] = await stopMeasure();
  if (PROFILE) {
    const { profile } = await session.send("Profiler.stop");
    result[`${name}Profile`] = summarise(profile);
  }
};

await phase("idle", () => sleep(1000));
await phase("pan", () => panOnce(1000));
// control: same DOM, same compositing, no React
await phase("directTransform", () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const layer = document.querySelector(
          "div[style*='translate('][style*='scale(']"
        );
        const m = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/.exec(
          layer.style.transform
        );
        const [, tx, ty, sc] = m.map(Number);
        const t0 = performance.now();
        const step = () => {
          const e = performance.now() - t0;
          if (e >= 1000) {
            layer.style.transform = `translate(${tx}px, ${ty}px) scale(${sc})`;
            resolve();
            return;
          }
          layer.style.transform =
            `translate(${tx + Math.sin(e / 100) * 220}px, ${ty - e / 6}px) scale(${sc})`;
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      })
  )
);
await sleep(400);
await phase("zoom", () => zoomOnce(1000));

function summarise(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const selfById = new Map();
  const total = profile.samples.length;
  for (const s of profile.samples) {
    selfById.set(s, (selfById.get(s) || 0) + 1);
  }
  const dur = (profile.endTime - profile.startTime) / 1000;
  const msPerSample = dur / total;
  const agg = new Map();
  let idle = 0;
  for (const [id, n] of selfById) {
    const cf = byId.get(id)?.callFrame || {};
    const name = cf.functionName || "(anonymous)";
    if (name === "(idle)") {
      idle += n;
      continue;
    }
    const key = `${name}|${(cf.url || "").replace(/^https?:\/\/localhost:\d+/, "")}`;
    agg.set(key, (agg.get(key) || 0) + n);
  }
  const busy = total - idle;
  const inclusiveOf = (predicate) => {
    const seen = new Set();
    let sum = 0;
    const walk = (id) => {
      if (seen.has(id)) {
        return;
      }
      seen.add(id);
      sum += selfById.get(id) || 0;
      for (const c of byId.get(id)?.children || []) {
        walk(c);
      }
    };
    for (const r of profile.nodes.filter((n) => predicate(n.callFrame || {}))) {
      walk(r.id);
    }
    return +(sum * msPerSample).toFixed(1);
  };
  return {
    busyMs: +(busy * msPerSample).toFixed(1),
    durationMs: +dur.toFixed(1),
    idlePct: +((idle / total) * 100).toFixed(1),
    inclusiveMs: {
      BoardCanvas: inclusiveOf((cf) => cf.functionName === "BoardCanvas"),
      BoardItemView: inclusiveOf((cf) => cf.functionName === "BoardItemView"),
      reactDom: inclusiveOf((cf) => /react-dom_client/.test(cf.url || "")),
    },
    selfTop: [...agg.entries()]
      .map(([k, n]) => ({
        fn: k.split("|")[0],
        ms: +(n * msPerSample).toFixed(1),
        pctOfBusy: +((n / busy) * 100).toFixed(1),
        url: k.split("|")[1],
      }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 15),
  };
}

const text = JSON.stringify(result, null, 2);
process.stdout.write(`${text}\n`);
if (OUT) {
  fs.writeFileSync(OUT, text);
}
await browser.close();
```

</details>

---

## Targets Wave 0 should be held to

Restating the acceptance criterion in terms this baseline can falsify. Take
all "after" numbers from a **production** build; the dev build inflates the win
sixfold.

| Metric | Today (500 items, production) | Wave 0 target |
|---|---:|---|
| `BoardItemView` renders during a 1 s pan | **≈35,000** | **0** |
| `BoardCanvas` renders during a 1 s pan | ≈70 | 0 |
| CPU busy during a 1 s pan | 183–217 ms | ≤ 70 ms (the direct-transform floor is 65 ms) |
| ms per viewport update | 2.9 | ≤ 0.6 |
| input→transform latency, median / p95 | 1.4 / 2.0 ms | ≤ 0.5 / ≤ 1.0 ms |
| Same, at 6× CPU throttle | 9.8 / 13.7 ms | ≤ 2 / ≤ 4 ms |
| Frames >33 ms during a 1 s pan, dev build | 2 | 0 |

The render-count row is the one that matters and the one that is unambiguous.
The frame-rate rows are already zero on this hardware and cannot be improved;
do not claim them.
