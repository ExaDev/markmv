/**
 * Wayback Machine URL conversion command.
 *
 * Rewrites HTTP(S) markdown links to point at the Wayback Machine. This is a pure text
 * transformation: no network calls are made, and the original URL (scheme, query string, and
 * fragment included) is preserved verbatim after the archive prefix.
 *
 * @category Commands
 */

import { existsSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { glob } from 'glob';
import { LinkParser } from '../core/link-parser.js';
import { PathUtils } from '../utils/path-utils.js';

/** Prefix that routes a URL through the Wayback Machine's any-snapshot endpoint. */
const WAYBACK_PREFIX = 'https://web.archive.org/web/*/';

/** Hostname of the Wayback Machine itself; links already here are left untouched. */
const WAYBACK_HOST = 'web.archive.org';

/** How a link href relates to Wayback conversion. */
type WebUrlClass = 'convertible' | 'already-archived' | 'non-web';

/** A span of the original file content to replace, as absolute character offsets. */
interface ContentSpan {
  start: number;
  end: number;
}

/** A single planned URL rewrite, anchored to its position in the file content. */
interface ContentEdit {
  span: ContentSpan;
  line: number;
  replacement: string;
}

/**
 * Configuration options for Wayback Machine conversion operations.
 *
 * @category Commands
 */
export interface WaybackOptions {
  /** Perform a dry run without making actual changes */
  dryRun?: boolean;
  /** Enable verbose output with detailed progress information */
  verbose?: boolean;
  /** Output results in JSON format */
  json?: boolean;
  /** Process directories recursively */
  recursive?: boolean;
}

/** A single converted link destination, with its location in the source file. */
export interface WaybackLinkChange {
  /** Absolute path of the file containing the link */
  file: string;
  /** Line number of the link destination (1-based) */
  line: number;
  /** The destination text before conversion, exactly as it appeared in the file */
  from: string;
  /** The destination text after conversion */
  to: string;
}

/** Per-file outcome of a Wayback conversion pass. */
export interface WaybackFileResult {
  /** Absolute path of the processed file */
  file: string;
  /** Number of link destinations rewritten to Wayback Machine URLs */
  converted: number;
  /** Number of HTTP(S) destinations already pointing at the Wayback Machine */
  alreadyArchived: number;
  /** Number of links left untouched (internal, anchor, mailto, ftp, and other non-web links) */
  untouched: number;
  /** Whether the file content changed and was written to disk */
  modified: boolean;
  /** Details of each conversion performed in this file */
  changes: WaybackLinkChange[];
}

/** Aggregate outcome of a Wayback conversion run across all requested files. */
export interface WaybackResult {
  /** Whether every file was processed without error */
  success: boolean;
  /** Whether this was a dry run (no files written) */
  dryRun: boolean;
  /** Number of files examined */
  filesProcessed: number;
  /** Number of files whose content changed on disk */
  filesModified: number;
  /** Total destinations rewritten to Wayback Machine URLs */
  totalConverted: number;
  /** Total destinations already pointing at the Wayback Machine */
  totalAlreadyArchived: number;
  /** Total links left untouched */
  totalUntouched: number;
  /** Per-file outcomes */
  files: WaybackFileResult[];
  /** Error messages for files that could not be processed */
  errors: string[];
}

/**
 * Convert an HTTP(S) URL to its Wayback Machine any-snapshot form.
 *
 * The result is the Wayback Machine origin followed by the any-snapshot wildcard path segment and
 * then the original URL appended verbatim, so query strings and anchor fragments stay part of the
 * original URL. A pure text transformation: no network access.
 *
 * @category Commands
 *
 * @example
 *   ```typescript toWaybackUrl('https://example.com/page?a=1#top'); // https://web.archive.org/web/[wildcard]/https://example.com/page?a=1#top```;
 *
 * @param url - The URL to convert
 *
 * @returns The Wayback Machine URL, or undefined when the URL is not convertible (not an absolute
 *   HTTP(S) URL, or already pointing at the Wayback Machine)
 */
export function toWaybackUrl(url: string): string | undefined {
  return classifyWebUrl(url) === 'convertible' ? WAYBACK_PREFIX + url : undefined;
}

/**
 * Classify a link href for Wayback conversion purposes.
 *
 * @param href - The href or reference-definition URL to classify
 *
 * @returns The class: convertible HTTP(S) URL, HTTP(S) URL already archived, or non-web link
 */
function classifyWebUrl(href: string): WebUrlClass {
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    // Not an absolute URL (internal path, anchor, or malformed href); absence is modelled explicitly rather than defaulted.
    return 'non-web';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'non-web';
  }

  // The URL constructor lowercases hostnames, so this also covers mixed-case archive hosts.
  if (parsed.hostname === WAYBACK_HOST) {
    return 'already-archived';
  }

  return 'convertible';
}

