import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkCircle02Icon,
  Copy01Icon,
  LinkSquare01Icon,
} from "@hugeicons-pro/core-stroke-standard";
import { useState } from "react";
import { toast } from "sonner";
import {
  lightroomRedirectPattern,
  lightroomRedirectUris,
} from "../../../config/lightroomRedirect.js";
import {
  type LightroomCredentials,
  lightroomApi,
} from "../../services/lightroomService";
import { Button } from "../ui/button";
import "./LightroomPanel.css";

/**
 * Entering the Adobe integration's credentials, and getting them in the first
 * place.
 *
 * These were environment variables, which was the wrong shape for what they
 * are. A fal key is one value this project owns, set once by whoever deploys. An
 * Adobe integration is registered by whoever owns the Lightroom account, its
 * redirect URI has to match the deployment it is used from, and it arrives from
 * an approval process that finishes long after the code ships — so the person
 * who can obtain the credential was the one person who could not enter it.
 *
 * The steps are here rather than in a README because this is where somebody is
 * standing when they need them, and because the order matters: the redirect URI
 * has to be registered at Adobe *before* the first handshake, and a mismatch
 * produces an error that does not say which part disagreed.
 *
 * The secret field is write-only in both directions — the API never returns it,
 * so this component cannot show it and cannot send it back. An empty field means
 * "keep the stored one", which is why saving after correcting the client id does
 * not wipe the secret.
 */

export interface LightroomSetupProps {
  credentials: LightroomCredentials;
  onSaved: () => void | Promise<void>;
}

/** Adobe's own pages, in the order they are needed. */
const STEPS = [
  {
    body: "Create a project, then Add API → Creative Cloud → Lightroom Services. This gives you the client ID and secret below.",
    href: "https://console.adobe.io",
    label: "Adobe Developer Console",
  },
  {
    body: "Adobe's own walkthrough of the same steps, if the console has moved on since this was written.",
    href: "https://developer.adobe.com/lightroom/lightroom-api-docs/getting-started/create-integration/",
    label: "Creating an Integration",
  },
  {
    body: "Where the redirect URI and its pattern are configured. Both have to match the URI shown below, exactly.",
    href: "https://developer.adobe.com/authentication/auth-methods.html#!AdobeDocs/adobeio-auth/master/AuthenticationOverview/OAuthIntegration",
    label: "OAuth integration settings",
  },
] as const;

