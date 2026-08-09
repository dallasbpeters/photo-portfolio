import type { ResolvedSiteSettings } from "../../config/siteSettings";
import type {
  Board,
  BoardItem,
  Category,
  DailyChallengeHistoryEntry,
  DailyChallengeJournal,
  DailyChallengeResponse,
  Photo,
} from "../types";

const TRAILING_SLASH = /\/$/;
const DOCTYPE_TAG = /<!DOCTYPE/i;
const HTML_TAG = /<html[\s>]/i;
const UNAUTHORIZED = /unauthor/i;
const EMAIL_LOCAL_SEPARATORS = /[._-]+/;

const apiBase = (): string => {
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

const jsonHeaders = (): HeadersInit => {
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
    data: { title: string; categoryId: string; order: number; url?: string }
  ): Promise<Photo> => {
    const res = await fetch(`${photosPath()}/${encodeURIComponent(id)}`, {
      body: JSON.stringify({
        categoryId: data.categoryId,
        order: data.order,
        title: data.title,
        ...(data.url ? { url: data.url } : {}),
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
    onProgress?: (percent: number) => void
  ): Promise<{ url: string }> => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/avif",
    ] as const;
    if (!(file.type && (allowed as readonly string[]).includes(file.type))) {
      throw new Error("Choose a JPEG, PNG, WebP, AVIF or GIF image");
    }

    const token = getAuthToken();
    if (!token) {
      throw new Error("Sign in again to upload");
    }

    const { upload } = await import("@vercel/blob/client");

    try {
      const blob = await upload(`portfolio/${file.name || "image"}`, file, {
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
   * Saves on the way out of the page.
   *
   * keepalive lets the request outlive the document; a normal fetch is
   * cancelled the instant the page goes away, which is precisely when the last
   * unsaved second of work needs to survive.
   */
  flush: (id: string, items: BoardItem[]): void => {
    const token = getAuthToken();
    if (!token) {
      return;
    }
    void fetch(boardUrl(id), {
      body: JSON.stringify({ items }),
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
   * Saves the board. Passing `items` replaces the whole arrangement, so the
   * canvas must send every item it still has — anything omitted is deleted.
   */
  update: async (
    id: string,
    input: {
      title?: string;
      isPublic?: boolean;
      coverUrl?: string;
      items?: BoardItem[];
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
};
