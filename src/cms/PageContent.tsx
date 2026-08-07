import { Fragment, type ReactNode } from 'react';
import { OptimizedImage } from '../components/OptimizedImage';

/**
 * Renders a TipTap document.
 *
 * Walks the node tree and emits known node types rather than setting innerHTML.
 * The body is authored by an admin, but rendering stored markup verbatim would
 * make any future write path an XSS vector; an unrecognised node is skipped
 * instead.
 */

type Mark = { type: string; attrs?: Record<string, unknown> };
type Node = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Mark[];
  content?: Node[];
};

const alignClass = (attrs: Record<string, unknown> | undefined): string => {
  const align = attrs?.textAlign;
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return '';
};

/** Only http(s) and mailto links are emitted; javascript: URLs are dropped. */
const safeHref = (href: unknown): string | null => {
  if (typeof href !== 'string') return null;
  try {
    const url = new URL(href, 'https://example.com');
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? href : null;
  } catch {
    return null;
  }
};

const applyMarks = (text: ReactNode, marks: Mark[] | undefined, key: string): ReactNode => {
  if (!marks?.length) return text;

  return marks.reduce<ReactNode>((acc, mark, i) => {
    const markKey = `${key}-m${i}`;
    switch (mark.type) {
      case 'bold':
        return <strong key={markKey}>{acc}</strong>;
      case 'italic':
        return <em key={markKey}>{acc}</em>;
      case 'strike':
        return <s key={markKey}>{acc}</s>;
      case 'code':
        return (
          <code key={markKey} className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.9em]">
            {acc}
          </code>
        );
      case 'link': {
        const href = safeHref(mark.attrs?.href);
        if (!href) return acc;
        return (
          <a
            key={markKey}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-white"
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

const renderNodes = (nodes: Node[] | undefined, keyPrefix = 'n'): ReactNode =>
  (nodes ?? []).map((node, i) => (
    <Fragment key={`${keyPrefix}-${i}`}>{renderNode(node, `${keyPrefix}-${i}`)}</Fragment>
  ));

const renderNode = (node: Node, key: string): ReactNode => {
  switch (node.type) {
    case 'text':
      return applyMarks(node.text ?? '', node.marks, key);

    case 'paragraph':
      return (
        <p className={`mb-5 text-[15px] leading-[1.75] text-white/70 ${alignClass(node.attrs)}`}>
          {renderNodes(node.content, key)}
        </p>
      );

    case 'heading': {
      const level = Number(node.attrs?.level) === 3 ? 3 : 2;
      const Tag = level === 3 ? 'h3' : 'h2';
      const size = level === 3 ? 'text-sm tracking-[0.2em]' : 'text-base tracking-[0.24em]';
      return (
        <Tag className={`mt-12 mb-4 uppercase ${size} font-light text-white ${alignClass(node.attrs)}`}>
          {renderNodes(node.content, key)}
        </Tag>
      );
    }

    case 'bulletList':
      return (
        <ul className="mb-5 list-disc space-y-2 pl-5 text-[15px] leading-[1.75] text-white/70 marker:text-white/30">
          {renderNodes(node.content, key)}
        </ul>
      );

    case 'orderedList':
      return (
        <ol className="mb-5 list-decimal space-y-2 pl-5 text-[15px] leading-[1.75] text-white/70 marker:text-white/30">
          {renderNodes(node.content, key)}
        </ol>
      );

    case 'listItem':
      return <li>{renderNodes(node.content, key)}</li>;

    case 'blockquote':
      return (
        <blockquote className="mb-6 border-l border-white/20 pl-5 text-[15px] leading-[1.75] text-white/50 italic">
          {renderNodes(node.content, key)}
        </blockquote>
      );

    case 'codeBlock':
      return (
        <pre className="mb-6 overflow-x-auto border border-white/10 bg-white/[0.03] p-4 font-mono text-[12px] text-white/70">
          <code>{renderNodes(node.content, key)}</code>
        </pre>
      );

    case 'horizontalRule':
      return <hr className="my-10 border-white/10" />;

    case 'hardBreak':
      return <br />;

    case 'image': {
      const src = safeHref(node.attrs?.src);
      if (!src) return null;
      const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : '';
      return (
        <figure className="my-8">
          {/* Routed through image optimization like the gallery, so page media
              is not served at full resolution either. */}
          <OptimizedImage
            src={src}
            alt={alt}
            sizes="(min-width: 768px) 720px, 100vw"
            className="h-auto w-full"
          />
          {alt && <figcaption className="mt-2 text-[10px] uppercase tracking-[0.18em] text-white/25">{alt}</figcaption>}
        </figure>
      );
    }

    default:
      // Unknown node: render its children if it has any, otherwise skip.
      return node.content ? renderNodes(node.content, key) : null;
  }
};

export function PageContent({ doc }: { doc: unknown }) {
  const root = doc as Node | undefined;
  if (!root || root.type !== 'doc' || !Array.isArray(root.content) || root.content.length === 0) {
    return (
      <p className="text-[11px] uppercase tracking-[0.2em] text-white/25">
        This page has no content yet.
      </p>
    );
  }
  return <>{renderNodes(root.content)}</>;
}
