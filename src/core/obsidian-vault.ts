import { existsSync } from 'node:fs';
import { basename, extname, join, posix } from 'node:path';
import type { ParsedMarkdownFile } from '../types/links.js';

/**
 * A wikilink whose bare target matches multiple notes in the vault.
 *
 * Obsidian resolves such links by path proximity, which means a file move can silently rebind them
 * without any text changing anywhere -- the reason ambiguity is reported rather than guessed.
 *
 * @category Core
 */
export interface ObsidianAmbiguity {
  /** The bare wikilink target that matched more than one note */
  stem: string;
  /** Absolute paths of every note the target matched */
  candidates: string[];
}

/**
 * A note stem shared by multiple markdown files, making bare wikilinks to it ambiguous.
 *
 * @category Core
 */
export interface DuplicateNoteStem {
  /** The stem (basename without extension) shared by multiple notes */
  stem: string;
  /** Absolute paths of every note carrying this stem */
  paths: string[];
}

export type { ParsedMarkdownFile };

/**
 * Index of every known vault file by the names a wikilink can use to reach it.
 *
 * Markdown files are indexed twice -- by stem ([[Note]]) and by full filename ([[Note.md]]) --
 * while other files (images, PDFs) are indexed by filename only, since embedding them always
 * includes the extension (![[image.png]]).
 */
function buildNameIndex(filePaths: string[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const filePath of filePaths) {
    const name = basename(filePath);
    const candidates = index.get(name) ?? [];
    candidates.push(filePath);
    index.set(name, candidates);
    if (extname(name) === '.md') {
      const stem = basename(name, '.md');
      const stemCandidates = index.get(stem) ?? [];
      stemCandidates.push(filePath);
      index.set(stem, stemCandidates);
    }
  }
  return index;
}

/**
 * Resolve the wikilinks and embeds in a parsed vault against the whole file set.
 *
 * Obsidian resolves [[Note]] by unique basename vault-wide, independent of where either file sits,
 * so resolution needs every note in view: a bare target is matched by stem, an explicit-extension
 * target by filename, and a path-qualified target against the vault root. Successfully resolved
 * links gain resolvedPath and feed the file's dependencies, so the dependency graph treats them
 * like any other inbound reference. Ambiguous bare targets are deliberately left unresolved and
 * reported instead of guessed.
 *
 * @example
 *   ```typescript const files = await new LinkParser().parseDirectory(vaultRoot); const ambiguities = resolveWikilinks(files, vaultRoot);
 *
 *   if (ambiguities.length > 0) { console.warn('Ambiguous wikilinks:', ambiguities); } ```;
 *
 * @param files - Every parsed markdown file in the vault
 * @param vaultRoot - Absolute path of the vault root path-qualified targets resolve against
 *
 * @returns Ambiguities encountered: bare targets that matched multiple notes
 */
export function resolveWikilinks(
  files: ParsedMarkdownFile[],
  vaultRoot: string
): ObsidianAmbiguity[] {
  const nameIndex = buildNameIndex(files.map((file) => file.filePath));
  const ambiguities: ObsidianAmbiguity[] = [];

  for (const file of files) {
    for (const link of file.links) {
      if (link.type !== 'wikilink' && link.type !== 'obsidian-transclusion') continue;

      const resolution = resolveTarget(link.href, vaultRoot, nameIndex);
      if (resolution.ambiguous) {
        ambiguities.push({ stem: link.href, candidates: resolution.ambiguous });
        continue;
      }
      if (resolution.resolvedPath !== undefined) {
        link.resolvedPath = resolution.resolvedPath;
      }
    }

    rebuildDependencies(file);
  }

  return ambiguities;
}

/**
 * The outcome of resolving one wikilink target against the vault.
 *
 * @category Core
 */
export interface WikilinkResolution {
  /** The single note or asset the target resolves to, when unambiguous */
  resolvedPath?: string;
  /** Every note a bare target matched, when ambiguous */
  ambiguous?: string[];
}

