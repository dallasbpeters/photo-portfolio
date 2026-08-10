import { put } from "@vercel/blob";

/**
 * Copies a generated asset into Blob storage and returns the durable URL.
 *
 * Every generation service hands back a temporary link — fal serves from a
 * scratch host, Magnific signs its CDN URLs with an expiry token — so an asset
 * pinned to a board would quietly 404 once that link lapsed. Boards are meant
 * to be kept, so the bytes have to become ours.
 */
export const persistGenerated = async (
  sourceUrl: string,
  /** Folder under the blob store, e.g. "boards/ai" or "boards/icons". */
  prefix: string
): Promise<string> => {
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`Could not download the generated file (${res.status})`);
  }
  const bytes = await res.arrayBuffer();
  const type = res.headers.get("content-type") ?? "image/jpeg";

  // SVG is deliberately recognised: an icon stored as .jpg would be served with
  // the wrong type and would not render.
  let extension = "jpg";
  if (type.includes("svg")) {
    extension = "svg";
  } else if (type.includes("png")) {
    extension = "png";
  }

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
