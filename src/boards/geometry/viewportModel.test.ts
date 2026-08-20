import { describe, expect, it } from "vitest";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MAX_SCALE,
  MIN_SCALE,
  START_VIEW_HEIGHT,
  START_VIEW_WIDTH,
} from "../../../config/canvas.js";
import type { Viewport, ViewRect } from "./viewportModel";
import {
  boundsToScreen,
  CONTENT_FRAME_FILL,
  distanceBetween,
  frameBounds,
  frameCanvas,
  IDENTITY_VIEWPORT,
  panBy,
  panTo,
  parseViewport,
  pinchScale,
  sameViewport,
  toCanvas,
  toScreen,
  transformOf,
  visibleBounds,
  zoomAt,
  zoomByAt,
  zoomByAtCentre,
  zoomByWheel,
} from "./viewportModel";

/**
 * A container that is *not* at the page origin — the whole reason `rect` is a
 * parameter. A model that forgets the offset still looks right on a full-bleed
 * canvas and puts every pointer wrong the moment a header exists.
 */
const RECT: ViewRect = { height: 600, left: 40, top: 24, width: 900 };

/** Views deliberately spread across the zoom range, none of them at rest. */
const VIEWS: Viewport[] = [
  { scale: 1, tx: 0, ty: 0 },
  { scale: 0.37, tx: -1204.5, ty: 880 },
  { scale: 2.4, tx: 311, ty: -95.25 },
  { scale: MIN_SCALE, tx: 12, ty: -7 },
  { scale: MAX_SCALE, tx: -3000, ty: -2000 },
];

/** One of the above, for the tests that only need a view that is not at rest. */
const OFFSET_VIEW = VIEWS[1] as Viewport;

/** Client points inside the container, including its exact corners. */
const POINTS: [number, number][] = [
  [RECT.left, RECT.top],
  [RECT.left + RECT.width, RECT.top + RECT.height],
  [RECT.left + 137, RECT.top + 401],
  [RECT.left + RECT.width / 2, RECT.top + RECT.height / 2],
];

/**
 * Tolerance in canvas units, deliberately tight: at MIN_SCALE one screen pixel
 * is 20 canvas units, so a slack epsilon would let visible drift through.
 */
const EPSILON = 1e-9;

const expectClose = (actual: number, expected: number, epsilon = EPSILON) => {
  expect(Math.abs(actual - expected)).toBeLessThan(epsilon);
};

/** The anchoring property, stated once: everything that zooms must hold it. */
const expectAnchorHeld = (
  before: Viewport,
  after: Viewport,
  clientX: number,
  clientY: number
) => {
  const was = toCanvas(before, clientX, clientY, RECT);
  const now = toCanvas(after, clientX, clientY, RECT);
  expectClose(now.x, was.x, 1e-6);
  expectClose(now.y, was.y, 1e-6);
};

describe("toCanvas / toScreen", () => {
  it("subtracts the container's offset from the page", () => {
    const view: Viewport = { scale: 1, tx: 0, ty: 0 };
    // A pointer exactly on the container's top-left corner is canvas 0,0 at an
    // identity view — not (40, 24).
    expect(toCanvas(view, RECT.left, RECT.top, RECT)).toEqual({ x: 0, y: 0 });
  });

  it("divides by the scale and removes the offset", () => {
    const view: Viewport = { scale: 2, tx: 100, ty: -50 };
    expect(toCanvas(view, RECT.left + 300, RECT.top + 150, RECT)).toEqual({
      x: 100,
      y: 100,
    });
  });

  it("round-trips every view and point", () => {
    for (const view of VIEWS) {
      for (const [clientX, clientY] of POINTS) {
        const back = toScreen(
          view,
          toCanvas(view, clientX, clientY, RECT),
          RECT
        );
        expectClose(back.x, clientX, 1e-6);
        expectClose(back.y, clientY, 1e-6);
      }
    }
  });

  it("places a canvas box on screen at the right size and place", () => {
    const view: Viewport = { scale: 0.5, tx: 20, ty: 10 };
    expect(
      boundsToScreen(view, { height: 200, width: 400, x: 100, y: 60 }, RECT)
    ).toEqual({
      height: 100,
      left: RECT.left + 20 + 50,
      top: RECT.top + 10 + 30,
      width: 200,
    });
  });
});

