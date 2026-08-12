import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Refuses to fetch anything that is not on the public internet.
 *
 * The other connectors allowlist their hosts, which is the stronger guard and
 * the right one when the hosts are known — Pinterest is always pinterest.com.
 * A published Framer site is not: it lives on whatever domain its owner
 * pointed at it, so there is no list to check against.
 *
 * What is left is to check where the name actually resolves. Without that, a
 * URL naming `localhost`, a private address, or a cloud metadata endpoint would
 * have this server fetch its own internals and hand the result back — the
 * classic way a "paste a link" feature becomes a way to read things it should
 * not.
 *
 * This is not proof against DNS rebinding, where a name resolves differently on
 * the second lookup than it did on the first. Closing that needs the connection
 * pinned to the address that was checked, which Node's fetch does not expose.
 * The exposure here is one HTTP GET whose body is parsed for image URLs, by an
 * authenticated admin, which does not warrant a custom agent.
 */

/** IPv4 ranges that are not the public internet. */
const isPrivateV4 = (ip: string): boolean => {
  const parts = ip.split(".").map(Number);
  const [a = 0, b = 0] = parts;
  return (
    a === 0 || // "this network"
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, and AWS/GCP metadata
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 192 && b === 0) || // protocol assignments
    (a === 198 && b >= 18 && b <= 19) || // benchmarking
    a >= 224 // multicast and reserved
  );
};

const V6_UNIQUE_LOCAL = /^f[cd]/;
const V6_LINK_LOCAL = /^fe[89ab]/;
const V6_MAPPED_V4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/;

const isPrivateV6 = (ip: string): boolean => {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") {
    return true;
  }
  // Unique-local (fc00::/7) and link-local (fe80::/10).
  if (V6_UNIQUE_LOCAL.test(lower) || V6_LINK_LOCAL.test(lower)) {
    return true;
  }
  // IPv4 written inside an IPv6 address still points wherever it points.
  const mapped = lower.match(V6_MAPPED_V4);
  return mapped?.[1] ? isPrivateV4(mapped[1]) : false;
};

const isPrivateAddress = (ip: string): boolean =>
  isIP(ip) === 6 ? isPrivateV6(ip) : isPrivateV4(ip);

/**
 * Names that never belong to the public internet.
 *
 * The fallback when a lookup cannot be performed. A bare word with no dot is
 * included because it resolves against the local search domain — `router` or
 * `nas` on a home network — and is never a site anyone means to import from.
 */
const LOCAL_NAMES = new Set(["localhost", "localhost.localdomain"]);
const LOCAL_SUFFIX = /\.(?:local|internal|localdomain|home|lan)$/i;

const isLocalName = (host: string): boolean => {
  const lower = host.toLowerCase();
  return (
    LOCAL_NAMES.has(lower) || LOCAL_SUFFIX.test(lower) || !lower.includes(".")
  );
};

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const HTTP_SCHEME = /^http:\/\//i;
const BRACKETS = /^\[|\]$/g;

/**
 * Why a URL was refused, so the caller can say something specific.
 *
 * One message for four different problems taught nobody anything: "not a
 * published site" is unhelpful when the real answer is "that host does not
 * exist" or "you pasted an address with a password in it".
 */
export type UrlRefusal = "credentials" | "malformed" | "private" | "unresolved";

export type PublicUrlResult =
  | { ok: true; url: URL }
  | { ok: false; reason: UrlRefusal };

/**
 * The URL, if it is safe to go and fetch.
 *
 * A missing scheme is added rather than refused. Nobody types `https://` when
 * copying a domain, and rejecting `mysite.framer.website` for that reason is a
 * puzzle rather than a safeguard — the same reason parsePublicHttpUrl has
 * always done this. An explicit `http://` is upgraded for the same purpose:
 * the intent is plain, every published Framer site is on TLS, and the
 * connection made here is https either way.
 */
export const resolvePublicUrl = async (
  raw: string
): Promise<PublicUrlResult> => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: "malformed" };
  }
  const withScheme = HAS_SCHEME.test(trimmed)
    ? trimmed.replace(HTTP_SCHEME, "https://")
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, reason: "malformed" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "credentials" };
  }

  const host = url.hostname.replace(BRACKETS, "");
  if (isIP(host)) {
    return isPrivateAddress(host)
      ? { ok: false, reason: "private" }
      : { ok: true, url };
  }

  // A name that looks local is refused without asking anyone.
  if (isLocalName(host)) {
    return { ok: false, reason: "private" };
  }

  try {
    // Every address, not just the first: a name that resolves to both a public
    // and a private address must be refused, or the choice of which one gets
    // connected to decides whether the guard held.
    const addresses = await lookup(host, { all: true });
    return addresses.some((entry) => isPrivateAddress(entry.address))
      ? { ok: false, reason: "private" }
      : { ok: true, url };
  } catch {
    // A failed lookup is never fatal here, whatever its code.
    //
    // This check only ever had one job: refuse a name that points somewhere
    // private. It was never the authority on whether a site exists — fetch
    // resolves the name again on its own, and a domain that really is missing
    // fails there and reports itself accurately. Using a lookup failure to mean
    // "no such site" therefore bought nothing, and cost a great deal: in an
    // environment where node:dns is restricted while fetch still works — a
    // serverless sandbox, as here — every lookup fails and every perfectly good
    // domain was declared not to exist.
    //
    // What remains without DNS still closes the routes that matter. An IP
    // literal was checked above without any lookup, and so was a local-looking
    // name. What is lost is only the case of a public *name* pointing at a
    // private address, which no pre-check could have guaranteed anyway.
    return { ok: true, url };
  }
};