/**
 * Build a resolver for wikilink targets against a known vault file set.
 *
 * The index needs only file paths -- stems and filenames -- so callers that have a file list but no
 * parsed contents (link validation, for example) can resolve exactly like whole-vault passes.
 *
 * @param vaultRoot - Absolute path of the vault root path-qualified targets resolve against
 * @param filePaths - Absolute paths of every file in the vault
 *
 * @returns A function mapping a wikilink target to its resolution
 */
export function createWikilinkResolver(
  vaultRoot: string,
  filePaths: string[]
): (target: string) => WikilinkResolution {
  const nameIndex = buildNameIndex(filePaths);
  return (target: string) => resolveTarget(target, vaultRoot, nameIndex);
}

function resolveTarget(
  target: string,
  vaultRoot: string,
  nameIndex: Map<string, string[]>
): { resolvedPath?: string; ambiguous?: string[] } {
  // Path-qualified targets resolve against the vault root, like Obsidian itself
  if (target.includes('/')) {
    const normalized = posixJoin(target);
    const exact = join(vaultRoot, normalized);
    if (existsSync(exact)) {
      return { resolvedPath: exact };
    }
    if (extname(normalized) === '' && existsSync(`${exact}.md`)) {
      return { resolvedPath: `${exact}.md` };
    }
    return {};
  }

  const matches = nameIndex.get(target);
  if (matches !== undefined) {
    const unique = Array.from(new Set(matches));
    if (unique.length === 1) {
      return { resolvedPath: unique[0] };
    }
    return { ambiguous: unique };
  }

  // A bare target that is not a parsed note may still be an asset on disk (an embedded image, for example); only such exact filenames can be checked without the vault index
  const onDisk = join(vaultRoot, target);
  if (target.includes('.') && existsSync(onDisk)) {
    return { resolvedPath: onDisk };
  }
  return {};
}

/** Rebuild a file's dependency list from its resolved links, wikilinks included */
function rebuildDependencies(file: ParsedMarkdownFile): void {
  file.dependencies = Array.from(
    new Set(
      file.links
        .map((link) => link.resolvedPath)
        .filter((path): path is string => path !== undefined)
    )
  );
}

/**
 * Find markdown note stems shared by multiple files in a parsed vault.
 *
 * A duplicate stem makes every bare wikilink to it ambiguous, and Obsidian resolves that ambiguity
 * by path proximity -- so moving a file can silently rebind existing links with zero text changes
 * anywhere. Surfacing the duplicates before a move is the only defence.
 *
 * @param files - Every parsed markdown file in the vault
 *
 * @returns Each stem that more than one markdown file carries
 */
export function findDuplicateNoteStems(files: ParsedMarkdownFile[]): DuplicateNoteStem[] {
  const byStem = new Map<string, string[]>();
  for (const file of files) {
    const name = basename(file.filePath);
    if (extname(name) !== '.md') continue;
    const stem = basename(name, '.md');
    const paths = byStem.get(stem) ?? [];
    paths.push(file.filePath);
    byStem.set(stem, paths);
  }

  return Array.from(byStem.entries())
    .filter(([, paths]) => paths.length > 1)
    .map(([stem, paths]) => ({ stem, paths }));
}

/**
 * Count how many markdown files carry each note stem.
 *
 * A stem carried by exactly one file resolves unambiguously vault-wide, so a rewritten wikilink can
 * use the bare form; any stem whose post-move count exceeds one needs the path-qualified form.
 *
 * @param files - Every parsed markdown file in the vault
 *
 * @returns Map from stem (basename without .md) to the number of markdown files carrying it
 */
export function computeNoteStemCounts(files: ParsedMarkdownFile[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of files) {
    const name = basename(file.filePath);
    if (extname(name) !== '.md') continue;
    const stem = basename(name, '.md');
    counts.set(stem, (counts.get(stem) ?? 0) + 1);
  }
  return counts;
}

/** Join wikilink path segments with posix separators regardless of host platform */
function posixJoin(target: string): string {
  return posix.join(...target.split(/[\\/]/));
}
