import { describe, expect, it } from "vitest";
import { isPsdFile, MAX_PSD_BYTES, psdToPng } from "./psdPreview";

/**
 * Recognising a Photoshop file, and refusing one that cannot be shown.
 *
 * Both halves fail quietly when wrong. A PSD the filter misses is discarded on
 * drop and looks like a board that ignores files; one it lets through unread
 * uploads perfectly and then shows as a broken picture, which reads as a
 * failed upload rather than a format nothing can draw.
 */

const file = (name: string, type: string, size = 10): File => {
  const made = new File([new Uint8Array(size)], name, { type });
  // File ignores a size that does not match its contents, and the point here
  // is the cap rather than the bytes.
  Object.defineProperty(made, "size", { value: size });
  return made;
};

describe("isPsdFile", () => {
  it("knows every spelling browsers use", () => {
    // The type comes from the operating system's own table, and they disagree.
    for (const type of [
      "image/vnd.adobe.photoshop",
      "application/x-photoshop",
      "image/x-photoshop",
      "IMAGE/VND.ADOBE.PHOTOSHOP",
    ]) {
      expect(isPsdFile(file("art.psd", type)), type).toBe(true);
    }
  });

  it("falls back to the name when the drop carried no type", () => {
    // Some file managers and some remote sources hand over a File with no
    // type at all, and a .psd dropped silently looks like a board that
    // ignores drops.
    expect(isPsdFile(file("art.psd", ""))).toBe(true);
    expect(isPsdFile(file("BIG.PSD", ""))).toBe(true);
    expect(isPsdFile(file("huge.psb", ""))).toBe(true);
  });

  it("leaves ordinary pictures alone", () => {
    for (const name of ["a.png", "a.jpg", "a.svg", "psd-notes.txt"]) {
      expect(isPsdFile(file(name, "image/png")), name).toBe(false);
    }
  });
});

describe("psdToPng", () => {
  it("refuses a file too large to read in a tab", async () => {
    // Reading one means holding the file, its composite and a canvas at once.
    // Past the cap a tab does not fail cleanly, it stops responding — which is
    // worse than a picture that never appeared.
    const huge = file(
      "huge.psd",
      "image/vnd.adobe.photoshop",
      MAX_PSD_BYTES + 1
    );
    await expect(psdToPng(huge)).rejects.toThrow("too large");
  });

  it("says what is wrong with something that is not a PSD", async () => {
    const bogus = file("art.psd", "image/vnd.adobe.photoshop", 64);
    await expect(psdToPng(bogus)).rejects.toThrow("could not be read");
  });
});

describe("reading a real PSD", () => {
  /** A PSD written here rather than committed, so the fixture cannot go stale. */
  const psdWithPicture = async (): Promise<File> => {
    const { writePsd } = await import("ag-psd");
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 80;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("no canvas in this environment");
    }
    context.fillStyle = "#9100ff";
    context.fillRect(0, 0, 120, 80);
    const bytes = writePsd({ canvas, children: [], height: 80, width: 120 });
    return new File([bytes], "art.psd", {
      type: "image/vnd.adobe.photoshop",
    });
  };

  it("turns the flattened picture into a PNG at its own size", async () => {
    const png = await psdToPng(await psdWithPicture());
    expect(png.type).toBe("image/png");

    const drawn = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("the preview did not decode"));
      image.src = URL.createObjectURL(png);
    });
    expect(drawn.naturalWidth).toBe(120);
    expect(drawn.naturalHeight).toBe(80);
  });

  it("names the preview after the document", async () => {
    // So a board full of them reads as the files somebody dropped rather than
    // a pile of stray PNGs.
    const png = await psdToPng(await psdWithPicture());
    expect(png.name).toBe("art.png");
  });
});
