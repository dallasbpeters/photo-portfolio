import type { IconStyle } from "../../config/iconStyles";
import type { ResolvedSiteSettings } from "../../config/siteSettings";
import type { AffinityWriteback } from "../boards/affinity";
import type {
  AiModel,
  AiModelInput,
  Board,
  BoardItem,
  BoardItemResult,
  BoardSource,
  BoardWire,
  Category,
  DailyChallengeHistoryEntry,
  DailyChallengeJournal,
  DailyChallengeResponse,
  Element,
  Photo,
  PhotoExifData,
  RunState,
} from "../types";

/** What one node run comes back with. */
export interface RunNodeResponse {
  itemId: string;
  result: BoardItemResult | null;
  runError: string | null;
  runState: RunState;
  /** True when nothing had changed, so the stored result was returned as-is. */
  skipped: boolean;
  /**
   * Wired images an image model could not read, and so did not run.
   *
   * Vectors are dropped from a batch rather than failing it — a frame with one
   * vectorised logo in it is an ordinary board — but a batch that quietly does
   * nineteen of twenty jobs is worse than one that fails, so the count travels
   * back and is reported.
   */
  skippedVectors?: number;
  /**
   * How many variations this node's wiring and settings describe.
   *
   * The client discovers the batch size from the first response rather than
   * computing it, so the server stays the one authority on how many paid runs
   * a node amounts to.
   */
  variationCount?: number;
}

/** A node run that failed, with the batch size it failed inside. */
export interface RunNodeFailure extends Error {
  /** How many jobs the run describes, known even when the first one failed. */
  variationCount?: number;
}

const TRAILING_SLASH = /\/$/;
const DOCTYPE_TAG = /<!DOCTYPE/i;
const HTML_TAG = /<html[\s>]/i;
const UNAUTHORIZED = /unauthor/i;
const EMAIL_LOCAL_SEPARATORS = /[._-]+/;

export const apiBase = (): string => {
  // Dev: always same-origin. Vite proxies /api → vercel dev :3000.
  // Port 3000 (vercel) hits its own handlers directly. Either port works.
  if (import.meta.env.DEV) {
    return "";
  }
  // Unset variables arrive as `undefined`, not `null`, and an unset one is the
  // normal production case: same-origin `/api`. Stringifying it first produced
  // the literal "undefined", so every call went to `/undefined/api/...`, which
  // the SPA catch-all answered with index.html — a 200 full of HTML that failed
  // to parse as JSON. Narrow to a non-empty string instead of comparing to null.
  //
  // The literal "undefined" is rejected too: a dashboard env var set from an
  // empty shell variable stores that exact text, and it is never a valid host.
  const raw = import.meta.env.VITE_API_BASE_URL;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed === "" || trimmed === "undefined") {
    return "";
  }
  return trimmed.replace(TRAILING_SLASH, "");
};

const photosPath = (): string => `${apiBase()}/api/photos`;
const categoriesPath = (): string => `${apiBase()}/api/categories`;
const uploadPath = (): string => `${apiBase()}/api/upload`;
const dailyChallengePath = (): string => `${apiBase()}/api/daily-challenge`;
const dailyChallengeHistoryPath = (): string =>
  `${apiBase()}/api/daily-challenge/history`;

/** Persists across iOS PWA launches; sessionStorage did not. */
const ADMIN_TOKEN_KEY = "cyan_admin_token";

const readStoredToken = (): string | null => {
  try {
    const persisted = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (persisted) {
      return persisted;
    }
    const legacy = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (legacy) {
      localStorage.setItem(ADMIN_TOKEN_KEY, legacy);
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      return legacy;
    }
    return null;
  } catch {
    try {
      return sessionStorage.getItem(ADMIN_TOKEN_KEY);
    } catch {
      return null;
    }
  }
};

const writeStoredToken = (token: string | null): void => {
  try {
    if (token) {
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    } else {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  } catch {
    try {
      if (token) {
        sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
      } else {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      }
    } catch {
      /* storage unavailable (e.g. locked down mode) */
    }
  }
};

const getAuthToken = (): string | null => readStoredToken();

export interface AuthenticatedUser {
  /**
   * A human-readable name for the signed-in admin.
   *
   * Derived from the address because the token carries no name field — there is
   * nowhere else to get one without adding a column and a settings screen. Note
   * this is the *person signed in*, which is not the same as the site owner in
   * site settings: one person may administer either site.
   */
  displayName: string;
  email: string;
  id: string;
}

/** "dallas.peters@example.com" → "Dallas Peters". */
const nameFromEmail = (email: string): string => {
  const local = email.split("@")[0] ?? "";
  const words = local
    .split(EMAIL_LOCAL_SEPARATORS)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  // An address with nothing usable before the @ still needs to render something.
  return words.join(" ") || email;
};

const getStoredUser = (): AuthenticatedUser | null => {
  const token = getAuthToken();
  if (!token) {
    return null;
  }

  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return null;
    }
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    ) as {
      sub?: unknown;
      email?: unknown;
    };
    if (
      typeof decoded.sub !== "string" ||
      !decoded.sub ||
      typeof decoded.email !== "string"
    ) {
      return null;
    }
    return {
      displayName: nameFromEmail(decoded.email),
      email: decoded.email,
      id: decoded.sub,
    };
  } catch {
    return null;
  }
};

