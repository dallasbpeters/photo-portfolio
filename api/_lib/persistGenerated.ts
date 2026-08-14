import { put } from "@vercel/blob";

/**
 * Copies a generated asset into Blob storage and returns the durable URL.
 *
 * Every generation service hands back a temporary link — fal serves from a
 * scratch host, Magnific signs its CDN URLs with an expiry token — so an asset
 * pinned to a board would quietly 404 once that link lapsed. Boards are meant
 * to be kept, so the bytes have to become ours.
 *
 * The type is worked out from the bytes rather than taken from the response.
 * fal serves Recraft's vector output as `application/octet-stream`, so trusting
 * the header stored every SVG as a `.jpg` labelled `application/octet-stream` —
 * and a browser will not render that, whatever it is called. The generation had
 * worked and cost money; only the filing was wrong, which made it look like the
 * model had failed.
 */

/** Leading bytes that identify each format we accept. */
const SIGNATURES: { prefix: number[]; type: string }[] = [
  { prefix: [0x89, 0x50, 0x4e, 0x47], type: "image/png" },
  { prefix: [0xff, 0xd8, 0xff], type: "image/jpeg" },
  { prefix: [0x47, 0x49, 0x46, 0x38], type: "image/gif" },
];

const startsWith = (bytes: Uint8Array, prefix: number[]): boolean =>
  prefix.every((byte, index) => bytes[index] === byte);

/** RIFF....WEBP — the tag sits at offset 8, after the chunk size. */
const isWebp = (bytes: Uint8Array): boolean =>
  startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
  startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50]);

/** ....ftypavif — the brand sits at offset 4, after the box length. */
const isAvif = (bytes: Uint8Array): boolean =>
  startsWith(
    bytes.subarray(4),
    [0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]
  );

/**
 * SVG is text, so it has no magic number.
 *
 * It may open with an XML declaration, a doctype, or a comment before the root
 * element ever appears, so the opening tag is looked for in the first stretch of
 * the file rather than only at position zero.
 */
const SVG_TAG = /<svg[\s>]/i;

const isSvg = (bytes: Uint8Array): boolean => {
  const head = new TextDecoder("utf-8", { fatal: false }).decode(
    bytes.subarray(0, 512)
  );
  return SVG_TAG.test(head);
};

const EXTENSIONS: Record<string, string> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

/**
 * The real type of the bytes, or null if they are not an image we know.
 *
 * Deliberately ignores what the server said: the whole reason this exists is
 * that the server was wrong.
 */
const sniff = (bytes: Uint8Array): string | null => {
  for (const { prefix, type } of SIGNATURES) {
    if (startsWith(bytes, prefix)) {
      return type;
    }
  }
  if (isWebp(bytes)) {
    return "image/webp";
  }
  if (isAvif(bytes)) {
    return "image/avif";
  }
  if (isSvg(bytes)) {
    return "image/svg+xml";
  }
  return null;
};

export const persistGenerated = async (
  sourceUrl: string,
  /** Folder under the blob store, e.g. "boards/ai" or "boards/icons". */
  prefix: string,
  /**
   * The type the generator declared, used only when the bytes are unrecognised.
   * fal reports one in its JSON that is more honest than the one it serves.
   */
  declaredType?: string | null
): Promise<string> => {
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`Could not download the generated file (${res.status})`);
  }
  const bytes = await res.arrayBuffer();

  const served = res.headers.get("content-type");
  const type =
    sniff(new Uint8Array(bytes)) ??
    // Only trusted once the bytes have failed to identify themselves, and only
    // if it actually names an image — "application/octet-stream" is what got us
    // here and must never be stored.
    [declaredType, served].find((candidate) =>
      candidate?.startsWith("image/")
    ) ??
    "image/jpeg";

  const extension = EXTENSIONS[type.split(";")[0]?.trim() ?? ""] ?? "jpg";

  const blob = await put(
    `${prefix}/${crypto.randomUUID()}.${extension}`,
    bytes,
    {
      access: "public",
      contentType: type,
    }
  );
  return blob.url;
};

/**
 * Stores an SVG we already hold as text — the write-back from an edit made in
 * Affinity — rather than fetching one. Same store and same public access as the
 * generated copies; an edited vector is still just a vector to the rest of the
 * app, so it should live where they do.
 */
export const persistSvgText = async (
  svg: string,
  /** Folder under the blob store; the caller picks "boards/svg". */
  prefix: string
): Promise<string> => {
  const blob = await put(`${prefix}/${crypto.randomUUID()}.svg`, svg, {
    access: "public",
    contentType: "image/svg+xml",
  });
  return blob.url;
};

/**
 * Stores bytes we already hold — a rasterised SVG, say — rather than fetching a
 * URL. The type is the caller's word, unlike persistGenerated which sniffs it
 * from the bytes; a buffer produced locally has no server to disagree.
 */
export const persistBytes = async (
  bytes: ArrayBuffer | Buffer,
  /** Folder under the blob store, e.g. "boards/ai". */
  prefix: string,
  contentType: string
): Promise<string> => {
  const extension =
    EXTENSIONS[contentType.split(";")[0]?.trim() ?? ""] ?? "jpg";
  const blob = await put(
    `${prefix}/${crypto.randomUUID()}.${extension}`,
    bytes,
    {
      access: "public",
      contentType,
    }
  );
  return blob.url;
};
