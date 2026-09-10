import { describe, expect, it } from "vitest";
import { measureRaster } from "./measureRaster";

/**
 * Measuring a picture so it can be wrapped for a vector editor.
 *
 * Small, and the one thing here that has already been wrong. The first
 * version set crossOrigin, which turned every picture served without a CORS
 * header — a Pinterest reference, and most of what lands on a board — into
 * "could not be read". That looked like a broken button rather than a broken
 * request. Data URIs stand in here: the same code path, no network.
 */

/** A 2x3 PNG, so a swapped axis shows up as a swap rather than a match. */
const PNG_2x3 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEElEQVR4nGP4z8AARAwoFABE0AX7pM/egAAAAABJRU5ErkJggg==";

describe("measureRaster", () => {
  it("reads the picture's own pixel size", async () => {
    expect(await measureRaster(PNG_2x3)).toEqual({ height: 3, width: 2 });
  });

  it("refuses something that is not a picture", async () => {
    // The wrap needs a size; without one the editor opens an empty document,
    // which reads as the bridge being broken rather than the picture being.
    await expect(
      measureRaster("data:image/png;base64,bm90YXBuZw==")
    ).rejects.toThrow("could not be read");
  });

  it("refuses an address that goes nowhere", async () => {
    await expect(measureRaster("not-a-url")).rejects.toThrow(
      "could not be read"
    );
  });
});
