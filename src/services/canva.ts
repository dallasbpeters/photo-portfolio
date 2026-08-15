import { apiBase, jsonHeaders } from "./portfolioService";

/**
 * The client half of the Canva integration.
 *
 * The browser only ever talks to our own endpoints — the Canva OAuth tokens
 * live server-side, so a send is a POST to /api/canva/send. The only thing
 * that leaves is the authorize URL, opened in a new tab so the OAuth round
 * trip never interrupts the board.
 */

const canvaPath = (path: string): string => `${apiBase()}/api/canva${path}`;

export interface CanvaStatus {
  configured: boolean;
  connected: boolean;
}

export interface CanvaTemplate {
  id: string;
  thumbnail: { height: number; url: string; width: number } | null;
  title: string;
  viewUrl: string;
}

const readError = async (res: Response, fallback: string): Promise<string> => {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error || `${fallback} (${res.status})`;
};

export const canvaApi = {
  /** The URL that starts the OAuth handshake, to be opened in a new tab. */
  connect: async (returnTo?: string): Promise<string> => {
    const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
    const res = await fetch(`${canvaPath("/connect")}${query}`, {
      headers: jsonHeaders(),
    });
    if (!res.ok) {
      throw new Error(await readError(res, "Could not connect to Canva"));
    }
    return ((await res.json()) as { url: string }).url;
  },

  send: async (input: {
    fieldKey: string;
    imageUrl: string;
    templateId: string;
    title: string;
  }): Promise<string> => {
    const res = await fetch(canvaPath("/send"), {
      body: JSON.stringify(input),
      headers: jsonHeaders(),
      method: "POST",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        upsellUrl?: string;
      };
      const error = new Error(
        data.error || `Could not send to Canva (${res.status})`
      ) as Error & { upsellUrl?: string };
      if (data.upsellUrl) {
        error.upsellUrl = data.upsellUrl;
      }
      throw error;
    }
    return ((await res.json()) as { designUrl: string }).designUrl;
  },
  status: async (): Promise<CanvaStatus> => {
    const res = await fetch(canvaPath("/status"), { headers: jsonHeaders() });
    if (!res.ok) {
      throw new Error(await readError(res, "Could not check Canva status"));
    }
    return (await res.json()) as CanvaStatus;
  },

  templateFields: async (templateId: string): Promise<string[]> => {
    const res = await fetch(canvaPath(`/templates/${templateId}`), {
      headers: jsonHeaders(),
    });
    if (!res.ok) {
      throw new Error(await readError(res, "Could not load template fields"));
    }
    return ((await res.json()) as { fields: string[] }).fields;
  },

  templates: async (): Promise<CanvaTemplate[]> => {
    const res = await fetch(canvaPath("/templates"), {
      headers: jsonHeaders(),
    });
    if (!res.ok) {
      throw new Error(await readError(res, "Could not load Canva templates"));
    }
    return ((await res.json()) as { templates: CanvaTemplate[] }).templates;
  },
};
