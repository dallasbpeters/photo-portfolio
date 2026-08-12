import { containedBy } from "../../config/graph.js";
import { boardsApi } from "../services/portfolioService";
import type { BoardItem, BoardWire } from "../types";

/**
 * Several pictures on the board, flattened into one.
 *
 * Rendered in the browser rather than on the server because the layout is the
 * point, and only the canvas knows it: the images are drawn where they sit and
 * at the size they were dragged to. A server-side composite would have to be
 * told all of that, which means inventing a layout language for an arrangement
 * that already exists on screen.
 *
 * The output is a PNG so transparency survives — the commonest reason to
 * composite here is to put a cut-out from the background remover onto
 * something else, and a JPEG would flatten that onto black.
 */

/**
 * The longest edge of the rendered composite.
 *
 * Generous, because the result is usually a reference image for a model and
 * those work at 1024–2048. Past this the file grows faster than the detail.
 */
const MAX_EDGE = 2048;

/** A composite of nothing is not worth a request. */
const MIN_SOURCES = 1;

export interface CompositeSource {
  height: number;
  url: string;
  width: number;
  x: number;
  y: number;
  z: number;
}

/**
 * The pictures feeding a Composite node, in the order they should be drawn.
 *
 * A wire from a frame means everything on that frame, which is the wiring
 * anyone would reach for — arrange the pieces inside a frame, wire the frame
 * in, done. A wire from a single image means that image.
 *
 * Sorted by z, so the stacking on the board is the stacking in the file:
 * "bring to front" is how you reorder a composite, rather than a list of layers
 * that has to be kept in step with what you can see.
 */
export const compositeSources = (
  node: BoardItem,
  items: BoardItem[],
  wires: BoardWire[]
): CompositeSource[] => {
  const byId = new Map(items.map((item) => [item.id, item]));
  const feeding = wires
    .filter(
      (wire) => wire.targetItemId === node.id && wire.targetPort === "image"
    )
    .map((wire) => byId.get(wire.sourceItemId))
    .filter((item): item is BoardItem => Boolean(item));

  const collected: BoardItem[] = [];
  for (const item of feeding) {
    if (item.kind === "frame") {
      collected.push(...containedBy(item, items).filter((i) => i.imageUrl));
      continue;
    }
    if (item.imageUrl) {
      collected.push(item);
    }
  }

  // Deduplicated: two frames may overlap, and an image on both would otherwise
  // be drawn twice — harmless for an opaque picture, visible for a translucent
  // one, and always a wasted decode.
  const seen = new Set<string>();
  const unique = collected.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });

  return unique
    .sort((a, b) => a.z - b.z)
    .map((item) => ({
      height: item.height,
      url: item.imageUrl ?? "",
      width: item.width,
      x: item.x,
      y: item.y,
      z: item.z,
    }));
};

/** The box the sources occupy together, in canvas units. */
const boundsOfSources = (sources: CompositeSource[]) => {
  const left = Math.min(...sources.map((s) => s.x));
  const top = Math.min(...sources.map((s) => s.y));
  const right = Math.max(...sources.map((s) => s.x + s.width));
  const bottom = Math.max(...sources.map((s) => s.y + s.height));
  return { height: bottom - top, width: right - left, x: left, y: top };
};

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    // Our own blob storage sends permissive CORS headers, which is what lets
    // the canvas be read back out. Without this the draw succeeds, the canvas
    // is tainted, and toBlob throws — a failure that only shows up at the end.
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("An image in the composite would not load"));
    image.src = url;
  });

/**
 * A picture the canvas is allowed to read back.
 *
 * A board legitimately holds images from anywhere — a Pinterest pin is the
 * common case — and those hosts send no CORS headers, so requesting one with
 * crossOrigin set fails outright. The picture is plainly visible on the board,
 * which makes this the least obvious failure in the whole feature.
 *
 * So a foreign picture is copied into our own storage first, once, and the
 * copy is what gets drawn.
 */
const readableUrl = async (url: string): Promise<string> => {
  try {
    return await loadImage(url).then(() => url);
  } catch {
    return await boardsApi.adopt(url);
  }
};

/** Fills for the non-transparent background choices. */
const GROUNDS: Record<string, string> = { black: "#000000", white: "#ffffff" };

/**
 * Draws the sources into one PNG.
 *
 * Positions are relative to the group's own bounding box, so the composite is
 * cropped to the work rather than carrying the empty canvas around it.
 */
export const renderComposite = async (
  sources: CompositeSource[],
  background: string
): Promise<Blob> => {
  if (sources.length < MIN_SOURCES) {
    throw new Error("Wire some images into the Composite node");
  }

  const box = boundsOfSources(sources);
  const scale = Math.min(MAX_EDGE / Math.max(box.width, box.height), 4);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(box.width * scale));
  canvas.height = Math.max(1, Math.round(box.height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser cannot build a composite");
  }

  const ground = GROUNDS[background];
  if (ground) {
    context.fillStyle = ground;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Loaded together, drawn in order. Fetching one at a time would make a
  // twelve-image frame twelve round trips deep.
  const readable = await Promise.all(
    sources.map((source) => readableUrl(source.url))
  );
  const images = await Promise.all(readable.map((url) => loadImage(url)));

  images.forEach((image, index) => {
    const source = sources[index];
    if (!source) {
      return;
    }
    context.drawImage(
      image,
      (source.x - box.x) * scale,
      (source.y - box.y) * scale,
      source.width * scale,
      source.height * scale
    );
  });

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("The composite could not be built"));
    }, "image/png");
  });
};