export function LightroomSetup({ credentials, onSaved }: LightroomSetupProps) {
  const [clientId, setClientId] = useState(credentials.clientId);
  const [clientSecret, setClientSecret] = useState("");
  /*
   * Defaulted to *this* deployment rather than to the compiled-in production
   * URL, because the value's whole job is to match what Adobe was told — and
   * whoever is reading this screen is standing on the deployment they mean.
   * Only when nothing has been stored: a saved value is a deliberate choice and
   * must not be overwritten by wherever the panel happens to be opened.
   */
  const [redirectUri, setRedirectUri] = useState(() =>
    credentials.redirectUriSource === "default"
      ? `${window.location.origin}/api/lightroom/callback`
      : credentials.redirectUri
  );
  const [busy, setBusy] = useState(false);

  const dirty =
    clientId.trim() !== credentials.clientId ||
    clientSecret.trim() !== "" ||
    // Against the resolved value, so the offered origin counts as a change
    // worth saving rather than looking already-applied.
    redirectUri.trim() !== credentials.redirectUri;

  const save = async () => {
    setBusy(true);
    try {
      await lightroomApi.saveCredentials({
        clientId: clientId.trim() || undefined,
        // Left out when blank, so a save that only corrects the id keeps the
        // stored secret. See the note at the top of the file.
        clientSecret: clientSecret.trim() || undefined,
        redirectUri: redirectUri.trim() || undefined,
      });
      setClientSecret("");
      toast.success("Lightroom credentials saved.");
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save them");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${what} copied.`);
    } catch {
      // A denied clipboard permission is not worth an error toast — the value
      // is selectable and right there.
      toast.error("Could not copy — select the text instead.");
    }
  };

  return (
    <div className="lightroom-setup stack stack--mid">
      <section className="stack stack--snug">
        <h3 className="admin-caps">Getting access</h3>
        <p className="admin-note">
          Adobe gates the Lightroom APIs: they are, in their words, available
          only to <em>entitled partner applications</em>. Registering below gets
          you a client ID and secret; reaching a real catalogue also needs Adobe
          to entitle the integration for <code>lr_partner_apis</code> and{" "}
          <code>lr_partner_rendition_apis</code>. There is no self-serve form
          for that — the docs say to contact Adobe and describe what you are
          building, which is also how you ask for <code>offline_access</code>{" "}
          (without it a connection expires after a day and cannot renew itself).
        </p>
        <ol className="lightroom-setup__steps">
          {STEPS.map((step, index) => (
            <li className="lightroom-setup__step" key={step.href}>
              <span className="lightroom-setup__step-number">{index + 1}</span>
              <div className="stack stack--snug">
                <a
                  className="lightroom-setup__link"
                  href={step.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  {step.label}
                  <HugeiconsIcon
                    aria-hidden
                    icon={LinkSquare01Icon}
                    size={12}
                  />
                </a>
                <p className="admin-note">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="stack stack--snug">
        <h3 className="admin-caps">Credentials</h3>

        {/*
          Shown first and copyable, because it is the one value that has to be
          registered at Adobe *before* connecting — and a mismatch is the most
          common cause of a failed handshake, reported by Adobe as an error that
          does not name the offending field.
        */}
        <label className="lightroom-setup__field admin-field-group">
          <span className="admin-field-label">
            Redirect URI — register this at Adobe, exactly
          </span>
          <span className="lightroom-setup__row">
            <input
              className="admin-field"
              onChange={(e) => setRedirectUri(e.target.value)}
              spellCheck={false}
              value={redirectUri}
            />
            <Button
              onClick={() => void copy(redirectUri, "Redirect URI")}
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon aria-hidden icon={Copy01Icon} size={14} />
              Copy
            </Button>
          </span>
        </label>

        {/*
          What Adobe's console asks for, which is not one URI per site.
          There is a single "Default redirect URI" slot and a single "Redirect
          URI pattern" slot — and the pattern takes a comma-separated list of
          regexes, so one integration covers all three sites. Generated rather
          than typed, because the escaping is the part that goes wrong: an
          unescaped period is a wildcard.
        */}
        <div className="lightroom-setup__field">
          <span className="admin-field-label">
            Redirect URI pattern — paste into Adobe's second slot
          </span>
          <span className="lightroom-setup__row">
            <code className="lightroom-setup__pattern">
              {lightroomRedirectPattern()}
            </code>
            <Button
              onClick={() => void copy(lightroomRedirectPattern(), "Pattern")}
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon aria-hidden icon={Copy01Icon} size={14} />
              Copy
            </Button>
          </span>
          <p className="admin-note">
            Covers every site this codebase serves, apex and www —{" "}
            {lightroomRedirectUris().length} URIs across{" "}
            {new Set(lightroomRedirectUris().map((u) => new URL(u).host)).size}{" "}
            hosts. Periods are escaped because the field is a regular
            expression; Adobe allows wildcards only in the path, never in a
            host.
          </p>
        </div>

        <label className="lightroom-setup__field admin-field-group">
          <span className="admin-field-label">
            Client ID
            {credentials.source.clientId === "environment" ? (
              <span className="lightroom-setup__from-env">
                {" "}
                — currently from ADOBE_CLIENT_ID
              </span>
            ) : null}
          </span>
          <input
            autoComplete="off"
            className="admin-field"
            onChange={(e) => setClientId(e.target.value)}
            placeholder="from the Adobe console"
            spellCheck={false}
            value={clientId}
          />
        </label>

        <label className="lightroom-setup__field admin-field-group">
          <span className="admin-field-label">
            Client secret
            {credentials.hasSecret ? (
              <span className="lightroom-setup__stored">
                <HugeiconsIcon
                  aria-hidden
                  icon={CheckmarkCircle02Icon}
                  size={12}
                />
                stored
                {credentials.source.clientSecret === "environment"
                  ? " (from ADOBE_CLIENT_SECRET)"
                  : ""}
              </span>
            ) : null}
          </span>
          <input
            autoComplete="new-password"
            className="admin-field"
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={
              credentials.hasSecret
                ? "leave blank to keep the stored secret"
                : "from the Adobe console"
            }
            spellCheck={false}
            type="password"
            value={clientSecret}
          />
          <p className="admin-note">
            Never shown again once saved — this asks Adobe for tokens on your
            behalf, so it is stored as given rather than hashed. Set{" "}
            <code>ADOBE_CLIENT_SECRET</code> instead if you would rather it
            lived only in the deployment.
          </p>
        </label>

        <div className="row row--between">
          {credentials.source.clientId === "database" ||
          credentials.source.clientSecret === "database" ? (
            <Button
              onClick={async () => {
                await lightroomApi.clearCredentials();
                toast.success("Credentials cleared.");
                await onSaved();
              }}
              type="button"
              variant="ghost"
            >
              Clear
            </Button>
          ) : (
            <span />
          )}
          <Button
            disabled={busy || !dirty}
            onClick={() => void save()}
            type="button"
          >
            {busy ? "Saving…" : "Save credentials"}
          </Button>
        </div>
      </section>
    </div>
  );
}
