import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { authApi, authStorage } from "../../services/portfolioService";

const GIS_SRC = "https://accounts.google.com/gsi/client";

interface CredentialResponse {
  credential?: string;
}

interface GoogleIdApi {
  initialize: (config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "small" | "medium" | "large";
      text?: "signin_with" | "continue_with";
      shape?: "rectangular" | "pill";
      width?: number;
      logo_alignment?: "left" | "center";
    }
  ) => void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

/** Loads the GIS script once per page, shared across mounts. */
let gisLoader: Promise<void> | null = null;

const loadGis = (): Promise<void> => {
  if (gisLoader) {
    return gisLoader;
  }

  gisLoader = new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SRC}"]`
    );
    const script = existing ?? document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () =>
      reject(new Error("Could not load Google sign-in"))
    );
    if (!existing) {
      document.head.appendChild(script);
    }
  });

  return gisLoader;
};

interface GoogleSignInButtonProps {
  onSignedIn: () => void;
}

/**
 * Renders Google's official sign-in button and exchanges the resulting ID token
 * for a session. The server only accepts addresses that already have an admin
 * account, so this signs existing admins in — it never creates one.
 *
 * Renders nothing when VITE_GOOGLE_CLIENT_ID is unset, so a deployment without
 * Google configured simply shows password sign-in.
 */
export function GoogleSignInButton({ onSignedIn }: GoogleSignInButtonProps) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!(clientId && containerRef.current)) {
      return;
    }

    let cancelled = false;

    const handleCredential = async (
      response: CredentialResponse
    ): Promise<void> => {
      if (!response.credential) {
        toast.error("Google did not return a credential");
        return;
      }
      try {
        const { token } = await authApi.loginWithGoogle(response.credential);
        authStorage.setToken(token);
        toast.success("Signed in");
        onSignedIn();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Google sign-in failed"
        );
      }
    };

    loadGis()
      .then(() => {
        if (cancelled || !containerRef.current) {
          return;
        }
        const api = window.google?.accounts?.id;
        if (!api) {
          setFailed(true);
          return;
        }
        api.initialize({
          // One Tap is deliberately off: this is an admin screen, not a
          // consumer signup, and an auto-prompt on page load is jarring.
          auto_select: false,
          callback: (response) => void handleCredential(response),
          cancel_on_tap_outside: true,
          client_id: clientId,
        });
        api.renderButton(containerRef.current, {
          logo_alignment: "left",
          shape: "rectangular",
          size: "large",
          text: "signin_with",
          theme: "outline",
          type: "standard",
          width: 320,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [onSignedIn]);

  if (!clientId) {
    return null;
  }

  return (
    <div className="w-full max-w-sm space-y-3">
      <div aria-hidden className="flex items-center gap-3">
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-[9px] text-white/25 uppercase tracking-[0.3em]">
          or
        </span>
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <div className="flex min-h-11 justify-center" ref={containerRef} />
      {failed && (
        <p className="text-center text-[10px] text-white/30 uppercase tracking-[0.15em]">
          Google sign-in is unavailable. Use your email and password.
        </p>
      )}
    </div>
  );
}