/**
 * Compute the absolute offset at which each 1-based line begins in the content.
 *
 * @param lines - The content already split into lines (without their newline terminators)
 *
 * @returns Array where entry i is the offset of line i+1's first character
 */
function computeLineStarts(lines: string[]): number[] {
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  return starts;
}

/**
 * Locate the inline link destination that starts at or after a node's start offset.
 *
 * A link or image node's destination is the text between the first closing-bracket-plus-parenthesis
 * sequence and the terminating parenthesis or whitespace; a bare destination cannot contain
 * whitespace, so the first whitespace or closing parenthesis after it ends it.
 *
 * @param content - The full file content
 * @param nodeStart - Absolute offset of the link node's first character
 *
 * @returns The destination span, or undefined when no plausible destination exists
 */
function findInlineDestinationSpan(content: string, nodeStart: number): ContentSpan | undefined {
  // Autolink form: the whole node is the URL enclosed in angle brackets.
  if (content[nodeStart] === '<') {
    const close = content.indexOf('>', nodeStart + 1);
    if (close === -1) {
      return undefined;
    }
    return { start: nodeStart + 1, end: close };
  }

  const open = content.indexOf('](', nodeStart);
  if (open === -1) {
    return undefined;
  }
  const destStart = open + 2;

  // Angle-bracketed destinations may contain spaces; the closing bracket ends the destination.
  if (content[destStart] === '<') {
    const close = content.indexOf('>', destStart + 1);
    if (close === -1) {
      return undefined;
    }
    return { start: destStart + 1, end: close };
  }

  return findBareDestinationSpan(content, destStart);
}

/**
 * Locate the destination of a reference-style link definition on its own line.
 *
 * A definition line has the form [label]: destination, optionally followed by a title; a bare
 * destination cannot contain whitespace, so it ends at the first whitespace, closing parenthesis,
 * carriage return, or end of line.
 *
 * @param lineText - The definition line's text without its newline terminator
 * @param lineStart - Absolute offset of the line's first character
 *
 * @returns The destination span, or undefined when the line has no definition delimiter
 */
function findDefinitionSpan(lineText: string, lineStart: number): ContentSpan | undefined {
  const close = lineText.indexOf(']:');
  if (close === -1) {
    return undefined;
  }

  let destStart = close + 2;
  while (
    destStart < lineText.length &&
    (lineText[destStart] === ' ' || lineText[destStart] === '\t')
  ) {
    destStart++;
  }

  // Angle-bracketed destinations may contain spaces; the closing bracket ends the destination.
  if (lineText[destStart] === '<') {
    const angleClose = lineText.indexOf('>', destStart + 1);
    if (angleClose !== -1) {
      return { start: lineStart + destStart + 1, end: lineStart + angleClose };
    }
  }

  for (let i = destStart; i < lineText.length; i++) {
    const ch = lineText[i];
    if (ch === ' ' || ch === '\t' || ch === ')' || ch === '\r') {
      return { start: lineStart + destStart, end: lineStart + i };
    }
  }
  return { start: lineStart + destStart, end: lineStart + lineText.length };
}

/**
 * Locate a bare (non-angle-bracketed) destination starting at the given offset.
 *
 * @param content - The full file content
 * @param destStart - Offset at which the destination text begins
 *
 * @returns The destination span, or undefined when the content ends before a terminator
 */
function findBareDestinationSpan(content: string, destStart: number): ContentSpan | undefined {
  for (let i = destStart; i < content.length; i++) {
    const ch = content[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === ')') {
      return { start: destStart, end: i };
    }
  }
  return undefined;
}

/**
 * Apply content edits without disturbing earlier offsets by splicing from the last edit backwards.
 *
 * @param content - The original file content
 * @param edits - The edits to apply; their spans must not overlap
 *
 * @returns The rewritten content
 */
function applyEdits(content: string, edits: ContentEdit[]): string {
  let updated = content;
  const ordered = [...edits].sort((a, b) => b.span.start - a.span.start);
  for (const edit of ordered) {
    updated = updated.slice(0, edit.span.start) + edit.replacement + updated.slice(edit.span.end);
  }
  return updated;
}

/**
 * Convert every convertible HTTP(S) destination in one markdown file.
 *
 * Link destinations are found with the LinkParser, so only genuine markdown links are rewritten;
 * URLs in code blocks or prose never match a parsed destination.
 *
 * @param filePath - Absolute path of the markdown file to process
 * @param dryRun - When true, compute the rewrite but leave the file on disk unchanged
 *
 * @returns The per-file outcome, with counts and per-link change details
 */