export const jsonHeaders = (): HeadersInit => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const devApiHintLocal =
  "Run `pnpm dev`, then open the URL Vercel prints (usually http://localhost:3000). `pnpm dev:vite` has no `/api`—do not use it for admin. Unset `VITE_API_BASE_URL` locally or rely on `VITE_USE_LOCAL_API=1` from the dev command.";

const devApiHintRemote =
  "You are calling a remote API via `VITE_API_BASE_URL`. If that fails, run `pnpm dev` for full stack or fix deploy / CORS.";

export const portfolioService = {
  addPhoto: async (photo: {
    url: string;
    title: string;
    categoryId: string;
    alt?: string;
    width?: number;
    height?: number;
    lqip?: string;
    exif?: unknown;
  }): Promise<Photo> => {
    const res = await fetch(photosPath(), {
      body: JSON.stringify({
        alt: photo.alt,
        categoryId: photo.categoryId,
        exif: photo.exif,
        height: photo.height,
        lqip: photo.lqip,
        title: photo.title,
        url: photo.url,
        width: photo.width,
      }),
      headers: jsonHeaders(),
      method: "POST",
    });
    const data = (await res.json().catch(() => ({}))) as Photo & {
      error?: string;
      debug?: string;
    };
    if (!res.ok) {
      const base = data.error || "Could not add photo";
      const hint =
        import.meta.env.DEV &&
        typeof data.debug === "string" &&
        data.debug.trim()
          ? ` (${data.debug})`
          : "";
      throw new Error(base + hint);
    }
    return data as Photo;
  },

  batchDeletePhotos: async (photoIds: string[]): Promise<number> => {
    const res = await fetch(`${photosPath()}/batch-delete`, {
      body: JSON.stringify({ photoIds }),
      headers: jsonHeaders(),
      method: "POST",
    });
    const data = (await res.json().catch(() => ({}))) as {
      deleted?: number;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || "Could not delete photos");
    }
    return typeof data.deleted === "number" ? data.deleted : 0;
  },

  batchSetPhotoCategories: async (
    photoIds: string[],
    categoryId: string
  ): Promise<number> => {
    const res = await fetch(`${photosPath()}/batch`, {
      body: JSON.stringify({ categoryId, photoIds }),
      headers: jsonHeaders(),
      method: "POST",
    });
    const data = (await res.json().catch(() => ({}))) as {
      updated?: number;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || "Could not update categories");
    }
    return typeof data.updated === "number" ? data.updated : 0;
  },

  createCategory: async (input: {
    label: string;
    slug?: string;
    sortOrder: number;
  }): Promise<Category> => {
    const res = await fetch(categoriesPath(), {
      body: JSON.stringify({
        label: input.label,
        ...(input.slug ? { slug: input.slug } : {}),
        sortOrder: input.sortOrder,
      }),
      headers: jsonHeaders(),
      method: "POST",
    });
    const data = (await res.json().catch(() => ({}))) as Category & {
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || "Could not create category");
    }
    return data as Category;
  },

  deleteCategory: async (id: string): Promise<void> => {
    const res = await fetch(`${categoriesPath()}/${encodeURIComponent(id)}`, {
      headers: jsonHeaders(),
      method: "DELETE",
    });
    if (res.status === 204 || res.status === 404) {
      return;
    }
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      detail?: string;
    };
    const msg = [data.error, data.detail].filter(Boolean).join(" ");
    throw new Error(msg || "Could not delete category");
  },

  deleteJournalEntry: async (date: string): Promise<void> => {
    const res = await fetch(dailyChallengeHistoryPath(), {
      body: JSON.stringify({ date }),
      headers: jsonHeaders(),
      method: "DELETE",
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      throw new Error(data.error || "Could not delete journal entry");
    }
  },

  deletePhoto: async (id: string): Promise<void> => {
    const res = await fetch(`${photosPath()}/${encodeURIComponent(id)}`, {
      headers: jsonHeaders(),
      method: "DELETE",
    });
    if (res.status === 204 || res.status === 404) {
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Could not delete photo");
  },

  getCategories: async (): Promise<Category[]> => {
    const res = await fetch(categoriesPath());
    if (!res.ok) {
      const detail = import.meta.env.DEV ? ` (${res.status})` : "";
      throw new Error(`Failed to load categories${detail}`);
    }
    return res.json() as Promise<Category[]>;
  },

  getDailyChallenge: async (): Promise<DailyChallengeResponse> => {
    const res = await fetch(dailyChallengePath(), { headers: jsonHeaders() });
    const data = (await res
      .json()
      .catch(() => ({}))) as DailyChallengeResponse & { error?: string };
    if (!res.ok) {
      throw new Error(data.error || "Could not load daily challenge");
    }
    return data as DailyChallengeResponse;
  },

  getDailyChallengeHistory: async (): Promise<DailyChallengeHistoryEntry[]> => {
    const res = await fetch(dailyChallengeHistoryPath(), {
      headers: jsonHeaders(),
    });
    const data = (await res.json().catch(() => ({}))) as {
      entries?: DailyChallengeHistoryEntry[];
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || "Could not load journal history");
    }
    return data.entries ?? [];
  },
  getPhotos: async (): Promise<Photo[]> => {
    let res: Response;
    try {
      res = await fetch(photosPath());
    } catch (cause) {
      if (import.meta.env.DEV) {
        const url = photosPath();
        const hint = url.startsWith("http")
          ? devApiHintRemote
          : devApiHintLocal;
        throw new Error(`Could not reach ${url}. ${hint}`, { cause });
      }
      throw new Error("Failed to load portfolio", { cause });
    }
    if (!res.ok) {
      const detail = import.meta.env.DEV
        ? ` (${res.status} ${res.statusText})`
        : "";
      throw new Error(`Failed to load portfolio${detail}`);
    }
    return res.json() as Promise<Photo[]>;
  },

  notifyCategoriesChanged: () => {
    window.dispatchEvent(new CustomEvent("cyan-categories-changed"));
  },

  notifyPhotosChanged: () => {
    window.dispatchEvent(new CustomEvent("cyan-photos-changed"));
  },

  refreshDailyChallenge: async (): Promise<DailyChallengeResponse> => {
    const res = await fetch(dailyChallengePath(), {
      headers: jsonHeaders(),
      method: "POST",
    });
    const data = (await res
      .json()
      .catch(() => ({}))) as DailyChallengeResponse & { error?: string };
    if (!res.ok) {
      throw new Error(data.error || "Could not load a new challenge photo");
    }
    return data as DailyChallengeResponse;
  },

  /**
   * Saves a new order for the photographs given, and only those.
   *
   * Sends ids rather than positions because the server permutes them through
   * the slots they already hold — see api/photos/reorder.ts.
   */
  reorderPhotos: async (photoIds: string[]): Promise<void> => {
    const res = await fetch(`${photosPath()}/reorder`, {
      body: JSON.stringify({ photoIds }),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(json.error || "Could not save the new order");
    }
  },

  saveDailyChallengeJournal: async (
    body: string
  ): Promise<DailyChallengeJournal> => {
    const res = await fetch(dailyChallengePath(), {
      body: JSON.stringify({ body }),
      headers: jsonHeaders(),
      method: "PUT",
    });
    const data = (await res.json().catch(() => ({}))) as {
      journal?: DailyChallengeJournal;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || "Could not save journal");
    }
    if (!data.journal) {
      throw new Error("Invalid response from server");
    }
    return data.journal;
  },

  saveDailyChallengeJournalForDate: async (
    date: string,
    body: string
  ): Promise<DailyChallengeJournal> => {
    const res = await fetch(dailyChallengeHistoryPath(), {
      body: JSON.stringify({ body, date }),
      headers: jsonHeaders(),
      method: "PUT",
    });
    const data = (await res.json().catch(() => ({}))) as {
      journal?: DailyChallengeJournal;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || "Could not save journal");
    }
    if (!data.journal) {
      throw new Error("Invalid response from server");
    }
    return data.journal;
  },

  updatePhoto: async (
    id: string,
    data: {
      title: string;
      categoryId: string;
      order: number;
      url?: string;
      /**
       * Omit to leave the stored EXIF alone; null clears it. Sent only when the
       * caller is actually editing it, so renaming a photo cannot wipe the
       * shooting details read off the file.
       */
      exif?: PhotoExifData | null;
      /** Omit to leave the photograph's visibility as it is. */
      isPublished?: boolean;
    }
  ): Promise<Photo> => {
    const res = await fetch(`${photosPath()}/${encodeURIComponent(id)}`, {
      body: JSON.stringify({
        categoryId: data.categoryId,
        order: data.order,
        title: data.title,
        ...(data.url ? { url: data.url } : {}),
        ...(data.exif === undefined ? {} : { exif: data.exif }),
        ...(data.isPublished === undefined
          ? {}
          : { isPublished: data.isPublished }),
      }),
      headers: jsonHeaders(),
      method: "PATCH",
    });
    const json = (await res.json().catch(() => ({}))) as Photo & {
      error?: string;
    };
    if (!res.ok) {
      throw new Error(json.error || "Could not update photo");
    }
    return json as Photo;
  },

  /**
   * Uploads directly to Vercel Blob.
   *
   * The bytes bypass the serverless function entirely — it only signs the
   * transfer — so there is no meaningful size ceiling. The previous
   * base64-through-JSON approach failed with an opaque 413 above roughly
   * 3.3MB, which is smaller than a typical camera JPEG.
   */
  uploadImageFile: async (
    file: File,
    onProgress?: (percent: number) => void,
    /**
     * Folder in the blob store. Board drops pass "boards/uploads" so working
     * material is not filed among the portfolio's own photographs — a board
     * upload is a reference, not something the site publishes.
     */
    prefix = "portfolio"
  ): Promise<{ url: string }> => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/avif",
      // SVG, so a vector dropped onto a board can be kept as a vector — the
      // same allowance the server's upload handler now makes.
      "image/svg+xml",
    ] as const;
    if (!(file.type && (allowed as readonly string[]).includes(file.type))) {
      throw new Error("Choose a JPEG, PNG, WebP, AVIF, GIF or SVG image");
    }

    const token = getAuthToken();
    if (!token) {
      throw new Error("Sign in again to upload");
    }

    const { upload } = await import("@vercel/blob/client");

    try {
      const blob = await upload(`${prefix}/${file.name || "image"}`, file, {
        access: "public",
        // The upload helper posts straight to the handler, so the session token
        // rides along here instead of in an Authorization header.
        clientPayload: token,
        contentType: file.type,
        handleUploadUrl: uploadPath(),
        onUploadProgress: onProgress
          ? ({ percentage }) => onProgress(Math.round(percentage))
          : undefined,
      });
      return { url: blob.url };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      throw new Error(
        UNAUTHORIZED.test(message)
          ? "Sign in again to upload"
          : `Upload failed: ${message}`,
        { cause: err }
      );
    }
  },
};

