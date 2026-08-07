import type { Category, DailyChallengeHistoryEntry, DailyChallengeJournal, DailyChallengeResponse, Photo } from '../types';

const apiBase = (): string => {
  // Dev: always same-origin. Vite proxies /api → vercel dev :3000.
  // Port 3000 (vercel) hits its own handlers directly. Either port works.
  if (import.meta.env.DEV) return '';
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (raw == null || String(raw).trim() === '') return '';
  return String(raw).replace(/\/$/, '');
};

const photosPath = (): string => `${apiBase()}/api/photos`;
const categoriesPath = (): string => `${apiBase()}/api/categories`;
const uploadPath = (): string => `${apiBase()}/api/upload`;
const dailyChallengePath = (): string => `${apiBase()}/api/daily-challenge`;
const dailyChallengeHistoryPath = (): string => `${apiBase()}/api/daily-challenge/history`;

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result as string;
      const comma = r.indexOf(',');
      resolve(comma >= 0 ? r.slice(comma + 1) : r);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
/** Persists across iOS PWA launches; sessionStorage did not. */
const ADMIN_TOKEN_KEY = 'cyan_admin_token';

const readStoredToken = (): string | null => {
  try {
    const persisted = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (persisted) return persisted;
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
      if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
      else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch {
      /* storage unavailable (e.g. locked down mode) */
    }
  }
};

const getAuthToken = (): string | null => readStoredToken();

const jsonHeaders = (): HeadersInit => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

const devApiHintLocal =
  'Run `pnpm dev`, then open the URL Vercel prints (usually http://localhost:3000). `pnpm dev:vite` has no `/api`—do not use it for admin. Unset `VITE_API_BASE_URL` locally or rely on `VITE_USE_LOCAL_API=1` from the dev command.';

const devApiHintRemote =
  'You are calling a remote API via `VITE_API_BASE_URL`. If that fails, run `pnpm dev` for full stack or fix deploy / CORS.';