async function processWaybackFile(filePath: string, dryRun: boolean): Promise<WaybackFileResult> {
  const content = await readFile(filePath, 'utf-8');
  const parser = new LinkParser();
  const parsed = await parser.parseFile(filePath);
  const lines = content.split('\n');
  const lineStarts = computeLineStarts(lines);

  const result: WaybackFileResult = {
    file: filePath,
    converted: 0,
    alreadyArchived: 0,
    untouched: 0,
    modified: false,
    changes: [],
  };
  const edits: ContentEdit[] = [];

  // Reference usages convert together with their definition, so a definition only counts separately when no usage links to it.
  const usedReferenceIds = new Set<string>();
  for (const link of parsed.links) {
    if (link.referenceId !== undefined) {
      usedReferenceIds.add(link.referenceId);
    }
  }

  for (const link of parsed.links) {
    const urlClass = classifyWebUrl(link.href);

    if (urlClass === 'already-archived') {
      result.alreadyArchived++;
      continue;
    }
    if (urlClass === 'non-web') {
      result.untouched++;
      continue;
    }

    if (link.referenceId !== undefined) {
      // A reference-style usage carries no destination of its own; the physical rewrite happens on its definition below.
      result.converted++;
      continue;
    }

    const nodeStart = lineStarts[link.line - 1] + (link.column - 1);
    const span = findInlineDestinationSpan(content, nodeStart);
    if (span === undefined) {
      throw new Error(
        `Could not locate the destination of the link at line ${link.line}, column ${link.column} in ${filePath}`
      );
    }

    const rawDestination = content.slice(span.start, span.end);
    const replacement = WAYBACK_PREFIX + rawDestination;
    edits.push({ span, line: link.line, replacement });
    result.converted++;
    result.changes.push({ file: filePath, line: link.line, from: rawDestination, to: replacement });
  }

  for (const reference of parsed.references) {
    const urlClass = classifyWebUrl(reference.url);
    const used = usedReferenceIds.has(reference.id);

    if (urlClass === 'convertible') {
      const lineText = lines[reference.line - 1];
      const span = findDefinitionSpan(lineText, lineStarts[reference.line - 1]);
      if (span === undefined) {
        throw new Error(
          `Could not locate the destination of reference definition [${reference.id}] at line ${reference.line} in ${filePath}`
        );
      }

      const rawDestination = content.slice(span.start, span.end);
      const replacement = WAYBACK_PREFIX + rawDestination;
      edits.push({ span, line: reference.line, replacement });
      result.changes.push({
        file: filePath,
        line: reference.line,
        from: rawDestination,
        to: replacement,
      });
      if (!used) {
        result.converted++;
      }
    } else if (urlClass === 'already-archived') {
      if (!used) {
        result.alreadyArchived++;
      }
    } else if (!used) {
      result.untouched++;
    }
  }

  if (edits.length > 0) {
    const updated = applyEdits(content, edits);
    if (!dryRun) {
      await writeFile(filePath, updated, 'utf-8');
    }
    result.modified = !dryRun;
  }

  return result;
}

/**
 * Expand source patterns (which may include globs) to actual markdown file paths.
 *
 * @param patterns - Array of file patterns or direct paths to expand
 * @param options - Wayback options, used for verbose output
 *
 * @returns Promise resolving to an array of absolute markdown file paths
 *
 * @throws Error if no markdown files are found
 */
async function expandSourcePatterns(
  patterns: string[],
  options: WaybackOptions
): Promise<string[]> {
  const resolvedFiles = new Set<string>();

  for (const pattern of patterns) {
    const absolutePattern = resolve(pattern);

    if (existsSync(absolutePattern) && statSync(absolutePattern).isFile()) {
      if (PathUtils.isMarkdownFile(absolutePattern)) {
        resolvedFiles.add(absolutePattern);
      } else {
        console.warn(`Skipping non-markdown file: ${absolutePattern}`);
      }
      continue;
    }

    if (existsSync(absolutePattern) && statSync(absolutePattern).isDirectory()) {
      // A directory expands to its markdown files: everything beneath it recursively, or only its direct children.
      // Glob patterns use forward slashes on every platform; backslashes are pattern escapes
      const globPattern = options.recursive
        ? `${absolutePattern.replace(/\\/g, '/')}/**/*.md`
        : `${absolutePattern.replace(/\\/g, '/')}/*.md`;
      const files = await glob(globPattern, { absolute: true });
      files.forEach((file) => resolvedFiles.add(file));
      if (options.verbose) {
        console.log(`Added ${files.length} files from directory: ${absolutePattern}`);
      }
      continue;
    }

    const files = await glob(pattern.replace(/\\/g, '/'), { absolute: true });
    const markdownFiles = files.filter((file) => PathUtils.isMarkdownFile(file));
    markdownFiles.forEach((file) => resolvedFiles.add(file));
  }

  const finalFiles = Array.from(resolvedFiles);

  if (finalFiles.length === 0) {
    throw new Error(
      `No markdown files found matching the provided patterns: ${patterns.join(', ')}`
    );
  }

  return finalFiles.sort();
}

