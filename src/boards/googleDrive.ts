/**
 * Browsing images in Google Drive, for the admin uploaders.
 *
 * A custom viewer rather than Google's picker, because the picker cannot show
 * thumbnails under the minimal scope: a list of rows is all it will render,
 * and a grid of empty tiles is worse than a list. The viewer asks for
 * `drive.readonly` instead — enough to list files and load their thumbnails —
 * and downloads the picked bytes into the same upload path a dragged file
 * uses, so a photo coming in from Drive is indistinguishable from one dropped
 * on the page.
 *
 * The server's only part is handing over the picker credentials to a signed-in
 * admin; the token is obtained in the browser, files are listed and fetched in
 * the browser, and bytes go to our blob storage from there.
 *
 * The bytes are copied deliberately rather than linked: a Drive URL needs the
 * viewer's own permission to load, so a photo pointing at one would show
 * broken images to anyone else — and to you, once the file moved.
 */

import { googleApi } from "../services/portfolioService";

const GIS_SRC = "https://accounts.google.com/gsi/client";

/**
 * Read access to the whole Drive, not just picked files.
 *
 * The price of a viewer that can list and preview: the picker only needed
 * drive.file because Google was doing the browsing. Browsing is ours now, so
 * the scope has to cover it. The consent screen tells the user as much; the
 * integration's scopes in Google Cloud must include it or the token request
 * will be refused.
 */
export const DRIVE_READ_SCOPE =
  "https://www.googleapis.com/auth/drive.readonly";

/** Loads a script once per page, however many times this is called. */
const loaders = new Map<string, Promise<void>>();

const loadScript = (src: string): Promise<void> => {
  const existing = loaders.get(src);
  if (existing) {
    return existing;
  }
  const loading = new Promise<void>((resolve, reject) => {
    const tag = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`
    );
    if (tag?.dataset.loaded === "true") {
      resolve();
      return;
    }
    const script = tag ?? document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () =>
      reject(new Error(`Could not load ${src}`))
    );
    if (!tag) {
      document.head.append(script);
    }
  });
  loaders.set(src, loading);
  return loading;
};

export interface DriveConfig {
  apiKey: string;
  clientId: string;
}

/** The picker credentials, handed to a signed-in admin only. */
export const driveConfig = async (): Promise<DriveConfig> => {
  await loadScript(GIS_SRC);
  return googleApi.pickerConfig();
};

/**
 * Asks Google for a token covering Drive reads.
 *
 * Its own consent, separate from signing in: the sign-in button verifies who
 * you are and receives no access token at all, so there is nothing there to
 * reuse. Consent for reading files is a different question and Google asks it
 * separately, which is the honest arrangement.
 */
export const requestDriveToken = (clientId: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      reject(new Error("Google sign-in did not load"));
      return;
    }
    const client = oauth2.initTokenClient({
      callback: (response) => {
        if (response.access_token) {
          resolve(response.access_token);
        } else {
          reject(new Error(response.error ?? "Google did not grant access"));
        }
      },
      client_id: clientId,
      scope: DRIVE_READ_SCOPE,
    });
    client.requestAccessToken();
  });

/** One image in the Drive, enough to show it and fetch its bytes. */
export interface DriveFileEntry {
  id: string;
  mimeType: string;
  name: string;
  size: number | null;
  /** A working thumbnail URL, if the file has one. */
  thumbnail: string | null;
}

const withToken = (url: string, token: string): string =>
  `${url}${url.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;

/** Escapes a search term for the Drive `name contains` query. */
const escapeQuery = (term: string): string =>
  term.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/**
 * One page of image files, matching the uploader's allowlist.
 *
 * A search term narrows the results; `pageToken` walks further pages. Shared
 * drives are included so a picture living on a team drive still shows up.
 */
export const listDriveImages = async (
  token: string,
  query: string,
  pageToken: string | null
): Promise<{
  files: DriveFileEntry[];
  nextPageToken: string | null;
}> => {
  const q = [
    "mimeType contains 'image/'",
    "trashed = false",
    ...(query.trim() ? [`name contains '${escapeQuery(query.trim())}'`] : []),
  ].join(" and ");
  const params = new URLSearchParams({
    fields: "files(id,name,mimeType,thumbnailLink,size),nextPageToken",
    orderBy: "folder desc,modifiedTime desc",
    pageSize: "100",
    q,
    supportsAllDrives: "true",
  });
  if (pageToken) {
    params.set("pageToken", pageToken);
  }
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    files?: {
      id: string;
      mimeType: string;
      name: string;
      size?: number;
      thumbnailLink?: string;
    }[];
    nextPageToken?: string;
  };
  if (!res.ok) {
    throw new Error(
      json.error?.message ?? `Google Drive answered ${res.status}`
    );
  }
  return {
    files: (json.files ?? []).map((file) => ({
      id: file.id,
      mimeType: file.mimeType,
      name: file.name,
      size: file.size ?? null,
      thumbnail: file.thumbnailLink
        ? withToken(file.thumbnailLink, token)
        : null,
    })),
    nextPageToken: json.nextPageToken ?? null,
  };
};

/** Downloads one file's bytes as something the uploader accepts. */
export const downloadDriveFile = async (
  file: DriveFileEntry,
  token: string
): Promise<File> => {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    throw new Error(`Could not download ${file.name} (${res.status})`);
  }
  const blob = await res.blob();
  return new File([blob], file.name, {
    type: file.mimeType || blob.type || "image/jpeg",
  });
};
