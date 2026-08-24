import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { Node } from "unist";

/** MDAST image node shape, redefined locally to avoid exporting parser internals. */
interface ImageNode extends Node {
  type: "image";
  url: string;
  title?: string | null | undefined;
  alt?: string | null | undefined;
}

/**
 * A markdown image link occurrence with its exact span in the source content.
 *
 * The span covers the whole `![alt](href)` expression so callers can rewrite the occurrence
 * surgically without re-serialising the surrounding document.
 *
 * @category Core
 */
export interface ImageLinkOccurrence {
  /** Alt text between the brackets, or undefined when the brackets are empty */
  alt: string | undefined;
  /** The href exactly as written in the source */
  href: string;
  /** Link title exactly as written, or undefined when absent */
  title: string | undefined;
  /** Start offset of the leading `!` in the surrounding content */
  start: number;
  /** End offset (exclusive) just past the closing parenthesis */
  end: number;
}

/**
 * Find image links in markdown content whose href points at a local file.
 *
 * Uses the markdown AST, so images that merely look like syntax (inside fenced code blocks, for
 * example) are not reported. A href counts as local when it carries no URI scheme, is not a data
 * URI, and is not a same-file anchor.
 *
 * @category Core
 *
 * @param content - Markdown content to scan
 *
 * @returns Occurrences of local image links in source order
 */
export function findLocalImages(content: string): ImageLinkOccurrence[] {
  return findImageOccurrences(content, (href) => isLocalImagePath(href));
}

/**
 * Find image links in markdown content whose href is an inline data URI.
 *
 * @category Core
 *
 * @param content - Markdown content to scan
 *
 * @returns Occurrences of data URI image links in source order
 */
export function findInlineImages(content: string): ImageLinkOccurrence[] {
  return findImageOccurrences(content, (href) => href.startsWith("data:"));
}

/** The payload of a parsed inline data URI: its exact media type and base64 payload. */
export interface ParsedImageDataUri {
  /** Media type exactly as written in the URI, always an image type */
  mimeType: string;
  /** The base64 payload between the comma and the end of the URI */
  data: string;
}

/** Longest prefix of a data URI included in error messages, so malformed URIs cannot flood output. */
const ERROR_PREVIEW_LENGTH = 60;

/**
 * Parse an inline base64 image data URI.
 *
 * @category Core
 *
 * @param href - The data URI to parse, typically an image link href
 *
 * @returns The media type and base64 payload
 *
 * @throws Error when the URI is malformed, not base64 encoded, or not an image type
 */
export function parseImageDataUri(href: string): ParsedImageDataUri {
  const separatorIndex = href.indexOf(",");
  if (!href.startsWith("data:") || separatorIndex === -1) {
    throw new Error(
      `Malformed data URI (no payload): ${href.slice(0, ERROR_PREVIEW_LENGTH)}`,
    );
  }

  const metadata = href.slice("data:".length, separatorIndex);
  const data = href.slice(separatorIndex + 1);
  const [mimeType, ...parameters] = metadata.split(";");

  if (!mimeType.startsWith("image/")) {
    throw new Error(`Not an image data URI: "${mimeType}"`);
  }
  if (!parameters.includes("base64")) {
    throw new Error(`Only base64 data URIs are supported, got: "${metadata}"`);
  }

  return { mimeType, data };
}

/** File extensions embeddable as inline data URIs, keyed by the canonical lowercase extension. */
const MIME_BY_EXTENSION: Partial<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
  tif: "image/tiff",
  tiff: "image/tiff",
};

/** Preferred file extension for each supported image mime type; jpeg deliberately maps to jpg. */
const EXTENSION_BY_MIME: Partial<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/x-icon": "ico",
  "image/avif": "avif",
  "image/tiff": "tiff",
};

/**
 * Resolve the mime type for an image file extension.
 *
 * @category Core
 *
 * @param extension - File extension with or without a leading dot; case-insensitive
 *
 * @returns The image mime type for the extension
 *
 * @throws Error when the extension has no known image mime type
 */
export function imageMimeTypeForExtension(extension: string): string {
  const normalised = extension.replace(/^\./, "").toLowerCase();
  const mimeType = MIME_BY_EXTENSION[normalised];
  if (mimeType === undefined) {
    throw new Error(
      `Unsupported image extension ".${normalised}"; supported extensions: ${Object.keys(MIME_BY_EXTENSION).join(", ")}`,
    );
  }
  return mimeType;
}