describe("panBy", () => {
  it("moves the offset by screen pixels and leaves the zoom alone", () => {
    expect(panBy({ scale: 0.4, tx: 10, ty: 20 }, 5, -8)).toEqual({
      scale: 0.4,
      tx: 15,
      ty: 12,
    });
  });

  it("follows the pointer one-for-one at any zoom", () => {
    // A drag of 30px must move the board 30px on screen whether it is zoomed
    // right in or right out — the canvas distance covered differs, the screen
    // distance does not.
    for (const view of VIEWS) {
      const point = { x: 500, y: 400 };
      const before = toScreen(view, point, RECT);
      const after = toScreen(panBy(view, 30, -12), point, RECT);
      expectClose(after.x - before.x, 30, 1e-6);
      expectClose(after.y - before.y, -12, 1e-6);
    }
  });

  it("converts a screen delta into the expected canvas delta", () => {
    const view: Viewport = { scale: 0.25, tx: 0, ty: 0 };
    const [clientX, clientY] = [RECT.left + 200, RECT.top + 200];
    const before = toCanvas(view, clientX, clientY, RECT);
    const after = toCanvas(panBy(view, 50, 0), clientX, clientY, RECT);
    // Panning right by 50px at quarter zoom brings 200 canvas units of board
    // under a stationary cursor.
    expectClose(after.x - before.x, -200);
    expectClose(after.y, before.y);
  });

  it("panTo sets the offset outright", () => {
    expect(panTo({ scale: 1.5, tx: 1, ty: 2 }, -300, 44)).toEqual({
      scale: 1.5,
      tx: -300,
      ty: 44,
    });
  });
});

describe("zoomAt", () => {
  /**
   * The property the whole gesture rests on: the canvas point under the cursor
   * before a zoom is the canvas point under the cursor after it. Get it wrong
   * and the board slides out from under the pointer as it zooms.
   */
  it("leaves the point under the cursor stationary in canvas space", () => {
    for (const view of VIEWS) {
      for (const [clientX, clientY] of POINTS) {
        for (const target of [0.2, 0.9, 1, 1.7, 2.9]) {
          const zoomed = zoomAt(view, target, clientX, clientY, RECT);
          expectAnchorHeld(view, zoomed, clientX, clientY);
        }
      }
    }
  });

  it("holds the anchor even when the zoom runs into a clamp", () => {
    // Clamping the scale *after* solving for the offset would slide the board
    // sideways at the limits — a zoom that stops but does not stay put.
    for (const view of VIEWS) {
      for (const target of [-5, 0, 0.0001, 1e6]) {
        const [clientX, clientY] = [RECT.left + 220, RECT.top + 480];
        expectAnchorHeld(
          view,
          zoomAt(view, target, clientX, clientY, RECT),
          clientX,
          clientY
        );
      }
    }
  });

  it("clamps at the floor", () => {
    expect(zoomAt(OFFSET_VIEW, 0.001, 100, 100, RECT).scale).toBe(MIN_SCALE);
    expect(zoomAt(OFFSET_VIEW, -3, 100, 100, RECT).scale).toBe(MIN_SCALE);
  });

  it("clamps at the ceiling", () => {
    expect(zoomAt(OFFSET_VIEW, 400, 100, 100, RECT).scale).toBe(MAX_SCALE);
  });

  it("refuses a non-finite target rather than poisoning the offsets", () => {
    const view = VIEWS[2] as Viewport;
    expect(zoomAt(view, Number.NaN, 100, 100, RECT)).toEqual(view);
  });

  it("zoomByAt multiplies the current scale", () => {
    const view: Viewport = { scale: 0.8, tx: 5, ty: 5 };
    expectClose(zoomByAt(view, 1.25, RECT.left, RECT.top, RECT).scale, 1);
  });
});

describe("zoomByAtCentre", () => {
  it("keeps the middle of the container fixed", () => {
    const centreX = RECT.left + RECT.width / 2;
    const centreY = RECT.top + RECT.height / 2;
    for (const view of VIEWS) {
      expectAnchorHeld(
        view,
        zoomByAtCentre(view, 1.25, RECT),
        centreX,
        centreY
      );
    }
  });

  it("steps up and back down to where it started", () => {
    const view: Viewport = { scale: 1, tx: 130, ty: -60 };
    const round = zoomByAtCentre(
      zoomByAtCentre(view, 1.25, RECT),
      1 / 1.25,
      RECT
    );
    expectClose(round.scale, view.scale, 1e-9);
    expectClose(round.tx, view.tx, 1e-9);
    expectClose(round.ty, view.ty, 1e-9);
  });
});

