import { describe, expect, it } from "vitest";
import type { TextStyle } from "../../config/textStyle.js";
import { rowToItemDto } from "./boardDto.js";
import { parseIncomingItem } from "./boardItemParse.js";
import type { BoardItemRow } from "./boards.js";

/**
 * A text item's appearance, all the way to the database and back.
 *
 * Worth a test because the trip has three places to lose something and none of
 * them says so: `parseIncomingItem` allowlists what may be stored, the upsert
 * serialises it into a JSONB column, and `rowToItemDto` filters it again on the
 * way out. A property missing from any one of those simply reverts on the next
 * reload, which reads as "the toolbar did not save" rather than as an error.
 *
 * The database itself is not involved, and does not need to be: JSONB stores
 * what `JSON.stringify` produced and hands it back parsed, which is exactly
 * what the round trip below does.
 */

const ID = "3f1c8ba0-0f6e-4a2f-9a0f-2e2f5b9c1a11";

const STYLE: TextStyle = {
  align: "center",
  color: "#ff00aa",
  family: "fraunces",
  italic: true,
  letterSpacing: 0.08,
  lineHeight: 1.6,
  transform: "uppercase",
  weight: 700,
};

/** An item as the canvas sends it. */
const incoming = (extra: Record<string, unknown> = {}) => ({
  body: "Hello",
  height: 90,
  id: ID,
  kind: "text",
  width: 420,
  x: 100,
  y: 100,
  z: 1,
  ...extra,
});

/**
 * The row the upsert would have written, read back.
 *
 * `JSON.parse(JSON.stringify(...))` is the column: the endpoint stringifies
 * into JSONB, and the driver hands JSONB back already parsed.
 */
const stored = (textStyle: TextStyle | null): BoardItemRow =>
  ({
    body: "Hello",
    created_at: new Date(0).toISOString(),
    credit_name: null,
    credit_url: null,
    font_size: 58,
    height: 90,
    id: ID,
    image_url: null,
    kind: "text",
    photo_id: null,
    text_style:
      textStyle === null ? null : JSON.parse(JSON.stringify(textStyle)),
    thumb_url: null,
    width: 420,
    x: 100,
    y: 100,
    z_index: 1,
  }) as BoardItemRow;

describe("a text item's style, saved and reloaded", () => {
  it("comes back with every property intact", () => {
    const accepted = parseIncomingItem(incoming({ textStyle: STYLE }));
    expect(accepted?.textStyle).toEqual(STYLE);

    const dto = rowToItemDto(stored(accepted?.textStyle ?? null));
    expect(dto.textStyle).toEqual(STYLE);
    expect(dto.fontSize).toBe(58);
  });

  it("reads a row written before the column existed", () => {
    // Every board on the live database is one of these. NULL has to mean "the
    // defaults for the kind", not "a style with nothing in it".
    const dto = rowToItemDto(stored(null));
    expect(dto.textStyle).toBeNull();
    expect(
      rowToItemDto({ ...stored(null), text_style: undefined }).textStyle
    ).toBeNull();
  });

  it("stores nothing at all for an item nobody has styled", () => {
    expect(parseIncomingItem(incoming())?.textStyle).toBeNull();
    expect(
      parseIncomingItem(incoming({ textStyle: {} }))?.textStyle
    ).toBeNull();
  });

  it("drops what the allowlist does not name, on the way in and out", () => {
    const payload = { family: "inter", padding: "9999px", weight: 500 };
    const accepted = parseIncomingItem(incoming({ textStyle: payload }));
    expect(accepted?.textStyle).not.toHaveProperty("padding");
    expect(accepted?.textStyle?.family).toBe("inter");

    // And again on the way out, for a row that never went through the parser.
    const dto = rowToItemDto({ ...stored(null), text_style: payload });
    expect(dto.textStyle).not.toHaveProperty("padding");
    expect(dto.textStyle?.weight).toBe(500);
  });

  it("keeps the item when the style is nonsense, rather than losing the text", () => {
    // A malformed style is a reason to ignore the style, never a reason to drop
    // the words someone typed.
    const accepted = parseIncomingItem(incoming({ textStyle: "big and red" }));
    expect(accepted?.body).toBe("Hello");
    expect(accepted?.textStyle).toBeNull();
  });
});
