/**
 * Choosing images from Google Drive, through Google's own picker.
 *
 * The picker rather than a browser of our own, for one reason that matters: it
 * lets the app ask for `drive.file`, a scope that grants access only to files
 * the person explicitly picked. Browsing Drive inside our own UI would need
 * `drive.readonly` — read everything in the account — which is a restricted
 * scope, requiring Google's Cloud App Security Assessment before it can be
 * approved. A custom viewer is not worth a paid security assessment, so Google
 * hosts the browser and we keep the minimal scope.
 *
 * The server's only part is handing over the picker's credentials, and only to
 * a signed-in admin — they are deliberately not compiled into the bundle. The
 * token is then obtained in the browser, the bytes are fetched in the browser,
 * and they go into our blob storage through the same upload path a dragged file
 * uses. So there is still no client secret and no refresh token to store.
 *
 * The bytes are copied deliberately rather than linked: a Drive URL needs the
 * viewer's own permission to load, so a board pointing at one would show
 * broken images to anyone else — and to you, once the file moved.
 */

import { googleApi } from "../services/portfolioService";

const GIS_SRC = "https://accounts.google.com/gsi/client";
const GAPI_SRC = "https://apis.google.com/js/api.js";

/**
 * Access only to files chosen through the picker.
 *
 * Deliberately not drive.readonly: this app has no business being able to read
 * a Drive it was not pointed at, and that scope would drag a security
 * assessment into a simple import.
 */
const SCOPE = "https://www.googleapis.com/auth/drive.file";

/**
 * What the picker will offer, matching what the uploader accepts.
 *
 * Kept in step with the allowlist in portfolioService.uploadImageFile. If the
 * two drift, the symptom is a picture you are allowed to choose and then told
 * you cannot use, which reads as a bug rather than a limit.
 */
const PICKABLE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
].join(",");

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

const loadPicker = async (): Promise<void> => {
  await loadScript(GAPI_SRC);
  await new Promise<void>((resolve) => {
    window.gapi?.load("picker", () => resolve());
  });
};

/**
 * Asks Google for a token covering picked files.
 *
 * Its own consent, separate from signing in: the sign-in button verifies who
 * you are and receives no access token at all, so there is nothing there to
 * reuse. Consent for reading files is a different question and Google asks it
 * separately, which is the honest arrangement.
 */
const requestToken = (clientId: string): Promise<string> =>
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
      scope: SCOPE,
    });
    client.requestAccessToken();
  });

export type DriveFile = GooglePickerDocument;

/**
 * The Cloud project number, which the picker calls the "app id".
 *
 * Taken from the client id rather than configured separately: an OAuth client
 * id is always `<project number>-<random>.apps.googleusercontent.com`, so the
 * two can never disagree, and there is no second value to keep in step.
 */
const appIdFrom = (clientId: string): string => clientId.split("-")[0] ?? "";

/** Class Google's picker gives its backdrop, in this document. */
const PICKER_BACKDROP = "picker-dialog-bg";

/** A style tag id kept so the injected rule can be removed again. */
const OVERLAY_STYLE_ID = "drive-picker-overlay";

/**
 * Locks the page while Google's picker is open: the wheel no longer scrolls
 * the portfolio behind it, and the picker's white backdrop is darkened to
 * match the dark admin UI.
 *
 * The picker renders its backdrop in this document (the iframe content itself
 * stays cross-origin and untouched), so both effects are plain CSS and DOM.
 */
const lockPage = (): void => {
  document.body.style.overflow = "hidden";
  const style = document.createElement("style");
  style.id = OVERLAY_STYLE_ID;
  style.textContent = `.${PICKER_BACKDROP} { background: rgba(0, 0, 0, 0.75) !important; }`;
  document.head.append(style);
};

const unlockPage = (): void => {
  document.body.style.overflow = "";
  document.getElementById(OVERLAY_STYLE_ID)?.remove();
};

/** Opens Google's picker and resolves with what was chosen, or an empty list. */
const openPicker = (
  token: string,
  apiKey: string,
  clientId: string
): Promise<DriveFile[]> =>
  new Promise((resolve, reject) => {
    const picker = window.google?.picker;
    if (!picker) {
      reject(new Error("The Google picker did not load"));
      return;
    }
    /**
     * Your own images, flat and searchable. The first tab, and the default.
     *
     * GRID so the photos are browsable as a wall rather than a list. Under
     * drive.file Google's guidance is that thumbnails may not render (the
     * scope does not cover them), in which case tiles come up blank — the
     * reason LIST was used originally. In practice the picker often loads the
     * thumbnails through the signed-in browser session, so a grid is worth
     * trying; fall back to LIST if the tiles are blank.
     */
    const images = new picker.DocsView(picker.ViewId.DOCS_IMAGES)
      .setMode(picker.DocsViewMode.GRID)
      .setMimeTypes(PICKABLE_TYPES);

    /** Browsing by folder, for when you know exactly where the work is. */
    const folders = new picker.DocsView(picker.ViewId.DOCS)
      .setMode(picker.DocsViewMode.LIST)
      .setIncludeFolders(true)
      .setMimeTypes(PICKABLE_TYPES);

    /**
     * Shared drives, browsable, on their own tab rather than in place of
     * everything.
     */
    const shared = new picker.DocsView(picker.ViewId.DOCS)
      .setMode(picker.DocsViewMode.LIST)
      .setEnableDrives(true)
      .setIncludeFolders(true)
      .setMimeTypes(PICKABLE_TYPES);

    new picker.PickerBuilder()
      .addView(images)
      .addView(folders)
      .addView(shared)
      // Several at once. Without this the picker takes one file per trip, which
      // for filling a moodboard is the wrong unit of work entirely.
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      // Required when the scope is drive.file: it is how Google ties the files
      // you pick to this app so it may read them afterwards.
      .setAppId(appIdFrom(clientId))
      .setDeveloperKey(apiKey)
      .setOAuthToken(token)
      .setTitle("Choose images for this board")
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) {
          unlockPage();
          resolve(data.docs ?? []);
        } else if (data.action === picker.Action.CANCEL) {
          unlockPage();
          resolve([]);
        }
      })
      .build()
      .setVisible(true);
    lockPage();
  });

/** Downloads one picked file's bytes as something the uploader accepts. */
const downloadFile = async (file: DriveFile, token: string): Promise<File> => {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    throw new Error(`Could not download ${file.name} (${res.status})`);
  }
  const blob = await res.blob();
  // The picker reports the type; a blob from fetch may not carry one.
  return new File([blob], file.name, {
    type: file.mimeType || blob.type || "image/jpeg",
  });
};

/**
 * The whole flow: consent, pick, download.
 *
 * Returns Files so the caller can hand them to exactly the same code that
 * handles a dragged or pasted image — one upload path, one place where a
 * photo comes into existence.
 */
export const pickDriveImages = async (): Promise<File[]> => {
  // Credentials and scripts together: the fetch is a round trip to our own
  // server and the scripts come from Google, so there is no reason to wait for
  // one before starting the other.
  const [config] = await Promise.all([
    googleApi.pickerConfig(),
    loadScript(GIS_SRC),
    loadPicker(),
  ]);
  const token = await requestToken(config.clientId);
  const picked = await openPicker(token, config.apiKey, config.clientId);
  if (picked.length === 0) {
    return [];
  }
  // Together: these are independent downloads and waiting for each in turn
  // would add their latencies up for no reason.
  return await Promise.all(picked.map((file) => downloadFile(file, token)));
};
