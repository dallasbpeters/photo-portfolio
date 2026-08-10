import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  Facebook01Icon,
  NewTwitterIcon,
  PinterestIcon,
  Share01Icon,
} from "@hugeicons-pro/core-stroke-standard";
import { useState } from "react";
import { toast } from "sonner";
import posthog from "../lib/posthog";

interface ShareButtonsProps {
  description?: string;
  /** Absolute image URL. Pinterest requires one and refuses the pin without it. */
  imageUrl?: string;
  title: string;
  /** Absolute or root-relative URL of the thing being shared. */
  url: string;
  /** Lays out for a dark overlay rather than a page. */
  variant?: "overlay" | "page";
}

const absolute = (url: string): string =>
  url.startsWith("http") || typeof window === "undefined"
    ? url
    : new URL(url, window.location.origin).href;

/**
 * Share controls for a photograph or page.
 *
 * On a phone the native sheet is offered first — it reaches Messages,
 * WhatsApp, Instagram and everything else installed, which no fixed row of
 * network buttons can match. The explicit buttons are the desktop path, where
 * no share sheet exists.
 *
 * Pinterest is first among them deliberately: for photography it drives more
 * durable traffic than the others, and it is the one that genuinely needs the
 * image URL rather than just the link.
 */
export function ShareButtons({
  url,
  title,
  imageUrl,
  description,
  variant = "page",
}: ShareButtonsProps) {
  const [canNativeShare] = useState(
    () =>
      typeof navigator !== "undefined" && typeof navigator.share === "function"
  );

  const shareUrl = absolute(url);
  const text = description ?? title;

  const track = (network: string) =>
    posthog.capture("photo_shared", { network, url: shareUrl });

  const nativeShare = async () => {
    try {
      await navigator.share({ text, title, url: shareUrl });
      track("native");
    } catch {
      // Dismissing the sheet rejects; that is not an error worth surfacing.
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied");
      track("copy");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  const targets = [
    {
      // Pinterest builds the pin from the media parameter, so a photograph
      // without one silently pins the page thumbnail instead.
      href: `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(shareUrl)}&media=${encodeURIComponent(absolute(imageUrl ?? ""))}&description=${encodeURIComponent(text)}`,
      icon: PinterestIcon,
      label: "Pinterest",
      name: "pinterest",
    },
    {
      href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(title)}`,
      icon: NewTwitterIcon,
      label: "X",
      name: "x",
    },
    {
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      icon: Facebook01Icon,
      label: "Facebook",
      name: "facebook",
    },
  ];

  const tone =
    variant === "overlay"
      ? "text-white/45 hover:text-white"
      : "text-white/35 hover:text-white";

  return (
    <div className="flex items-center gap-4">
      {canNativeShare ? (
        <button
          aria-label="Share"
          className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] transition-colors ${tone}`}
          onClick={() => void nativeShare()}
          type="button"
        >
          <HugeiconsIcon icon={Share01Icon} size={13} />
          Share
        </button>
      ) : null}

      {targets.map(({ href, icon, label, name }) => (
        <a
          aria-label={`Share on ${label}`}
          className={`transition-colors ${tone}`}
          href={href}
          key={name}
          onClick={() => track(name)}
          rel="noreferrer"
          target="_blank"
          title={`Share on ${label}`}
        >
          <HugeiconsIcon icon={icon} size={14} />
        </a>
      ))}

      <button
        aria-label="Copy link"
        className={`transition-colors ${tone}`}
        onClick={() => void copyLink()}
        title="Copy link"
        type="button"
      >
        <HugeiconsIcon icon={Copy01Icon} size={14} />
      </button>
    </div>
  );
}
