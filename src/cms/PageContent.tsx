import { Fragment, type ReactNode } from "react";
import { OptimizedImage } from "../components/OptimizedImage";
import { usePrefersReducedMotion } from "../lib/reducedMotion";
import { imageLayout, isImageAlign } from "./imageAttributes";

/**
 * Renders a TipTap document.
 *
 * Walks the node tree and emits known node types rather than setting innerHTML.
 * The body is authored by an admin, but rendering stored markup verbatim would
 * make any future write path an XSS vector; an unrecognised node is skipped
 * instead.
 */

interface Mark {
  attrs?: Record<string, unknown>;
  type: string;
}
interface Node {
  attrs?: Record<string, unknown>;
  content?: Node[];
  marks?: Mark[];
  text?: string;
  type: string;
}

const alignClass = (attrs: Record<string, unknown> | undefined): string => {
  const align = attrs?.textAlign;
  if (align === "center") {
    return "text-center";
  }
  if (align === "right") {
    return "text-right";
  }
  return "";
};

/** Only http(s) and mailto links are emitted; javascript: URLs are dropped. */
const safeHref = (href: unknown): string | null => {
  if (typeof href !== "string") {
    return null;
  }
  try {
    const url = new URL(href, "https://example.com");
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? href : null;
  } catch {
    return null;
  }
};

const applyMarks = (
  text: ReactNode,
  marks: Mark[] | undefined,
  key: string
): ReactNode => {
  if (!marks?.length) {
    return text;
  }

  return marks.reduce<ReactNode>((acc, mark, i) => {
    const markKey = `${key}-m${i}`;
    switch (mark.type) {
      case "bold":
        return <strong key={markKey}>{acc}</strong>;
      case "italic":
        return <em key={markKey}>{acc}</em>;
      case "strike":
        return <s key={markKey}>{acc}</s>;
      case "code":
        return (
          <code
            className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.9em]"
            key={markKey}
          >
            {acc}
          </code>
        );
      case "link": {
        const href = safeHref(mark.attrs?.href);
        if (!href) {
          return acc;
        }
        return (
          <a
            className="underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-white"
            href={href}
            key={markKey}
            rel="noopener noreferrer"
            target="_blank"
          >
            {acc}
          </a>
        );
      }
      default:
        return acc;
    }
  }, text);
};

// Alignment and width are set in the editor; without honouring them here the
// page would ignore the formatting the writer just applied. Images and videos
// share the vocabulary, so the toolbar's controls mean one thing rather than
// two and the two lay out alike.
const mediaLayout = (attrs: Record<string, unknown> | undefined) => {
  const align = isImageAlign(attrs?.align) ? attrs.align : "center";
  const width = typeof attrs?.width === "number" ? attrs.width : null;
  return imageLayout(align, width);
};

const renderImage = (node: Node): ReactNode => {
  const src = safeHref(node.attrs?.src);
  if (!src) {
    return null;
  }
  const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
  const layout = mediaLayout(node.attrs);
  return (
    <figure className={`my-8 ${layout.className}`} style={layout.style}>
      {/* Routed through image optimization like the gallery, so page media
          is not served at full resolution either. */}
      <OptimizedImage
        alt={alt}
        className="h-auto w-full"
        sizes="(min-width: 768px) 720px, 100vw"
        src={src}
      />
      {alt ? (
        <figcaption className="mt-2 text-[10px] text-white/80 uppercase tracking-[0.18em]">
          {alt}
        </figcaption>
      ) : null}
    </figure>
  );
};

/**
 * A clip in a published page.
 *
 * A component rather than a render function because it reads a media query:
 * an autoplaying loop is precisely what `prefers-reduced-motion` is for, so
 * someone who has asked for less movement gets the poster frame and a play
 * button instead. Everyone else gets the clip already running.
 *
 * Muted is what makes autoplay legal as well as bearable — every browser
 * refuses to start an unmuted video on its own, so a clip with sound would
 * simply sit there.
 *
 * Controls are the author's call, set per clip in the editor. A video meant to
 * be watched needs a way to pause it; a short loop used as a texture is
 * furniture, and a control bar over furniture is clutter. Absent means on, so
 * nothing written before the setting existed loses its bar.
 */