/**
 * Resolve the preferred file extension for an image mime type.
 *
 * @category Core
 *
 * @param mimeType - Image mime type, for example the one parsed from a data URI
 *
 * @returns The file extension without a leading dot
 *
 * @throws Error when the mime type has no known image file extension
 */
export function imageExtensionForMimeType(mimeType: string): string {
  const extension = EXTENSION_BY_MIME[mimeType.toLowerCase()];
  if (extension === undefined) {
    throw new Error(
      `Unsupported image mime type "${mimeType}"; supported types: ${Object.keys(EXTENSION_BY_MIME).join(", ")}`,
    );
  }
  return extension;
}

/**
 * Render an image link in standard markdown syntax.
 *
 * Bracket characters in the alt text are backslash-escaped so the rendered link stays a single
 * image node when re-parsed. A href containing whitespace is angle-wrapped, the form markdown
 * requires for such hrefs; data URIs never contain whitespace and pass through unwrapped.
 *
 * @category Core
 *
 * @param alt - Alt text, or undefined for empty brackets
 * @param href - The href, typically a data URI or a filesystem path
 * @param title - Optional link title rendered after the href
 *
 * @returns The rendered `![alt](href "title")` expression
 */
export function renderImageMarkdown(
  alt: string | undefined,
  href: string,
  title?: string,
): string {
  const escapedAlt = (alt ?? "").replaceAll("[", "\\[").replaceAll("]", "\\]");
  const wrappedHref = /\s/.test(href) ? `<${href}>` : href;
  const titlePart =
    title === undefined ? "" : ` "${title.replaceAll('"', '\\"')}"`;
  return `![${escapedAlt}](${wrappedHref}${titlePart})`;
}

/** Whether an image href names a file on the local filesystem rather than another resource kind. */
function isLocalImagePath(href: string): boolean {
  if (href === "" || href.startsWith("#") || href.startsWith("data:"))
    return false;
  // A leading URI scheme (https:, mailto:, file:, ...) marks a non-filesystem reference. Schemes are two or more characters so a windows drive letter (C:/pics/x.png) stays a local path.
  return !/^[a-zA-Z][a-zA-Z0-9+.-]{1,}:/.test(href);
}

/** Walk image nodes and keep those whose href satisfies the predicate. */
function findImageOccurrences(
  content: string,
  keep: (href: string) => boolean,
): ImageLinkOccurrence[] {
  const tree = unified().use(remarkParse).parse(content);
  const occurrences: ImageLinkOccurrence[] = [];

  visit(tree, "image", (node: ImageNode) => {
    const startOffset = node.position?.start.offset;
    const endOffset = node.position?.end.offset;
    if (startOffset === undefined || endOffset === undefined) return;
    if (!keep(node.url)) return;

    occurrences.push({
      alt: node.alt ?? undefined,
      href: node.url,
      title: node.title ?? undefined,
      start: startOffset,
      end: endOffset,
    });
  });

  return occurrences;
}

/** A source span to replace with new text. */
export interface SpanReplacement {
  /** Start offset of the span, inclusive */
  start: number;
  /** End offset of the span, exclusive */
  end: number;
  /** The text the span is replaced with */
  replacement: string;
}

/**
 * Replace spans of content with new text, leaving everything outside the spans byte-identical.
 *
 * @category Core
 *
 * @param content - The original content
 * @param replacements - Spans to replace, in any order; they must not overlap
 *
 * @returns The content with every span replaced
 *
 * @throws Error when spans overlap or lie outside the content bounds
 */
export function replaceSpans(
  content: string,
  replacements: SpanReplacement[],
): string {
  const ordered = [...replacements].sort((a, b) => a.start - b.start);

  for (let index = 0; index < ordered.length; index++) {
    const current = ordered[index];
    if (
      current.start < 0 ||
      current.end > content.length ||
      current.start > current.end
    ) {
      throw new Error(
        `Replacement span [${String(current.start)}, ${String(current.end)}) is out of bounds for content of length ${String(content.length)}`,
      );
    }
    const next = ordered.at(index + 1);
    if (next !== undefined && next.start < current.end) {
      throw new Error(
        `Replacement spans [${String(current.start)}, ${String(current.end)}) and [${String(next.start)}, ${String(next.end)}) overlap`,
      );
    }
  }

  let result = "";
  let cursor = 0;
  for (const { start, end, replacement } of ordered) {
    result += content.slice(cursor, start) + replacement;
    cursor = end;
  }
  return result + content.slice(cursor);
}
