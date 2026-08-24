import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { LinkParser } from '../core/link-parser.js';
import { resolveWikilinks } from '../core/obsidian-vault.js';
import { LinkValidator } from '../core/link-validator.js';
import type { ParsedMarkdownFile } from '../types/links.js';
import { PathUtils } from '../utils/path-utils.js';

/**
 * Counts words in markdown content, excluding fenced code blocks and inline code spans.
 *
 * The word-count rule is deliberately simple and deterministic: fenced code blocks (lines opening
 * with three or more backticks or tildes, up to the matching closing fence) and inline code spans
 * (backtick-delimited runs) are removed first, then the remaining text is split on whitespace and
 * every non-empty token counts as one word. Link syntax, headings markers, and punctuation all
 * count as part of their surrounding tokens.
 *
 * @category Commands
 *
 * @param content - Raw markdown file content
 *
 * @returns Number of whitespace-separated tokens outside code spans and fences
 */
export function countWords(content: string): number {
  const withoutFences = content.replace(
    /(^[ \t]{0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*$/gm,
    ''
  );
  const withoutCodeSpans = withoutFences.replace(/(`+)[\s\S]*?\1/g, ' ');
  const tokens = withoutCodeSpans.split(/\s+/).filter((token) => token.length > 0);
  return tokens.length;
}

/**
 * Per-file measurements gathered while scanning a markdown tree.
 *
 * A scanned file carries everything the tree renderer and the statistics builder need, so both stay
 * pure functions over this shape.
 *
 * @category Commands
 */
export interface ScannedMarkdownFile {
  /** Absolute file path */
  path: string;
  /** Path relative to the scan root, with forward slashes regardless of platform */
  relativePath: string;
  /** Word count outside code spans and fences (see countWords) */
  wordCount: number;
  /** Total number of parsed links of every type */
  linkCount: number;
  /** Number of parsed links whose type is internal */
  internalLinkCount: number;
  /** Number of parsed links whose type is external */
  externalLinkCount: number;
  /** Number of internal links whose target file does not exist */
  brokenInternalLinkCount: number;
  /** Number of links from other scanned files that resolve to this file */
  inboundLinkCount: number;
}

/**
 * Aggregate documentation statistics for a scanned markdown tree.
 *
 * Field order is the serialisation order used by the JSON output and is kept stable so machine
 * consumers see identical key ordering across runs.
 *
 * @category Commands
 */
export interface TreeStatistics {
  /** Total number of markdown files scanned */
  totalFiles: number;
  /** Sum of per-file word counts */
  totalWords: number;
  /** Total number of internal (file-to-file) links */
  totalInternalLinks: number;
  /** Total number of external HTTP/HTTPS links */
  totalExternalLinks: number;
  /** Internal links whose target file does not exist */
  brokenInternalLinks: number;
  /** Files no other scanned file links to */
  orphanedFiles: number;
}

/**
 * Aggregates per-file measurements into tree statistics.
 *
 * A file counts as orphaned when no other scanned file holds a link resolving to it
 * (inboundLinkCount === 0), so single-file scans report one orphan.
 *
 * @category Commands
 *
 * @param files - Scanned file measurements for the full scan
 *
 * @returns Aggregate statistics with a stable field order
 */
export function computeTreeStatistics(files: ScannedMarkdownFile[]): TreeStatistics {
  return {
    totalFiles: files.length,
    totalWords: files.reduce((sum, file) => sum + file.wordCount, 0),
    totalInternalLinks: files.reduce((sum, file) => sum + file.internalLinkCount, 0),
    totalExternalLinks: files.reduce((sum, file) => sum + file.externalLinkCount, 0),
    brokenInternalLinks: files.reduce((sum, file) => sum + file.brokenInternalLinkCount, 0),
    orphanedFiles: files.filter((file) => file.inboundLinkCount === 0).length,
  };
}

/**
 * A markdown file leaf in the rendered tree.
 *
 * Field order is the serialisation order used by the JSON output and is kept stable.
 *
 * @category Commands
 */
export interface TreeFileNode {
  /** File name including extension */
  name: string;
  /** Path relative to the scan root, with forward slashes */
  path: string;
  /** Word count outside code spans and fences */
  wordCount: number;
  /** Total number of parsed links of every type */
  linkCount: number;
  /** Internal links whose target file does not exist */
  brokenInternalLinkCount: number;
  /** Whether no other scanned file links to this file */
  orphaned: boolean;
}

/**
 * A directory node in the rendered tree.
 *
 * Directories always sort before files, each group alphabetically by codepoint order so the
 * rendering is deterministic across machines and locales.
 *
 * @category Commands
 */
export interface TreeDirectoryNode {
  /** Directory name; empty string for the scan root */
  name: string;
  /** Path relative to the scan root, with forward slashes; empty string for the root */
  path: string;
  /** Child directories, sorted alphabetically */
  directories: TreeDirectoryNode[];
  /** Markdown files directly inside this directory, sorted alphabetically */
  files: TreeFileNode[];
  /** Whether max-depth cut off this directory's children from the rendering */
  truncated: boolean;
}

/** Directory names never included in a markdown tree scan */
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(['node_modules', '.git', 'dist']);

/** Intermediate mutable directory used while grouping scanned files by path */
interface MutableDirectory {
  name: string;
  directories: Map<string, MutableDirectory>;
  files: Map<string, ScannedMarkdownFile>;
}

/** Codepoint-order comparison, so ordering is identical regardless of the host locale */
function compareNames(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Convert a mutable grouping directory into an immutable, sorted, depth-limited tree node */
function toDirectoryNode(
  directory: MutableDirectory,
  path: string,
  depth: number,
  maxDepth: number | undefined
): TreeDirectoryNode {
  const childDepth = depth + 1;
  const childrenAllowed = maxDepth === undefined || childDepth <= maxDepth;

  if (!childrenAllowed) {
    return {
      name: directory.name,
      path,
      directories: [],
      files: [],
      truncated: directory.directories.size > 0 || directory.files.size > 0,
    };
  }

  return {
    name: directory.name,
    path,
    directories: Array.from(directory.directories.values())
      .sort((a, b) => compareNames(a.name, b.name))
      .map((child) =>
        toDirectoryNode(
          child,
          path === '' ? child.name : `${path}/${child.name}`,
          childDepth,
          maxDepth
        )
      ),
    files: Array.from(directory.files.entries())
      .sort(([nameA], [nameB]) => compareNames(nameA, nameB))
      .map(([name, file]) => ({
        name,
        path: file.relativePath,
        wordCount: file.wordCount,
        linkCount: file.linkCount,
        brokenInternalLinkCount: file.brokenInternalLinkCount,
        orphaned: file.inboundLinkCount === 0,
      })),
    truncated: false,
  };
}

/**
 * Groups scanned markdown files into a nested directory tree.
 *
 * Files under node_modules, .git, or dist directories are excluded at any depth. Directories sort
 * before files and each group sorts alphabetically. When maxDepth is given, entries deeper than the
 * limit are cut from the rendering (the affected directory is flagged truncated); statistics
 * computed from the scanned files are unaffected because they never read this tree.
 *
 * @category Commands
 *
 * @param files - Scanned file measurements for the full scan
 * @param maxDepth - Maximum rendering depth, where the root is depth 0 and its children depth 1
 *
 * @returns The root directory node; its name and path are empty strings
 *
 * @throws Error if a scanned file carries an empty relative path
 */
export function buildFileTree(files: ScannedMarkdownFile[], maxDepth?: number): TreeDirectoryNode {
  const root: MutableDirectory = { name: '', directories: new Map(), files: new Map() };

  for (const file of files) {
    const segments = file.relativePath.split('/');
    const fileName = segments.pop();

    if (fileName === undefined || fileName === '') {
      throw new Error(`Scanned file has an empty relative path: ${file.path}`);
    }

    if (segments.some((segment) => SKIPPED_DIRECTORIES.has(segment))) {
      continue;
    }

    let current = root;
    for (const segment of segments) {
      let child = current.directories.get(segment);
      if (child === undefined) {
        child = { name: segment, directories: new Map(), files: new Map() };
        current.directories.set(segment, child);
      }
      current = child;
    }

    current.files.set(fileName, file);
  }

  return toDirectoryNode(root, '', 0, maxDepth);
}

/** Render a file annotation in the form "(8 words, 2 links)" with singular forms for counts of one */
function formatAnnotation(file: TreeFileNode): string {
  const words = `${String(file.wordCount)} ${file.wordCount === 1 ? 'word' : 'words'}`;
  const links = `${String(file.linkCount)} ${file.linkCount === 1 ? 'link' : 'links'}`;
  return ` (${words}, ${links})`;
}

/**
 * Render the warning markers for a file: "[1 broken]" when links are broken, "[orphan]" when
 * unlinked
 */
function formatWarningMarkers(file: TreeFileNode): string {
  let markers = '';
  if (file.brokenInternalLinkCount > 0) {
    markers += ` [${String(file.brokenInternalLinkCount)} broken]`;
  }
  if (file.orphaned) {
    markers += ' [orphan]';
  }
  return markers;
}

/** Append one tree entry line and recurse into children, using classic tree-drawing prefixes */
function appendDirectoryLines(directory: TreeDirectoryNode, lines: string[], prefix: string): void {
  const entries: { label: string; child?: TreeDirectoryNode }[] = [
    ...directory.directories.map((child) => ({
      label: `${child.name}/${child.truncated ? ' ...' : ''}`,
      child,
    })),
    ...directory.files.map((file) => ({
      label: `${file.name}${formatAnnotation(file)}${formatWarningMarkers(file)}`,
    })),
  ];

  entries.forEach((entry, index) => {
    const isLast = index === entries.length - 1;
    const brancher = isLast ? '└── ' : '├── ';
    lines.push(`${prefix}${brancher}${entry.label}`);

    if (entry.child !== undefined && !entry.child.truncated) {
      appendDirectoryLines(entry.child, lines, `${prefix}${isLast ? '    ' : '│   '}`);
    }
  });
}

/**
 * Renders a tree node as an ASCII directory listing with box-drawing characters.
 *
 * Directory entries end with a slash; files carry a "(N words, M links)" annotation plus a "[N
 * broken]" marker for files with broken internal links and an "[orphan]" marker for files no other
 * scanned file links to. Directories cut off by max-depth render as "name/ ...".
 *
 * @category Commands
 *
 * @param root - Tree node to render, as produced by buildFileTree
 * @param rootLabel - Label printed on the first line for the scan root
 *
 * @returns The full rendering, one entry per line, without a trailing newline
 */
export function renderTreeAscii(root: TreeDirectoryNode, rootLabel: string): string {
  const lines: string[] = [rootLabel];
  appendDirectoryLines(root, lines, '');
  return lines.join('\n');
}

/** Options controlling scanner progress output */
export interface ScanOptions {
  /** Print each directory walked and each file parsed */
  verbose?: boolean;
}

/** Recursively collect markdown file paths under a directory, skipping the excluded directories */
async function collectMarkdownFiles(dirPath: string, options: ScanOptions): Promise<string[]> {
  const collected: string[] = [];

  if (options.verbose) {
    console.log(`Scanning: ${dirPath}`);
  }

  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = resolve(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) {
        if (options.verbose) {
          console.log(`Skipping excluded directory: ${entryPath}`);
        }
        continue;
      }
      collected.push(...(await collectMarkdownFiles(entryPath, options)));
    } else if (entry.isFile() && PathUtils.isMarkdownFile(entryPath)) {
      collected.push(entryPath);
    }
  }

  return collected;
}

/**
 * Scans a directory (or a single markdown file) and measures every markdown file found.
 *
 * Files are parsed with LinkParser and internal links are checked with LinkValidator in
 * file-existence mode only, so no network access happens. The inbound link count is derived across
 * the whole parsed set: every link whose resolved path names another scanned file increments that
 * file's inbound count, and a file with zero inbound links is an orphan.
 *
 * @category Commands
 *
 * @param targetPath - Directory to scan recursively, or a single markdown file
 * @param options - Scan options
 *
 * @returns Scanned file measurements ordered by relative path, excluding skipped directories
 *
 * @throws Error if the target path does not exist or a file cannot be read or parsed
 */
export async function scanMarkdownTree(
  targetPath: string,
  options: ScanOptions = {}
): Promise<ScannedMarkdownFile[]> {
  const absoluteTarget = resolve(targetPath);
  const targetStat = await stat(absoluteTarget);

  if (!targetStat.isDirectory() && !targetStat.isFile()) {
    throw new Error(`Target path is neither a directory nor a file: ${absoluteTarget}`);
  }

  const scanRoot = targetStat.isFile() ? dirname(absoluteTarget) : absoluteTarget;
  const filePaths = targetStat.isFile()
    ? [absoluteTarget]
    : await collectMarkdownFiles(absoluteTarget, options);
  const parser = new LinkParser();
  const validator = new LinkValidator({ checkExternal: false });

  const parsedFiles: ParsedMarkdownFile[] = [];
  for (const filePath of filePaths) {
    if (options.verbose) {
      console.log(`Parsing: ${filePath}`);
    }
    parsedFiles.push(await parser.parseFile(filePath));
  }

  // Resolve wikilinks against the whole scanned set so vault-style references count as inbound
  // links and orphan detection sees them
  resolveWikilinks(parsedFiles, PathUtils.findCommonBase(filePaths));

  const scannedByPath = new Map<string, ScannedMarkdownFile>();
  for (const parsed of parsedFiles) {
    const content = await readFile(parsed.filePath, 'utf-8');

    const internalLinks = parsed.links.filter((link) => link.type === 'internal');
    let brokenInternalLinkCount = 0;
    for (const link of internalLinks) {
      const broken = await validator.validateLink(link, parsed.filePath);
      if (broken !== null) {
        brokenInternalLinkCount++;
      }
    }

    scannedByPath.set(parsed.filePath, {
      path: parsed.filePath,
      relativePath: relative(scanRoot, parsed.filePath).split('\\').join('/'),
      wordCount: countWords(content),
      linkCount: parsed.links.length,
      internalLinkCount: internalLinks.length,
      externalLinkCount: parsed.links.filter((link) => link.type === 'external').length,
      brokenInternalLinkCount,
      inboundLinkCount: 0,
    });
  }

  for (const parsed of parsedFiles) {
    for (const link of parsed.links) {
      const target = link.resolvedPath;
      if (target === undefined || target === parsed.filePath) {
        continue;
      }
      const scanned = scannedByPath.get(target);
      if (scanned !== undefined) {
        scanned.inboundLinkCount++;
      }
    }
  }

  return Array.from(scannedByPath.values()).sort((a, b) =>
    a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0
  );
}

/** Output formats supported by the tree command */
export type TreeFormat = 'ascii' | 'json';

/**
 * CLI-specific options for the tree command.
 *
 * @category Commands
 */
export interface TreeCliOptions {
  /** Output format: ascii or json */
  format?: string;
  /** Maximum tree rendering depth; statistics always cover the full scan */
  maxDepth?: number;
  /** Show detailed output with processing information */
  verbose?: boolean;
  /** Output results in JSON format (alias for --format json) */
  json?: boolean;
}

/** Narrow an unvalidated CLI format string to a TreeFormat */
function isTreeFormat(value: string): value is TreeFormat {
  return value === 'ascii' || value === 'json';
}

/**
 * CLI command handler that renders the markdown tree under a path with documentation statistics.
 *
 * The scan is read-only, so there is no dry-run mode. Rendering is deterministic: directories
 * before files, each group alphabetically, node_modules/.git/dist excluded. Word counts follow the
 * countWords rule: whitespace-separated tokens outside fenced code blocks and inline code spans.
 * Internal links are checked for file existence only (no network).
 *
 * @category Commands
 *
 * @example
 *   - markmv tree
 *   - markmv tree docs/ --max-depth 2
 *   - markmv tree docs/ --format json
 *
 * @param targetPath - Directory or markdown file to scan (defaults to the current directory)
 * @param options - CLI options
 */
export async function treeCommand(
  targetPath: string | undefined,
  options: TreeCliOptions
): Promise<void> {
  const target = targetPath ?? '.';
  const format = options.json ? 'json' : (options.format ?? 'ascii');

  try {
    if (!isTreeFormat(format)) {
      throw new Error(`Invalid format: ${format}. Must be 'ascii' or 'json'`);
    }

    if (
      options.maxDepth !== undefined &&
      (!Number.isInteger(options.maxDepth) || options.maxDepth < 1)
    ) {
      throw new Error(`Invalid max depth: ${String(options.maxDepth)}. Must be a positive integer`);
    }

    if (options.verbose) {
      console.log(`Analysing markdown tree: ${target}`);
      if (options.maxDepth !== undefined) {
        console.log(
          `Rendering depth limit: ${String(options.maxDepth)} (statistics cover the full scan)`
        );
      }
    }

    const rootPath = resolve(target);
    const scanOptions: ScanOptions = options.verbose ? { verbose: true } : {};
    const files = await scanMarkdownTree(target, scanOptions);
    const tree = buildFileTree(files, options.maxDepth);
    const statistics = computeTreeStatistics(files);

    if (format === 'json') {
      console.log(JSON.stringify({ root: rootPath, tree, statistics }, null, 2));
      return;
    }

    for (const line of renderTreeAscii(tree, rootPath).split('\n')) {
      console.log(line);
    }

    console.log('');
    console.log('📊 Markdown Tree Statistics');
    console.log(`📁 Markdown files: ${String(statistics.totalFiles)}`);
    console.log(`📝 Total words: ${String(statistics.totalWords)}`);
    console.log(`🔗 Internal links: ${String(statistics.totalInternalLinks)}`);
    console.log(`🌐 External links: ${String(statistics.totalExternalLinks)}`);
    console.log(`❌ Broken internal links: ${String(statistics.brokenInternalLinks)}`);
    console.log(`🔍 Orphaned files: ${String(statistics.orphanedFiles)}`);
    console.log('');
    console.log('✅ Tree analysis completed successfully');
  } catch (error) {
    console.error('Tree analysis failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
