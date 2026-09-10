import { describe, expect, it } from "vitest";
import { type MeasureImage, rasterAsSvg } from "./rasterAsSvg";

/**
 * A photograph, wrapped so a vector editor will open it.
 *
 * The wrap is what lets "open in the editor" be offered on more than vector
 * results, which was almost nothing — a board makes PNGs. It has to produce a
 * real SVG, at the picture's real size, with a URL that survives being an
 * attribute value; each of those is silent when wrong. A bad viewBox crops the
 * picture, and an unescaped ampersand makes a document the editor refuses to
 * open at all.
 */

const measuring =
  (width: number, height: number): MeasureImage =>
  () =>
    Promise.resolve({ height, width });

describe("rasterAsSvg", () => {
  it("sizes the document to the picture", async () => {
    const svg = await rasterAsSvg("https://ours/a.jpg", measuring(1600, 900));
    expect(svg).toContain('width="1600"');
    expect(svg).toContain('height="900"');
    expect(svg).toContain('viewBox="0 0 1600 900"');
  });

  it("references the picture rather than embedding it", async () => {
    // A data URI would turn a two megabyte JPEG into three megabytes of
    // base64 in a JSON body, on every open.
    const svg = await rasterAsSvg("https://ours/a.jpg", measuring(10, 10));
    expect(svg).toContain('href="https://ours/a.jpg"');
    expect(svg).not.toContain("base64");
  });

  it("keeps the old xlink href beside the new one", async () => {
    // Plain `href` is the SVG 2 spelling. Editors that predate it read
    // xlink:href, and one that reads neither shows an empty page.
    const svg = await rasterAsSvg("https://ours/a.jpg", measuring(10, 10));
    expect(svg).toContain('xlink:href="https://ours/a.jpg"');
    expect(svg).toContain("xmlns:xlink=");
  });

  it("escapes a URL that would break out of the attribute", async () => {
    const svg = await rasterAsSvg(
      'https://ours/a.jpg?w=1&h=2&q="80"',
      measuring(10, 10)
    );
    expect(svg).toContain("&amp;h=2");
    expect(svg).toContain("&quot;80&quot;");
    // One image element, not a document broken in half by a stray quote.
    expect(svg.match(/<image /g)).toHaveLength(1);
  });

  it("refuses a picture that measured nothing", async () => {
    // What a failed load looks like. Writing it out anyway gives the editor a
    // document with no area, which reads as the bridge being broken.
    await expect(
      rasterAsSvg("https://ours/a.jpg", measuring(0, 0))
    ).rejects.toThrow("could not be read");
  });

  it("passes a load failure through", async () => {
    const broken: MeasureImage = () =>
      Promise.reject(new Error("That picture could not be read"));
    await expect(rasterAsSvg("https://ours/a.jpg", broken)).rejects.toThrow(
      "could not be read"
    );
  });
});