describe("zoomByWheel", () => {
  /** The scale a single notch leaves, starting from `scale`. */
  const wheeled = (scale: number, deltaY: number) =>
    zoomByWheel({ scale, tx: 0, ty: 0 }, deltaY, RECT.left, RECT.top, RECT)
      .scale;

  it("zooms in on a negative delta and out on a positive one", () => {
    expect(wheeled(1, -100)).toBeGreaterThan(1);
    expect(wheeled(1, 100)).toBeLessThan(1);
  });

  it("is proportional, so one notch is the same change at any zoom", () => {
    // Both well inside the clamps, so nothing is truncated.
    expectClose(wheeled(0.5, -60) / 0.5, wheeled(2, -60) / 2, 1e-9);
  });

  it("anchors at the pointer, not the centre", () => {
    const [clientX, clientY] = [RECT.left + 11, RECT.top + 590];
    const view: Viewport = { scale: 0.6, tx: -400, ty: 220 };
    expectAnchorHeld(
      view,
      zoomByWheel(view, -240, clientX, clientY, RECT),
      clientX,
      clientY
    );
  });

  it("cannot be wheeled past the clamps", () => {
    let view: Viewport = { scale: 1, tx: 0, ty: 0 };
    for (let i = 0; i < 200; i += 1) {
      view = zoomByWheel(view, -120, RECT.left + 50, RECT.top + 50, RECT);
    }
    expect(view.scale).toBe(MAX_SCALE);
    for (let i = 0; i < 400; i += 1) {
      view = zoomByWheel(view, 120, RECT.left + 50, RECT.top + 50, RECT);
    }
    expect(view.scale).toBe(MIN_SCALE);
  });
});

