import type { BoardItem } from "../../types";

/**
 * Laying pictures out in a frame.
 *
 * One grid, used by two things: gathering a selection into a new frame, and
 * tidying a frame that already exists. They were the same arithmetic written
 * twice until this, and the two drifted — a group came out one padding wider
 * than a tidy of the same pictures.
 */

/** Space between cells, and between the outermost cells and the frame. */
export const FRAME_PAD = 40;

/** The frame's name sits inside its bounds, so the top gets extra room. */
const HEADER = FRAME_PAD * 2;

export interface GridLayout {
  /** Where each item goes, by id. */
  at: Map<string, { x: number; y: number }>;
  height: number;
  width: number;
}

/**
 * The order the pictures are read in now.
 *
 * Top to bottom, left to right, which is the order anyone would say they are
 * already in — so tidying keeps the sequence rather than imposing one. Rows are
 * banded rather than compared exactly, or two pictures a few pixels apart in a
 * row would swap places on every tidy.
 */
export const readingOrder = (items: BoardItem[]): BoardItem[] => {
  if (items.length === 0) {
    return [];
  }
  const typical =
    items.reduce((sum, item) => sum + item.height, 0) / items.length;
  // Two thirds of a picture's height: enough that a row survives being nudged,
  // small enough that a genuine second row is never folded into the first.
  const band = Math.max(typical * 0.66, 1);
  return [...items].sort((a, b) => {
    const rowA = Math.round(a.y / band);
    const rowB = Math.round(b.y / band);
    return rowA === rowB ? a.x - b.x : rowA - rowB;
  });
};

/**
 * A uniform grid: one cell for every picture, each centred in its own.
 *
 * The cell is the largest picture, so nothing is scaled and nothing overlaps.
 * Columns come from the square root, which keeps a set roughly as wide as it is
 * tall — twelve pictures in four columns of three rather than a strip of twelve
 * that no frame can show at once.
 */
export const gridLayout = (
  ordered: BoardItem[],
  /** Top-left of the frame the grid sits in. */
  origin: { x: number; y: number }
): GridLayout => {
  if (ordered.length === 0) {
    return {
      at: new Map(),
      height: HEADER + FRAME_PAD * 2,
      width: FRAME_PAD * 2,
    };
  }

  const columns = Math.ceil(Math.sqrt(ordered.length));
  const rows = Math.ceil(ordered.length / columns);
  const cell = {
    height: Math.max(...ordered.map((item) => item.height)),
    width: Math.max(...ordered.map((item) => item.width)),
  };

  const width =
    columns * cell.width + (columns - 1) * FRAME_PAD + FRAME_PAD * 2;
  const height =
    rows * cell.height + (rows - 1) * FRAME_PAD + FRAME_PAD * 2 + HEADER;

  const at = new Map(
    ordered.map((item, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return [
        item.id,
        {
          x: Math.round(
            origin.x +
              FRAME_PAD +
              column * (cell.width + FRAME_PAD) +
              (cell.width - item.width) / 2
          ),
          y: Math.round(
            origin.y +
              FRAME_PAD +
              HEADER +
              row * (cell.height + FRAME_PAD) +
              (cell.height - item.height) / 2
          ),
        },
      ];
    })
  );

  return { at, height, width };
};