/**
 * CLI command handler for Wayback Machine URL conversion.
 *
 * Rewrites external HTTP(S) link destinations to the Wayback Machine any-snapshot form.
 * Destinations already pointing at web.archive.org are preserved, and non-web links (mailto, ftp,
 * internal, anchors) are left untouched. Makes no network calls: this is a pure text transformation
 * over the parsed markdown links.
 *
 * @category Commands
 *
 * @example
 *   ```bash markmv wayback docs/*.md --dry-run --verbose```;
 *
 * @param patterns - File patterns to process (supports globs)
 * @param options - Command options controlling dry-run, verbosity, JSON output, and recursion
 *
 * @returns Promise resolving to the aggregate conversion result
 */
export async function waybackCommand(
  patterns: string[],
  options: WaybackOptions = {}
): Promise<WaybackResult> {
  let result: WaybackResult;
  try {
    result = await convertPatterns(patterns, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Wayback conversion failed: ${message}`);
    process.exit(1);
  }

  if (!result.success) {
    process.exit(1);
  }

  return result;
}

/**
 * Run the Wayback conversion across all files matching the patterns.
 *
 * Per-file failures are collected into the result rather than thrown; only a failure to resolve any
 * file at all (invalid patterns, no matches) propagates to the caller.
 *
 * @param patterns - File patterns to process (supports globs)
 * @param options - Command options controlling dry-run, verbosity, JSON output, and recursion
 *
 * @returns Promise resolving to the aggregate conversion result
 *
 * @throws Error if no patterns are given or no markdown files match
 */
async function convertPatterns(
  patterns: string[],
  options: WaybackOptions
): Promise<WaybackResult> {
  if (!patterns || patterns.length === 0) {
    throw new Error('At least one file pattern must be specified');
  }

  const files = await expandSourcePatterns(patterns, options);

  const result: WaybackResult = {
    success: true,
    dryRun: options.dryRun === true,
    filesProcessed: files.length,
    filesModified: 0,
    totalConverted: 0,
    totalAlreadyArchived: 0,
    totalUntouched: 0,
    files: [],
    errors: [],
  };

  for (const file of files) {
    try {
      const fileResult = await processWaybackFile(file, result.dryRun);
      result.files.push(fileResult);
      result.totalConverted += fileResult.converted;
      result.totalAlreadyArchived += fileResult.alreadyArchived;
      result.totalUntouched += fileResult.untouched;
      if (fileResult.modified) {
        result.filesModified++;
      }
    } catch (error) {
      result.success = false;
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to process ${file}: ${message}`);
    }
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanSummary(result, options);
    result.errors.forEach((error) => console.error(`❌ ${error}`));
  }

  return result;
}

/**
 * Print the human-readable conversion report.
 *
 * Per-file detail and the change list are verbose-only; the summary block always prints so a plain
 * run still reports what happened.
 *
 * @param result - The aggregate conversion result to report
 * @param options - The command options controlling verbosity
 */
function printHumanSummary(result: WaybackResult, options: WaybackOptions): void {
  if (options.verbose) {
    console.log('🕸️ Starting Wayback Machine conversion...');
    if (result.dryRun) {
      console.log('Dry run mode: no files will be modified');
    }
    for (const file of result.files) {
      console.log(`Processing: ${file.file}`);
      console.log(`  ✅ Converted: ${file.converted}`);
      console.log(`  📚 Already archived: ${file.alreadyArchived}`);
      console.log(`  ➡️ Untouched: ${file.untouched}`);
      for (const change of file.changes) {
        console.log(`  🔄 Line ${change.line}: ${change.from} → ${change.to}`);
      }
    }
  }

  console.log('\n📊 Wayback Machine Summary');
  console.log(`Files processed: ${result.filesProcessed}`);
  console.log(`Files modified: ${result.filesModified}`);
  console.log(`Links converted: ${result.totalConverted}`);
  console.log(`Already archived: ${result.totalAlreadyArchived}`);
  console.log(`Untouched: ${result.totalUntouched}`);

  if (result.dryRun) {
    console.log('\n(Dry run - no files were actually modified)');
  } else if (result.totalConverted === 0) {
    console.log('\nNo HTTP(S) links needed conversion');
  } else {
    console.log('\n✅ Wayback conversion completed successfully');
  }
}