describe("pinchScale", () => {
  it("scales by the ratio to the starting distance", () => {
    expectClose(pinchScale(0.8, 200, 300), 1.2);
  });

  it("holds still when the pinch started with the fingers together", () => {
    expect(pinchScale(0.8, 0, 300)).toBe(0.8);
  });

  it("measures the distance between two pointers", () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("frameBounds", () => {
  const bounds = { height: 400, width: 800, x: 3000, y: 2200 };

  it("puts the middle of the content in the middle of the container", () => {
    const view = frameBounds(bounds, RECT);
    expect(view).not.toBeNull();
    const centre = toScreen(
      view as Viewport,
      { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      RECT
    );
    expectClose(centre.x, RECT.left + RECT.width / 2, 1e-9);
    expectClose(centre.y, RECT.top + RECT.height / 2, 1e-9);
  });

  it("leaves a margin instead of running the content to the edge", () => {
    const view = frameBounds(bounds, RECT) as Viewport;
    const onScreen = boundsToScreen(view, bounds, RECT);
    // The tighter axis decides: 800x400 in a 900x600 box is width-limited.
    expectClose(onScreen.width, RECT.width * CONTENT_FRAME_FILL, 1e-9);
    expect(onScreen.height).toBeLessThan(RECT.height * CONTENT_FRAME_FILL);
    expect(onScreen.left).toBeGreaterThan(RECT.left);
    expect(onScreen.top).toBeGreaterThan(RECT.top);
  });

  it("fits a tall box by its height", () => {
    const tall = { height: 3000, width: 100, x: 0, y: 0 };
    const view = frameBounds(tall, RECT) as Viewport;
    expectClose(
      boundsToScreen(view, tall, RECT).height,
      RECT.height * CONTENT_FRAME_FILL,
      1e-9
    );
  });

  it("still centres a speck it had to clamp the zoom for", () => {
    // A single tiny item wants 500x zoom; the clamp says 3. Centring must
    // survive that, or framing one item throws it off screen.
    const speck = { height: 2, width: 2, x: 6000, y: 4500 };
    const view = frameBounds(speck, RECT) as Viewport;
    expect(view.scale).toBe(MAX_SCALE);
    const centre = toScreen(view, { x: 6001, y: 4501 }, RECT);
    expectClose(centre.x, RECT.left + RECT.width / 2, 1e-9);
    expectClose(centre.y, RECT.top + RECT.height / 2, 1e-9);
  });

  it("clamps rather than zooming out past the floor for a huge box", () => {
    const huge = { height: 900_000, width: 1_200_000, x: 0, y: 0 };
    expect((frameBounds(huge, RECT) as Viewport).scale).toBe(MIN_SCALE);
  });

  it("reports failure on a container that has not been laid out yet", () => {
    // Reporting rather than silently returning a view is what stops a caller
    // marking itself framed against a zero-sized container and never trying
    // again.
    expect(
      frameBounds(bounds, { height: 0, left: 0, top: 0, width: 0 })
    ).toBeNull();
    expect(frameBounds(bounds, { ...RECT, width: 0 })).toBeNull();
  });

  it("reports failure on empty content", () => {
    expect(frameBounds({ height: 0, width: 0, x: 10, y: 10 }, RECT)).toBeNull();
    expect(
      frameBounds({ height: -5, width: 100, x: 0, y: 0 }, RECT)
    ).toBeNull();
  });
});

describe("frameCanvas", () => {
  it("centres the opening screenful, not the whole canvas", () => {
    const view = frameCanvas(RECT) as Viewport;
    const centre = toScreen(
      view,
      { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
      RECT
    );
    expectClose(centre.x, RECT.left + RECT.width / 2, 1e-9);
    expectClose(centre.y, RECT.top + RECT.height / 2, 1e-9);
    // Framing the full 12000x9000 space would open a new board at ~7%, where a
    // dropped note is a speck.
    expectClose(
      view.scale,
      Math.min(RECT.width / START_VIEW_WIDTH, RECT.height / START_VIEW_HEIGHT) *
        0.92,
      1e-9
    );
  });

  it("returns null before the container has a size", () => {
    expect(frameCanvas({ height: 0, left: 0, top: 0, width: 0 })).toBeNull();
  });
});

describe("visibleBounds", () => {
  it("is the canvas region the container is looking at", () => {
    const view: Viewport = { scale: 0.5, tx: -100, ty: -50 };
    expect(visibleBounds(view, RECT)).toEqual({
      height: 1200,
      width: 1800,
      x: 200,
      y: 100,
    });
  });

  it("agrees with converting the container's own corners", () => {
    for (const view of VIEWS) {
      const box = visibleBounds(view, RECT);
      const topLeft = toCanvas(view, RECT.left, RECT.top, RECT);
      const bottomRight = toCanvas(
        view,
        RECT.left + RECT.width,
        RECT.top + RECT.height,
        RECT
      );
      expectClose(box.x, topLeft.x, 1e-6);
      expectClose(box.y, topLeft.y, 1e-6);
      expectClose(box.x + box.width, bottomRight.x, 1e-6);
      expectClose(box.y + box.height, bottomRight.y, 1e-6);
    }
  });
});

describe("transformOf", () => {
  it("translates before it scales", () => {
    // Reversed, tx would be measured in canvas units and every conversion in
    // this module would be off by the zoom.
    expect(transformOf({ scale: 0.5, tx: 12, ty: -3 })).toBe(
      "translate(12px, -3px) scale(0.5)"
    );
  });

  /**
   * The one assertion in this file the browser has to answer: the maths above
   * is only correct if the transform string it describes lays out the way it
   * claims. A transposed or reordered transform is still plausible arithmetic.
   */
  it("matches where a real element transformed by it lands", () => {
    const view: Viewport = { scale: 0.5, tx: 12, ty: -3 };
    const box = { height: 20, width: 40, x: 100, y: 60 };
    const host = document.createElement("div");
    host.style.cssText = `position:fixed;left:0;top:0;width:0;height:0;transform:${transformOf(view)}`;
    const child = document.createElement("div");
    child.style.cssText = `position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px`;
    host.append(child);
    document.body.append(host);
    try {
      const measured = child.getBoundingClientRect();
      const zero: ViewRect = { height: 0, left: 0, top: 0, width: 0 };
      const predicted = boundsToScreen(view, box, zero);
      expectClose(measured.left, predicted.left, 0.01);
      expectClose(measured.top, predicted.top, 0.01);
      expectClose(measured.width, predicted.width, 0.01);
    } finally {
      host.remove();
    }
  });
});

describe("sameViewport", () => {
  it("compares the view, not the object", () => {
    expect(sameViewport({ scale: 1, tx: 0, ty: 0 }, IDENTITY_VIEWPORT)).toBe(
      true
    );
    expect(sameViewport(IDENTITY_VIEWPORT, { scale: 1, tx: 0.5, ty: 0 })).toBe(
      false
    );
  });
});

describe("parseViewport", () => {
  it("restores a view it wrote", () => {
    const view: Viewport = { scale: 0.42, tx: -12.5, ty: 900 };
    expect(parseViewport(JSON.stringify(view))).toEqual(view);
  });

  it("refuses nothing, rubbish and half a view", () => {
    expect(parseViewport(null)).toBeNull();
    expect(parseViewport("")).toBeNull();
    expect(parseViewport("{oh no")).toBeNull();
    expect(parseViewport(JSON.stringify({ scale: 1, tx: 0 }))).toBeNull();
    expect(
      parseViewport(JSON.stringify({ scale: "1", tx: 0, ty: 0 }))
    ).toBeNull();
  });

  it("refuses a non-finite view, which no gesture could recover from", () => {
    // JSON has no NaN, so it arrives as null and must not slip through as a
    // number — a NaN scale blanks the canvas permanently.
    expect(parseViewport('{"scale":null,"tx":0,"ty":0}')).toBeNull();
    expect(parseViewport('{"scale":1e999,"tx":0,"ty":0}')).toBeNull();
  });
});