export const portfolioService = {
  getPhotos: async (): Promise<Photo[]> => {
    let res: Response;
    try {
      res = await fetch(photosPath());
    } catch {
      if (import.meta.env.DEV) {
        const url = photosPath();
        const hint = url.startsWith('http') ? devApiHintRemote : devApiHintLocal;
        throw new Error(`Could not reach ${url}. ${hint}`);
      }
      throw new Error('Failed to load portfolio');
    }
    if (!res.ok) {
      const detail = import.meta.env.DEV ? ` (${res.status} ${res.statusText})` : '';
      throw new Error(`Failed to load portfolio${detail}`);
    }
    return res.json() as Promise<Photo[]>;
  },

  getCategories: async (): Promise<Category[]> => {
    const res = await fetch(categoriesPath());
    if (!res.ok) {
      const detail = import.meta.env.DEV ? ` (${res.status})` : '';
      throw new Error(`Failed to load categories${detail}`);
    }
    return res.json() as Promise<Category[]>;
  },

  createCategory: async (input: {
    label: string;
    slug?: string;
    sortOrder: number;
  }): Promise<Category> => {
    const res = await fetch(categoriesPath(), {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        label: input.label,
        ...(input.slug ? { slug: input.slug } : {}),
        sortOrder: input.sortOrder,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Category & { error?: string };
    if (!res.ok) {
      throw new Error(data.error || 'Could not create category');
    }
    return data as Category;
  },

  deleteCategory: async (id: string): Promise<void> => {
    const res = await fetch(`${categoriesPath()}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: jsonHeaders(),
    });
    if (res.status === 204 || res.status === 404) return;
    const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    const msg = [data.error, data.detail].filter(Boolean).join(' ');
    throw new Error(msg || 'Could not delete category');
  },

  uploadImageFile: async (file: File): Promise<{ url: string }> => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
    const contentType = file.type && (allowed as readonly string[]).includes(file.type) ? file.type : '';
    if (!contentType) {
      throw new Error('Choose a JPEG, PNG, WebP, or GIF image');
    }
    const b64 = await fileToBase64(file);
    const res = await fetch(uploadPath(), {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        file: b64,
        filename: file.name || 'image',
        contentType,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
      hint?: string;
    };
    if (!res.ok) {
      throw new Error([data.error, data.hint].filter(Boolean).join(' — ') || 'Upload failed');
    }
    if (!data.url) {
      throw new Error('Invalid upload response');
    }
    return { url: data.url };
  },

  batchSetPhotoCategories: async (photoIds: string[], categoryId: string): Promise<number> => {
    const res = await fetch(`${photosPath()}/batch`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ photoIds, categoryId }),
    });
    const data = (await res.json().catch(() => ({}))) as { updated?: number; error?: string };
    if (!res.ok) {
      throw new Error(data.error || 'Could not update categories');
    }
    return typeof data.updated === 'number' ? data.updated : 0;
  },

  batchDeletePhotos: async (photoIds: string[]): Promise<number> => {
    const res = await fetch(`${photosPath()}/batch-delete`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ photoIds }),
    });
    const data = (await res.json().catch(() => ({}))) as { deleted?: number; error?: string };
    if (!res.ok) {
      throw new Error(data.error || 'Could not delete photos');
    }
    return typeof data.deleted === 'number' ? data.deleted : 0;
  },

  addPhoto: async (photo: {
    url: string;
    title: string;
    categoryId: string;
  }): Promise<Photo> => {
    const res = await fetch(photosPath(), {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        url: photo.url,
        title: photo.title,
        categoryId: photo.categoryId,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Photo & { error?: string; debug?: string };
    if (!res.ok) {
      const base = data.error || 'Could not add photo';
      const hint =
        import.meta.env.DEV && typeof data.debug === 'string' && data.debug.trim()
          ? ` (${data.debug})`
          : '';
      throw new Error(base + hint);
    }
    return data as Photo;
  },

  deletePhoto: async (id: string): Promise<void> => {
    const res = await fetch(`${photosPath()}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: jsonHeaders(),
    });
    if (res.status === 204 || res.status === 404) return;
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Could not delete photo');
  },

  getDailyChallenge: async (): Promise<DailyChallengeResponse> => {
    const res = await fetch(dailyChallengePath(), { headers: jsonHeaders() });
    const data = (await res.json().catch(() => ({}))) as DailyChallengeResponse & { error?: string };
    if (!res.ok) {
      throw new Error(data.error || 'Could not load daily challenge');
    }
    return data as DailyChallengeResponse;
  },

  refreshDailyChallenge: async (): Promise<DailyChallengeResponse> => {
    const res = await fetch(dailyChallengePath(), {
      method: 'POST',
      headers: jsonHeaders(),
    });
    const data = (await res.json().catch(() => ({}))) as DailyChallengeResponse & { error?: string };
    if (!res.ok) {
      throw new Error(data.error || 'Could not load a new challenge photo');
    }
    return data as DailyChallengeResponse;
  },

  getDailyChallengeHistory: async (): Promise<DailyChallengeHistoryEntry[]> => {
    const res = await fetch(dailyChallengeHistoryPath(), { headers: jsonHeaders() });
    const data = (await res.json().catch(() => ({}))) as { entries?: DailyChallengeHistoryEntry[]; error?: string };
    if (!res.ok) throw new Error(data.error || 'Could not load journal history');
    return data.entries ?? [];
  },

  deleteJournalEntry: async (date: string): Promise<void> => {
    const res = await fetch(dailyChallengeHistoryPath(), {
      method: 'DELETE',
      headers: jsonHeaders(),
      body: JSON.stringify({ date }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error || 'Could not delete journal entry');
  },

  saveDailyChallengeJournalForDate: async (date: string, body: string): Promise<DailyChallengeJournal> => {
    const res = await fetch(dailyChallengeHistoryPath(), {
      method: 'PUT',
      headers: jsonHeaders(),
      body: JSON.stringify({ date, body }),
    });
    const data = (await res.json().catch(() => ({}))) as { journal?: DailyChallengeJournal; error?: string };
    if (!res.ok) throw new Error(data.error || 'Could not save journal');
    if (!data.journal) throw new Error('Invalid response from server');
    return data.journal;
  },

  saveDailyChallengeJournal: async (body: string): Promise<DailyChallengeJournal> => {
    const res = await fetch(dailyChallengePath(), {
      method: 'PUT',
      headers: jsonHeaders(),
      body: JSON.stringify({ body }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      journal?: DailyChallengeJournal;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || 'Could not save journal');
    }
    if (!data.journal) {
      throw new Error('Invalid response from server');
    }
    return data.journal;
  },

  updatePhoto: async (
    id: string,
    data: { title: string; categoryId: string; order: number; url?: string },
  ): Promise<Photo> => {
    const res = await fetch(`${photosPath()}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify({
        title: data.title,
        categoryId: data.categoryId,
        order: data.order,
        ...(data.url ? { url: data.url } : {}),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as Photo & { error?: string };
    if (!res.ok) {
      throw new Error(json.error || 'Could not update photo');
    }
    return json as Photo;
  },

  notifyPhotosChanged: () => {
    window.dispatchEvent(new CustomEvent('cyan-photos-changed'));
  },

  notifyCategoriesChanged: () => {
    window.dispatchEvent(new CustomEvent('cyan-categories-changed'));
  },
};

export const authStorage = {
  getToken: readStoredToken,
  setToken: writeStoredToken,
};

export const authApi = {
  login: async (email: string, password: string): Promise<{ token: string }> => {
    const url = `${apiBase()}/api/auth/login`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
    } catch {
      throw new Error(
        `Could not reach ${url}. Run \`pnpm dev\` and use the Vercel URL (e.g. http://localhost:3000), or check VITE_API_BASE_URL.`,
      );
    }

    const text = await res.text();
    let data: { token?: string; error?: string };
    try {
      data = JSON.parse(text) as { token?: string; error?: string };
    } catch {
      const looksHtml =
        /<!DOCTYPE/i.test(text) ||
        /<html[\s>]/i.test(text) ||
        (text.length > 0 && text.trimStart().startsWith('<'));
      const base = apiBase();
      const href =
        typeof window !== 'undefined' && url.startsWith('/')
          ? new URL(url, window.location.origin).href
          : url;
      const detail = looksHtml
        ? base === ''
          ? ' The body was HTML (typical when you opened the Vite port instead of Vercel, or the API is down). Run `pnpm dev` and use http://localhost:3000 (see CLI). For Vite-only + separate API, set `VITE_API_PROXY_TARGET`.'
          : ' The body was HTML instead of JSON. Confirm `VITE_API_BASE_URL` points at a host that serves `POST /api/auth/login`.'
        : ' Is the API running?';
      throw new Error(`Login failed (${res.status}): not JSON from ${href}.${detail}`);
    }

    if (!res.ok) {
      throw new Error(data.error || `Login failed (${res.status})`);
    }
    if (!data.token) {
      throw new Error('Invalid response from server (no token)');
    }
    return { token: data.token };
  },

  /**
   * Exchanges a Google ID token for a session. Rejects when the Google account's
   * address has no admin user — Google sign-in authenticates, it does not enrol.
   */
  loginWithGoogle: async (credential: string): Promise<{ token: string }> => {
    const res = await fetch(`${apiBase()}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });

    const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
    if (!res.ok) {
      throw new Error(data.error || `Google sign-in failed (${res.status})`);
    }
    if (!data.token) {
      throw new Error('Invalid response from server (no token)');
    }
    return { token: data.token };
  },

  /**
   * Requests a reset link. Resolves with the server's neutral message whether or
   * not the address has an account — the API deliberately does not say which.
   */
  requestPasswordReset: async (email: string): Promise<{ message: string }> => {
    const res = await fetch(`${apiBase()}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });

    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    if (!res.ok) {
      throw new Error(data.error || `Could not send reset email (${res.status})`);
    }
    return { message: data.message ?? 'If that email has an account, a reset link is on its way.' };
  },

  /** Exchanges a reset token for a new password, returning a session token. */
  resetPassword: async (token: string, password: string): Promise<{ token: string }> => {
    const res = await fetch(`${apiBase()}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });

    const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
    if (!res.ok) {
      throw new Error(data.error || `Could not reset password (${res.status})`);
    }
    if (!data.token) {
      throw new Error('Invalid response from server (no token)');
    }
    return { token: data.token };
  },
};