function PageVideo({ node }: { node: Node }) {
  const still = usePrefersReducedMotion();
  // Absent means on: pages written before the setting existed had a control bar,
  // and a silent upgrade that took it away would be the reader's loss.
  const controls = node.attrs?.controls !== false;
  const src = safeHref(node.attrs?.src);
  if (!src) {
    return null;
  }
  const layout = mediaLayout(node.attrs);
  return (
    <figure className={`my-8 ${layout.className}`} style={layout.style}>
      <video
        autoPlay={!still}
        className="h-auto w-full"
        controls={controls}
        loop
        muted
        playsInline
        // Autoplay fetches the whole clip regardless, so claiming "metadata"
        // here described something that was never going to happen. Held back
        // only when it is not going to start on its own.
        preload={still ? "metadata" : "auto"}
        src={src}
      />
    </figure>
  );
}

const renderNodes = (nodes: Node[] | undefined, keyPrefix = "n"): ReactNode =>
  (nodes ?? []).map((node, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: document nodes have no stable id and the tree is re-rendered whole rather than reordered, so position is the correct identity
    <Fragment key={`${keyPrefix}-${i}`}>
      {renderNode(node, `${keyPrefix}-${i}`)}
    </Fragment>
  ));

const renderNode = (node: Node, key: string): ReactNode => {
  switch (node.type) {
    case "text":
      return applyMarks(node.text ?? "", node.marks, key);

    case "paragraph":
      return (
        <p
          className={`mb-5 text-[15px] text-white/90 leading-[1.75] ${alignClass(node.attrs)}`}
        >
          {renderNodes(node.content, key)}
        </p>
      );

    case "heading": {
      const level = Number(node.attrs?.level) === 3 ? 3 : 2;
      const Tag = level === 3 ? "h3" : "h2";
      const size =
        level === 3
          ? "text-sm tracking-[0.2em]"
          : "text-base tracking-[0.24em]";
      return (
        <Tag
          className={`mt-12 mb-4 uppercase ${size} font-light text-white ${alignClass(node.attrs)}`}
        >
          {renderNodes(node.content, key)}
        </Tag>
      );
    }

    case "bulletList":
      return (
        <ul className="mb-5 list-disc space-y-2 pl-5 text-[15px] text-white/90 leading-[1.75] marker:text-white/90">
          {renderNodes(node.content, key)}
        </ul>
      );

    case "orderedList":
      return (
        <ol className="mb-5 list-decimal space-y-2 pl-5 text-[15px] text-white/90 leading-[1.75] marker:text-white/90">
          {renderNodes(node.content, key)}
        </ol>
      );

    case "listItem":
      return <li>{renderNodes(node.content, key)}</li>;

    case "blockquote":
      return (
        <blockquote className="mb-6 border-white/20 border-l pl-5 text-[15px] text-white/90 italic leading-[1.75]">
          {renderNodes(node.content, key)}
        </blockquote>
      );

    case "codeBlock":
      return (
        <pre className="mb-6 overflow-x-auto border border-white/10 bg-white/3 p-4 font-mono text-[12px] text-white/90">
          <code>{renderNodes(node.content, key)}</code>
        </pre>
      );

    case "horizontalRule":
      return <hr className="my-10 border-white/10" />;

    case "hardBreak":
      return <br />;

    case "image":
      return renderImage(node);

    case "pageVideo":
      return <PageVideo node={node} />;

    default:
      // Unknown node: render its children if it has any, otherwise skip.
      return node.content ? renderNodes(node.content, key) : null;
  }
};

export function PageContent({ doc }: { doc: unknown }) {
  const root = doc as Node | undefined;
  if (
    root?.type !== "doc" ||
    !Array.isArray(root.content) ||
    root.content.length === 0
  ) {
    return (
      <p className="text-[11px] text-white/80 uppercase tracking-[0.2em]">
        This page has no content yet.
      </p>
    );
  }
  return <>{renderNodes(root.content)}</>;
}