export const settingsApi = {
  /** Public read of the live site content and theme. */
  get: async (): Promise<ResolvedSiteSettings> => {
    const res = await fetch(`${apiBase()}/api/site-settings`);
    if (!res.ok) {
      throw new Error(`Could not load site settings (${res.status})`);
    }
    return (await res.json()) as ResolvedSiteSettings;
  },

  /** Admin write. Returns the re-read settings, not an echo of the input. */
  update: async (
    input: Partial<ResolvedSiteSettings>,
    token: string
  ): Promise<ResolvedSiteSettings> => {
    const res = await fetch(`${apiBase()}/api/site-settings`, {
      body: JSON.stringify(input),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });
    const data = (await res.json().catch(() => ({}))) as
      | ResolvedSiteSettings
      | { error?: string };
    if (!res.ok) {
      throw new Error(
        ("error" in data && data.error) ||
          `Could not save settings (${res.status})`
      );
    }
    return data as ResolvedSiteSettings;
  },
};

export const authStorage = {
  getToken: readStoredToken,
  getUser: getStoredUser,
  setToken: writeStoredToken,
};

export const authApi = {
  /** Changes the signed-in user's password, after checking the current one. */
  changePassword: async (
    currentPassword: string,
    newPassword: string
  ): Promise<void> => {
    const res = await fetch(`${apiBase()}/api/auth/change-password`, {
      body: JSON.stringify({
        currentPassword,
        newPassword,
      }),
      headers: jsonHeaders(),
      method: "POST",
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!res.ok) {
      throw new Error(
        data.error || `Could not change password (${res.status})`
      );
    }
  },
  login: async (
    email: string,
    password: string
  ): Promise<{ token: string }> => {
    const url = `${apiBase()}/api/auth/login`;
    let res: Response;
    try {
      res = await fetch(url, {
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
    } catch (cause) {
      throw new Error(
        `Could not reach ${url}. Run \`pnpm dev\` and use the Vercel URL (e.g. http://localhost:3006), or check VITE_API_BASE_URL.`,
        { cause }
      );
    }

    const text = await res.text();
    let data: { token?: string; error?: string };
    try {
      data = JSON.parse(text) as { token?: string; error?: string };
    } catch (parseError) {
      const looksHtml =
        DOCTYPE_TAG.test(text) ||
        HTML_TAG.test(text) ||
        (text.length > 0 && text.trimStart().startsWith("<"));
      const base = apiBase();
      const href =
        typeof window !== "undefined" && url.startsWith("/")
          ? new URL(url, window.location.origin).href
          : url;
      // Three distinct causes, each needing different advice — flattened out of
      // nested ternaries so each branch reads on its own.
      let detail = " Is the API running?";
      if (looksHtml && base === "") {
        detail =
          " The body was HTML (typical when you opened the Vite port instead of Vercel, or the API is down). Run `pnpm dev` and use http://localhost:3006 (see CLI). For Vite-only + separate API, set `VITE_API_PROXY_TARGET`.";
      } else if (looksHtml) {
        detail =
          " The body was HTML instead of JSON. Confirm `VITE_API_BASE_URL` points at a host that serves `POST /api/auth/login`.";
      }
      throw new Error(
        `Login failed (${res.status}): not JSON from ${href}.${detail}`,
        { cause: parseError }
      );
    }

    if (!res.ok) {
      throw new Error(data.error || `Login failed (${res.status})`);
    }
    if (!data.token) {
      throw new Error("Invalid response from server (no token)");
    }
    return { token: data.token };
  },

  /**
   * Exchanges a Google ID token for a session. Rejects when the Google account's
   * address has no admin user — Google sign-in authenticates, it does not enrol.
   */
  loginWithGoogle: async (credential: string): Promise<{ token: string }> => {
    const res = await fetch(`${apiBase()}/api/auth/google`, {
      body: JSON.stringify({ credential }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const data = (await res.json().catch(() => ({}))) as {
      token?: string;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || `Google sign-in failed (${res.status})`);
    }
    if (!data.token) {
      throw new Error("Invalid response from server (no token)");
    }
    return { token: data.token };
  },

  /**
   * Requests a reset link. Resolves with the server's neutral message whether or
   * not the address has an account — the API deliberately does not say which.
   */
  requestPasswordReset: async (email: string): Promise<{ message: string }> => {
    const res = await fetch(`${apiBase()}/api/auth/forgot-password`, {
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const data = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(
        data.error || `Could not send reset email (${res.status})`
      );
    }
    return {
      message:
        data.message ??
        "If that email has an account, a reset link is on its way.",
    };
  },

  /** Exchanges a reset token for a new password, returning a session token. */
  resetPassword: async (
    token: string,
    password: string
  ): Promise<{ token: string }> => {
    const res = await fetch(`${apiBase()}/api/auth/reset-password`, {
      body: JSON.stringify({ password, token }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const data = (await res.json().catch(() => ({}))) as {
      token?: string;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || `Could not reset password (${res.status})`);
    }
    if (!data.token) {
      throw new Error("Invalid response from server (no token)");
    }
    return { token: data.token };
  },
};

export interface PageSummary {
  icon: string | null;
  id: string;
  order: number;
  slug: string;
  title: string;
}

export type PageRecord = PageSummary & {
  content: unknown;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
};

const pagesPath = (): string => `${apiBase()}/api/pages`;

const readPageError = async (
  res: Response,
  fallback: string
): Promise<string> => {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error || `${fallback} (${res.status})`;
};

export const pagesApi = {
  create: async (input: {
    title: string;
    slug: string;
    icon?: string | null;
    status?: "draft" | "published";
  }): Promise<PageRecord> => {
    const res = await fetch(pagesPath(), {
      body: JSON.stringify(input),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not create page"));
    }
    return (await res.json()) as PageRecord;
  },

  get: async (slug: string): Promise<PageRecord> => {
    const res = await fetch(`${pagesPath()}/${encodeURIComponent(slug)}`, {
      headers: jsonHeaders(),
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not load page"));
    }
    return (await res.json()) as PageRecord;
  },
  /** Published summaries for the public nav; every page when signed in. */
  list: async (): Promise<PageSummary[]> => {
    const res = await fetch(pagesPath(), { headers: jsonHeaders() });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not load pages"));
    }
    return (await res.json()) as PageSummary[];
  },

  remove: async (slug: string): Promise<void> => {
    const res = await fetch(`${pagesPath()}/${encodeURIComponent(slug)}`, {
      headers: jsonHeaders(),
      method: "DELETE",
    });
    if (res.status === 204 || res.status === 404) {
      return;
    }
    throw new Error(await readPageError(res, "Could not delete page"));
  },

  update: async (
    slug: string,
    input: Partial<
      Pick<
        PageRecord,
        "title" | "slug" | "icon" | "status" | "content" | "order"
      >
    >
  ): Promise<PageRecord> => {
    const res = await fetch(`${pagesPath()}/${encodeURIComponent(slug)}`, {
      body: JSON.stringify(input),
      headers: jsonHeaders(),
      method: "PATCH",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not save page"));
    }
    return (await res.json()) as PageRecord;
  },
};

const boardsPath = (): string => `${apiBase()}/api/boards`;

const boardUrl = (id: string): string =>
  `${boardsPath()}/${encodeURIComponent(id)}`;

export const boardsApi = {
  /**
   * Copies a picture we merely link to into storage we own, and returns the
   * new address. An image already in our storage comes back unchanged.
   *
   * Needed before a canvas can read a picture back: a host that sends no CORS
   * headers taints the canvas, and reading it throws — see api/boards/adopt.ts.
   */
  adopt: async (url: string): Promise<string> => {
    const res = await fetch(`${apiBase()}/api/boards/adopt`, {
      body: JSON.stringify({ url }),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "That image could not be used"));
    }
    return ((await res.json()) as { url: string }).url;
  },

  create: async (title: string): Promise<Board> => {
    const res = await fetch(boardsPath(), {
      body: JSON.stringify({ title }),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not create board"));
    }
    return (await res.json()) as Board;
  },
  /**
   * Deletes one version from a node's history.
   *
   * Its own call because `result` is not written by the board save — see
   * api/boards/[id]/version.ts for why that column is left alone.
   */
  deleteVersion: async (
    boardId: string,
    itemId: string,
    index: number
  ): Promise<BoardItemResult | null> => {
    const res = await fetch(`${apiBase()}/api/boards/${boardId}/version`, {
      body: JSON.stringify({ index, itemId }),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(
        await readPageError(res, "Could not remove that version")
      );
    }
    return ((await res.json()) as { result: BoardItemResult | null }).result;
  },

  /**
   * Packs everything a node made — or everything a frame holds — into one zip
   * and returns where to fetch it.
   *
   * Zipped on the server because the files are already ours and already
   * remote: the browser would have to pull every one down just to push it back
   * up again.
   */
  exportItem: async (
    boardId: string,
    itemId: string
  ): Promise<{ count: number; skipped: number; url: string }> => {
    const res = await fetch(`${boardUrl(boardId)}/export`, {
      body: JSON.stringify({ itemId }),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not build the archive"));
    }
    return (await res.json()) as {
      count: number;
      skipped: number;
      url: string;
    };
  },

  /**
   * Saves on the way out of the page.
   *
   * keepalive lets the request outlive the document; a normal fetch is
   * cancelled the instant the page goes away, which is precisely when the last
   * unsaved second of work needs to survive.
   */
  flush: (id: string, items: BoardItem[], wires: BoardWire[] = []): void => {
    const token = getAuthToken();
    if (!token) {
      return;
    }
    void fetch(boardUrl(id), {
      body: JSON.stringify({ items, wires }),
      headers: jsonHeaders(),
      keepalive: true,
      method: "PATCH",
    }).catch(() => undefined);
  },

  get: async (id: string): Promise<Board> => {
    const res = await fetch(boardUrl(id), { headers: jsonHeaders() });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not load board"));
    }
    return (await res.json()) as Board;
  },

  list: async (): Promise<Board[]> => {
    const res = await fetch(boardsPath(), { headers: jsonHeaders() });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not load boards"));
    }
    return (await res.json()) as Board[];
  },

  remove: async (id: string): Promise<void> => {
    const res = await fetch(boardUrl(id), {
      headers: jsonHeaders(),
      method: "DELETE",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not delete board"));
    }
  },

  /**
   * Runs one node and returns what it produced.
   *
   * One request per node, orchestrated by the canvas, because a single
   * generation already budgets close to two minutes against a serverless
   * ceiling — a whole graph could never fit in one call. `signal` is how a
   * cancelled board run abandons the request in flight.
   */
  runNode: async (
    boardId: string,
    itemId: string,
    options: {
      force?: boolean;
      signal?: AbortSignal;
      /** Which variation of a batch to produce; one request each. */
      variation?: number;
    } = {}
  ): Promise<RunNodeResponse> => {
    const res = await fetch(`${boardUrl(boardId)}/run`, {
      body: JSON.stringify({
        force: options.force ?? false,
        itemId,
        variation: options.variation ?? 0,
      }),
      headers: jsonHeaders(),
      method: "POST",
      ...(options.signal ? { signal: options.signal } : {}),
    });
    if (!res.ok) {
      // The batch size rides along even on a failure, so the caller can keep
      // running the jobs that did not fail — a flaky model on one job must not
      // sink the other fifteen.
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        variationCount?: number;
      };
      const failure = new Error(
        body.error || `Could not run this node (${res.status})`
      ) as RunNodeFailure;
      if (typeof body.variationCount === "number") {
        failure.variationCount = body.variationCount;
      }
      throw failure;
    }
    return (await res.json()) as RunNodeResponse;
  },

  /**
   * Saves the board. Passing `items` replaces the whole arrangement, so the
   * canvas must send every item it still has — anything omitted is deleted.
   * `wires` works the same way.
   *
   * Run results are deliberately not sent back: the server owns them, and a
   * save in flight when a generation lands must not overwrite what arrived.
   */
  update: async (
    id: string,
    input: {
      title?: string;
      isPublic?: boolean;
      coverUrl?: string;
      items?: BoardItem[];
      sources?: BoardSource[];
      wires?: BoardWire[];
    }
  ): Promise<Board> => {
    const res = await fetch(boardUrl(id), {
      body: JSON.stringify(input),
      headers: jsonHeaders(),
      method: "PATCH",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not save board"));
    }
    return (await res.json()) as Board;
  },

  /**
   * Writes an SVG edited in Affinity back onto a node as a new version.
   *
   * Its own call because `result` is not written by the board save — see
   * api/boards/[id]/svg.ts for why that column is left alone.
   */
  writebackSvg: async (
    boardId: string,
    itemId: string,
    svg: string
  ): Promise<AffinityWriteback> => {
    const res = await fetch(`${apiBase()}/api/boards/${boardId}/svg`, {
      body: JSON.stringify({ itemId, svg }),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(
        await readPageError(res, "Could not save the edited SVG")
      );
    }
    return (await res.json()) as AffinityWriteback;
  },
};

export interface UnsplashResult {
  altText: string | null;
  /** Required wherever the photograph is shown. */
  creditName: string;
  creditUrl: string;
  downloadLocation: string | null;
  id: string;
  imageUrl: string;
  thumbUrl: string;
}

export const unsplashApi = {
  search: async (query: string): Promise<UnsplashResult[]> => {
    const res = await fetch(
      `${apiBase()}/api/unsplash/search?q=${encodeURIComponent(query)}`,
      { headers: jsonHeaders() }
    );
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not search Unsplash"));
    }
    const data = (await res.json()) as { results: UnsplashResult[] };
    return data.results;
  },

  /**
   * Tells Unsplash a photo was used, which their terms require.
   *
   * Deliberately not awaited by callers and never surfaced: crediting usage
   * must not stand between the photographer's image and the board.
   */
  trackDownload: (downloadLocation: string | null): void => {
    if (!downloadLocation) {
      return;
    }
    void fetch(`${apiBase()}/api/unsplash/search`, {
      body: JSON.stringify({ downloadLocation }),
      headers: jsonHeaders(),
      method: "POST",
    }).catch(() => undefined);
  },
};

export interface GeneratedImage {
  description: string | null;
  height: number | null;
  url: string;
  width: number | null;
}

export interface GeneratedIcon {
  /**
   * False when Magnific's vectoriser was unavailable and the icon came back as
   * a raster instead. Worth saying out loud rather than silently handing over
   * something other than what was asked for.
   */
  isVector: boolean;
  url: string;
}

/** A pin, reduced to what a board item needs. */
export interface PinResult {
  altText: string | null;
  creditName: string | null;
  /** The pin itself, so the board links back to where the image came from. */
  creditUrl: string;
  imageUrl: string;
  thumbUrl: string | null;
}

/** A whole board, as its RSS feed lists it. */
export interface BoardResult {
  pins: PinResult[];
  title: string | null;
}

/** One picture the fal account has already made. */
export interface FalLibraryItem {
  contentType: string | null;
  createdAt: string;
  endpoint: string;
  id: string;
  /** What to render: the fal URL, or an inlined data URI for vector output. */
  previewUrl: string;
  prompt: string | null;
  url: string;
}

export interface FalLibraryPage {
  hasMore: boolean;
  items: FalLibraryItem[];
}

/**
 * The fal account's own generation history, as a library to pull from.
 *
 * Everything made with the key, including work done in fal's own playground —
 * so it reaches things this app never saw. Reading it needs the key, which is
 * why it goes through our server rather than straight to fal.
 */
export const falLibraryApi = {
  /**
   * Adopts a picture into our storage and returns the durable URL.
   *
   * Not optional: fal serves output from a scratch host, so pinning its URL to
   * a board would leave a broken image behind once the link lapses.
   */
  adopt: async (item: FalLibraryItem): Promise<string> => {
    const res = await fetch(`${apiBase()}/api/fal/library`, {
      body: JSON.stringify({ contentType: item.contentType, url: item.url }),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not save that image"));
    }
    return ((await res.json()) as { url: string }).url;
  },

  list: async (page = 1): Promise<FalLibraryPage> => {
    const res = await fetch(`${apiBase()}/api/fal/library?page=${page}`, {
      headers: jsonHeaders(),
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not read your library"));
    }
    return (await res.json()) as FalLibraryPage;
  },
};

/** One image found on a published Framer page. */
export interface FramerImage {
  altText: string | null;
  imageUrl: string;
  thumbUrl: string;
}

export interface FramerPageResult {
  images: FramerImage[];
  notice?: string;
  title: string | null;
}

/**
 * The images on a published Framer page.
 *
 * Reads the published site rather than the Framer project: Framer's Server API
 * documents nothing for listing a project's assets, and a published page is a
 * normal website that works on any custom domain with no key at all.
 */
export const framerApi = {
  page: async (url: string): Promise<FramerPageResult> => {
    const res = await fetch(`${apiBase()}/api/framer/page`, {
      body: JSON.stringify({ url }),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not read that page"));
    }
    return (await res.json()) as FramerPageResult;
  },
};

/** What the Drive picker needs to start. Admin-only, never in the bundle. */
export interface PickerConfig {
  apiKey: string;
  clientId: string;
}

export const googleApi = {
  /**
   * Fetches the picker's credentials at the moment they are needed.
   *
   * Not build-time constants: a VITE_ variable is compiled into the public
   * bundle and ships to every visitor. This keeps them behind the admin
   * session instead.
   */
  pickerConfig: async (): Promise<PickerConfig> => {
    const res = await fetch(`${apiBase()}/api/google/picker-config`, {
      headers: jsonHeaders(),
    });
    if (!res.ok) {
      throw new Error(
        await readPageError(res, "Google Drive is not configured")
      );
    }
    return (await res.json()) as PickerConfig;
  },
};

export const pinterestApi = {
  /**
   * Every pin a board publishes, from its public RSS feed.
   *
   * A feed carries a page of recent pins rather than the whole history, so a
   * long board comes back partial. Reading past that needs an approved app.
   */
  board: async (url: string): Promise<BoardResult> => {
    const res = await fetch(`${apiBase()}/api/pinterest/board`, {
      body: JSON.stringify({ url }),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not read that board"));
    }
    return (await res.json()) as BoardResult;
  },

  /** Resolves a single pasted pin link. */
  resolve: async (url: string): Promise<PinResult> => {
    const res = await fetch(`${apiBase()}/api/pinterest/pin`, {
      body: JSON.stringify({ url }),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not read that pin"));
    }
    return (await res.json()) as PinResult;
  },
};

export const aiApi = {
  /**
   * Generates an image, or a variation of `sourceImageUrl` when given one.
   *
   * The returned URL is already stored on our own blob host — fal serves
   * results from a temporary location that would expire under the board.
   */
  generate: async (
    prompt: string,
    sourceImageUrl?: string | null
  ): Promise<GeneratedImage> => {
    const res = await fetch(`${apiBase()}/api/ai/generate`, {
      body: JSON.stringify({ prompt, sourceImageUrl }),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not generate an image"));
    }
    return (await res.json()) as GeneratedImage;
  },

  /**
   * Generates an SVG icon.
   *
   * Separate from `generate` rather than a flag on it: this is a different
   * service, produces vector rather than raster, and takes a style instead of a
   * source image. The URL is already on our own blob host, since Magnific signs
   * its links with an expiry.
   */
  generateIcon: async (
    prompt: string,
    style: IconStyle
  ): Promise<GeneratedIcon> => {
    const res = await fetch(`${apiBase()}/api/ai/icon`, {
      body: JSON.stringify({ prompt, style }),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not generate an icon"));
    }
    return (await res.json()) as GeneratedIcon;
  },
};

export interface VercelProjectSummary {
  framework: string | null;
  id: string;
  /** Required variables the project still lacks; empty means it is ready. */
  missing: string[];
  name: string;
}

export interface ProvisionInput {
  domain?: string;
  emailFrom?: string;
  heroTitle?: string;
  name: string;
  ownerName?: string;
  repo: string;
  shortName?: string;
  siteKey: string;
  siteName?: string;
  tagline?: string;
}

export interface ProvisionResult {
  id: string;
  name: string;
  /** What provisioning could not do, stated rather than implied. */
  remaining: string[];
}

const provisionPath = (): string => `${apiBase()}/api/sites/provision`;

export const sitesApi = {
  create: async (input: ProvisionInput): Promise<ProvisionResult> => {
    const res = await fetch(provisionPath(), {
      body: JSON.stringify(input),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not create the site"));
    }
    return (await res.json()) as ProvisionResult;
  },

  listProjects: async (): Promise<VercelProjectSummary[]> => {
    const res = await fetch(provisionPath(), { headers: jsonHeaders() });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not load projects"));
    }
    const data = (await res.json()) as { projects: VercelProjectSummary[] };
    return data.projects;
  },
};

export interface SetupResult {
  done: string[];
  remaining: string[];
}

export const siteSetupApi = {
  /**
   * Creates storage and secrets for a project. Safe to re-run: existing values
   * are left alone rather than rotated.
   */
  run: async (
    projectId: string,
    databaseUrl?: string,
    env?: Record<string, string>
  ): Promise<SetupResult> => {
    const res = await fetch(`${apiBase()}/api/sites/setup`, {
      body: JSON.stringify({ databaseUrl, env, projectId }),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Setup failed"));
    }
    return (await res.json()) as SetupResult;
  },
};

const elementsPath = (): string => `${apiBase()}/api/elements`;

/**
 * The library of styles, which belongs to nobody's board.
 *
 * Separate from boardsApi because an element outlives the board it was found
 * on: deleting that board must not take the style with it, and the same element
 * is meant to turn up on the next board and the one after.
 */
export const elementsApi = {
  /**
   * Saves a selection as an element.
   *
   * The pictures are sent as the addresses they already have and copied into
   * our own storage by the endpoint, not here — the browser cannot read the
   * bytes of a Pinterest image at all, which is the same wall api/boards/adopt.ts
   * exists to get past.
   */
  create: async (input: {
    coverUrl: string | null;
    description: string;
    imageUrls: string[];
    name: string;
  }): Promise<Element & { dropped?: number }> => {
    const res = await fetch(elementsPath(), {
      body: JSON.stringify(input),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not save that element"));
    }
    return (await res.json()) as Element & { dropped?: number };
  },

  list: async (): Promise<Element[]> => {
    const res = await fetch(elementsPath(), { headers: jsonHeaders() });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not load elements"));
    }
    return (await res.json()) as Element[];
  },

  remove: async (id: string): Promise<void> => {
    const res = await fetch(`${elementsPath()}/${encodeURIComponent(id)}`, {
      headers: jsonHeaders(),
      method: "DELETE",
    });
    if (!res.ok) {
      throw new Error(
        await readPageError(res, "Could not delete that element")
      );
    }
  },

  update: async (
    id: string,
    input: {
      coverUrl?: string;
      description?: string;
      imageUrls?: string[];
      name?: string;
    }
  ): Promise<Element> => {
    const res = await fetch(`${elementsPath()}/${encodeURIComponent(id)}`, {
      body: JSON.stringify(input),
      headers: jsonHeaders(),
      method: "PATCH",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not save that element"));
    }
    return (await res.json()) as Element;
  },
};

const modelsPath = (): string => `${apiBase()}/api/models`;

/**
 * The models a Generate node may use.
 *
 * Read as data rather than compiled in: adding a model is an admin edit, and
 * this is how the picker and the panel talk to the same table.
 */
export const modelsApi = {
  create: async (input: AiModelInput): Promise<AiModel> => {
    const res = await fetch(modelsPath(), {
      body: JSON.stringify(input),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not add that model"));
    }
    return (await res.json()) as AiModel;
  },

  /** Every model, hidden ones included, for the management panel. */
  list: async (): Promise<AiModel[]> => {
    const res = await fetch(`${modelsPath()}?all=true`, {
      headers: jsonHeaders(),
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not load models"));
    }
    return (await res.json()) as AiModel[];
  },
  /** The enabled models, for the picker. Public, like the ids themselves. */
  listEnabled: async (): Promise<AiModel[]> => {
    const res = await fetch(modelsPath());
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not load models"));
    }
    return (await res.json()) as AiModel[];
  },

  remove: async (id: string): Promise<void> => {
    const res = await fetch(`${modelsPath()}/${encodeURIComponent(id)}`, {
      headers: jsonHeaders(),
      method: "DELETE",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not delete that model"));
    }
  },

  update: async (id: string, input: AiModelInput): Promise<AiModel> => {
    const res = await fetch(`${modelsPath()}/${encodeURIComponent(id)}`, {
      body: JSON.stringify(input),
      headers: jsonHeaders(),
      method: "PATCH",
    });
    if (!res.ok) {
      throw new Error(await readPageError(res, "Could not save that model"));
    }
    return (await res.json()) as AiModel;
  },
};
