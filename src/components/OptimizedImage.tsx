import { type ImgHTMLAttributes, useState } from "react";

const ABSOLUTE_HTTP = /^https?:\/\//i;
const SVG_PATH = /\.svg(\?|$)/i;

/**
 * Serves photos through Vercel's Image Optimization instead of shipping the
 * original file to every tile.
 *
 * This is what `next/image` calls under the hood — the endpoint is available to
 * any Vercel project, not just Next.js ones, so a Vite SPA gets the same
 * resizing, AVIF/WebP negotiation and CDN caching without the Next runtime.
 *
 * Source hosts must be allow-listed under `images.remotePatterns` in
 * vercel.json, or the endpoint refuses the request.
 */

/** Kept in step with `images.sizes` in vercel.json. */
const WIDTHS = [256, 384, 640, 750, 828, 1080, 1200, 1920, 2048];

/** localhost, loopback, private LAN ranges, and mDNS names. */
const LOCAL_HOSTNAME =
  /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|.*\.local)$/i;

/**
 * True when this page is served from somewhere Vercel's edge is not.
 *
 * import.meta.env.DEV is not trustworthy here. Vite derives it from NODE_ENV,
 * and `vercel dev` runs the dev server with NODE_ENV=production — so DEV is
 * false on a local dev server, every image gets rewritten to /_vercel/image,
 * and every one of them fails because that route only exists once deployed.
 * The hostname is the thing that actually determines whether the optimizer is
 * there, so ask that instead. It also covers reaching the dev server from a
 * phone on the LAN.
 */
const isLocalOrigin = (): boolean =>
  typeof window !== "undefined" &&
  LOCAL_HOSTNAME.test(window.location.hostname);

const isOptimizable = (src: string): boolean => {
  if (import.meta.env.DEV || isLocalOrigin()) {
    return false;
  }
  // Only absolute http(s) sources go through the optimizer; data: and blob:
  // URLs (the editor's in-progress output) must render as-is.
  if (!ABSOLUTE_HTTP.test(src)) {
    return false;
  }
  // SVGs are passed through: rasterising them loses the point, and the
  // optimizer refuses them unless dangerouslyAllowSVG is set.
  if (SVG_PATH.test(src)) {
    return false;
  }
  return true;
};

const optimizedUrl = (src: string, width: number, quality: number): string =>
  `/_vercel/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;

/**
 * Optimized URL for callers that cannot use the component — animated images, or
 * anywhere an <img> element is produced by another library. Returns the source
 * unchanged when it is not optimizable.
 */
export const optimizedImageSrc = (
  src: string,
  width: number,
  quality = 80
): string => (isOptimizable(src) ? optimizedUrl(src, width, quality) : src);

interface OptimizedImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "srcSet"> {
  alt: string;
  /**
   * Tiny inline preview, shown blurred until the real image decodes. Rendered as
   * a background so there is no second <img> to fetch or lay out.
   */
  lqip?: string | null;
  quality?: number;
  /**
   * The `sizes` attribute — how wide the image renders at each breakpoint.
   * Getting this right is what actually saves the bytes: without it the browser
   * assumes 100vw and picks the largest candidate.
   */
  sizes?: string;
  src: string;
}

export function OptimizedImage({
  src,
  alt,
  sizes = "100vw",
  quality = 75,
  loading = "lazy",
  decoding = "async",
  lqip,
  style,
  width,
  height,
  ...rest
}: OptimizedImageProps) {
  const [loaded, setLoaded] = useState(false);

  // Blur the placeholder behind the image and fade it out once the real pixels
  // arrive, so a photo resolves out of a blur rather than popping in.
  const placeholderStyle =
    lqip && !loaded
      ? {
          backgroundImage: `url(${lqip})`,
          backgroundPosition: "center",
          backgroundSize: "cover",
          filter: "blur(12px)",
          transform: "scale(1.04)",
        }
      : undefined;

  const shared = {
    className: rest.className,
    decoding,
    loading,
    onLoad: () => setLoaded(true),
    style: { ...placeholderStyle, ...style },
  };

  // Intrinsic size is passed through explicitly rather than only via ...rest:
  // without width and height the browser cannot reserve the box, and the grid
  // reflows as each photograph decodes.
  if (!isOptimizable(src)) {
    return (
      <img
        {...rest}
        {...shared}
        alt={alt}
        height={height}
        src={src}
        width={width}
      />
    );
  }

  return (
    <img
      {...rest}
      {...shared}
      alt={alt}
      height={height}
      sizes={sizes}
      src={optimizedUrl(src, 1080, quality)}
      srcSet={WIDTHS.map((w) => `${optimizedUrl(src, w, quality)} ${w}w`).join(
        ", "
      )}
      width={width}
    />
  );
}
