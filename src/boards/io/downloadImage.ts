/**
 * Saves a generated image to the visitor's machine.
 *
 * An anchor's `download` attribute only names a file for same-origin URLs, and
 * generated images live on the blob store — a different origin — so the browser
 * would ignore the name and navigate to the image instead of saving it. Fetching
 * the bytes first makes the URL same-origin (a blob: object URL) and the name
 * sticks.
 *
 * The fetch can still fail — a store that does not send CORS headers, or an
 * asset that has gone. Rather than leave a click doing nothing, that case falls
 * back to opening the image in a new tab, where it can be saved by hand.
 */

/** Pulls the extension off a URL, ignoring any query string. */
const EXTENSION = /\.([a-z0-9]{2,5})(?:\?|$)/i;

const extensionOf = (url: string): string => {
  const match = url.match(EXTENSION);
  return match?.[1]?.toLowerCase() ?? "png";
};

/** A filename that is safe on every platform and says where it came from. */
const fileNameFor = (url: string, label: string): string => {
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image";
  return `${slug}.${extensionOf(url)}`;
};

const saveObjectUrl = (objectUrl: string, fileName: string): void => {
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
};

/**
 * Saves bytes the browser already holds.
 *
 * For anything drawn here rather than fetched — a shader, a halftone — which
 * has no URL to fetch from and does not need one. Uploading it first to get an
 * address, only to download it straight back, is a round trip for nothing.
 */
export const downloadBlob = (blob: Blob, label: string): void => {
  const objectUrl = URL.createObjectURL(blob);
  saveObjectUrl(objectUrl, fileNameFor(".png", label));
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
};

export const downloadImage = async (
  url: string,
  label: string
): Promise<void> => {
  const fileName = fileNameFor(url, label);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`status ${res.status}`);
    }
    const objectUrl = URL.createObjectURL(await res.blob());
    saveObjectUrl(objectUrl, fileName);
    // Freed on the next tick rather than immediately: revoking synchronously
    // can beat the click the browser has not finished acting on.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
};
