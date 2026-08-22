import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  LinkSquare01Icon,
} from "@hugeicons-pro/core-stroke-standard";
import type { LightroomStatus } from "../../services/lightroomService";
import { Button } from "../ui/button";
import "./LightroomPanel.css";

/**
 * Whether Lightroom can be used, and the one action that changes it.
 *
 * Split out of LightroomPanel on size, and it is the right seam: five mutually
 * exclusive states with no shared logic, none of which knows anything about
 * albums. The states themselves are the interesting part — see the note at the
 * top of LightroomPanel.tsx on why "no" has three different meanings here.
 */

export function ConnectionState({
  onConnect,
  onDisconnect,
  status,
}: {
  onConnect: () => void;
  onDisconnect: () => Promise<void>;
  status: LightroomStatus;
}) {
  if (!status.configured) {
    return (
      <div className="lightroom__state lightroom__state--blocked">
        <HugeiconsIcon aria-hidden icon={Alert02Icon} size={16} />
        <div className="stack stack--snug">
          <p className="lightroom__state-title">Not configured</p>
          <p className="admin-note">
            Set {status.missingEnv ?? "ADOBE_CLIENT_ID and ADOBE_CLIENT_SECRET"}{" "}
            on the project. Adobe gates the Lightroom APIs to partner
            applications it has entitled, so a client id alone is not enough —
            the integration also has to be approved for{" "}
            <code>lr_partner_apis</code> and{" "}
            <code>lr_partner_rendition_apis</code>.
          </p>
        </div>
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="lightroom__state">
        <div className="stack stack--snug">
          <p className="lightroom__state-title">Not connected</p>
          <p className="admin-note">
            Connect an Adobe account to browse its Lightroom albums.
          </p>
        </div>
        <Button onClick={onConnect} type="button">
          <HugeiconsIcon aria-hidden icon={LinkSquare01Icon} size={14} />
          Connect Lightroom
        </Button>
      </div>
    );
  }

  if (status.error) {
    return (
      <div className="lightroom__state lightroom__state--blocked">
        <HugeiconsIcon aria-hidden icon={Alert02Icon} size={16} />
        <div className="stack stack--snug">
          <p className="lightroom__state-title">Connected, but not working</p>
          <p className="admin-note">{status.error}</p>
        </div>
        <Button onClick={onConnect} type="button" variant="ghost">
          Reconnect
        </Button>
      </div>
    );
  }

  if (status.entitled === false) {
    return (
      <div className="lightroom__state lightroom__state--blocked">
        <HugeiconsIcon aria-hidden icon={Alert02Icon} size={16} />
        <div className="stack stack--snug">
          <p className="lightroom__state-title">No Lightroom subscription</p>
          <p className="admin-note">
            {status.accountEmail ?? "This Adobe account"} has no active
            Lightroom plan, so its catalogue cannot be read. Connect an account
            that has one.
          </p>
        </div>
        <Button onClick={onConnect} type="button" variant="ghost">
          Connect a different account
        </Button>
      </div>
    );
  }

  return (
    <div className="lightroom__state lightroom__state--ok">
      <HugeiconsIcon aria-hidden icon={CheckmarkCircle02Icon} size={16} />
      <div className="stack stack--snug">
        <p className="lightroom__state-title">
          Connected{status.accountEmail ? ` — ${status.accountEmail}` : ""}
        </p>
        {/* Said plainly: this forgets our copy of the token and cannot revoke
            the grant at Adobe's end, which is done from the Adobe account
            page. A "disconnect" that leaves a live grant is a promise unkept. */}
        <p className="admin-note">
          Disconnecting forgets the stored token here. To revoke access at
          Adobe's end, use the Adobe account page.
        </p>
      </div>
      <Button onClick={() => void onDisconnect()} type="button" variant="ghost">
        Disconnect
      </Button>
    </div>
  );
}
