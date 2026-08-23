import { basename, dirname, relative } from 'node:path';
import type { MarkdownLink, ParsedMarkdownFile } from '../types/links.js';
import type { OperationChange } from '../types/operations.js';
import { FileUtils } from '../utils/file-utils.js';
import { PathUtils } from '../utils/path-utils.js';

/**
 * Result of a link refactoring operation.
 *
 * Contains the updated content with refactored links and detailed information about the changes
 * made during the refactoring process.
 *
 * @category Core
 */
export interface LinkRefactorResult {
  /** Updated content with refactored links */
  updatedContent: string;
  /** Changes made to links */
  changes: OperationChange[];
  /** Any errors encountered during refactoring */
  errors: string[];
}

/**
 * Configuration options for link refactoring operations.
 *
 * Controls how links are processed during refactoring, including path conversion, formatting
 * preservation, and special handling for different link types.
 *
 * @category Core
 */
export interface RefactorOptions {
  /** Convert absolute paths to relative where possible */
  preferRelativePaths?: boolean;
  /** Update Claude import links */
  updateClaudeImports?: boolean;
  /** Preserve link formatting (brackets, quotes, etc.) */
  preserveFormatting?: boolean;
  /** Obsidian vault context enabling wikilink rewriting; without it wikilink text is preserved */
  obsidianVault?: ObsidianVaultContext;
}

/**
 * Vault-wide context a wikilink rewrite needs.
 *
 * Obsidian resolves [[Note]] by basename across the whole vault, so deciding what a rewritten
 * wikilink should say depends on stem uniqueness across every note, not on the two files joined by
 * the move.
 *
 * @category Core
 */
export interface ObsidianVaultContext {
  /** Absolute path of the vault root, the base for path-qualified rewrites */
  vaultRoot: string;
  /** How many markdown files carry each note stem (basename without .md) before the move */
  noteStemCounts: Map<string, number>;
}

/**
 * Refactors and updates markdown links when files are moved or restructured.
 *
 * The LinkRefactorer automatically updates link paths, maintains referential integrity, and handles
 * various link types including relative paths, absolute paths, and Claude import syntax. It ensures
 * that links remain valid after file operations.
 *
 * @category Core
 *
 * @example
 *   Basic link refactoring
 *   ```typescript
 *   const refactorer = new LinkRefactorer({
 *   preferRelativePaths: true,
 *   updateClaudeImports: true
 *   });
 *
 *   const result = await refactorer.refactorLinks(
 *   parsedFile,
 *   'old/path/file.md',
 *   'new/path/file.md'
 *   );
 *
 *   console.log(`Updated ${result.changes.length} links`);
 *   ```
 *
 * @example
 *   Bulk refactoring with path mapping
 *   ```typescript
 *   const pathMap = new Map([
 *   ['docs/old.md', 'guides/new.md'],
 *   ['api/legacy.md', 'reference/current.md']
 *   ]);
 *
 *   const result = await refactorer.refactorLinksWithMapping(
 *   parsedFile,
 *   pathMap
 *   );
 *   ```
 */
export class LinkRefactorer {
  private options: Omit<Required<RefactorOptions>, 'obsidianVault'> & {
    obsidianVault?: ObsidianVaultContext;
  };

  constructor(options: RefactorOptions = {}) {
    this.options = {
      preferRelativePaths: options.preferRelativePaths ?? true,
      updateClaudeImports: options.updateClaudeImports ?? true,
      preserveFormatting: options.preserveFormatting ?? true,
      ...(options.obsidianVault ? { obsidianVault: options.obsidianVault } : {}),
    };
  }

  /** Update links in a file when another file has been moved */
  async refactorLinksForFileMove(
    file: ParsedMarkdownFile,
    movedFilePath: string,
    newFilePath: string
  ): Promise<LinkRefactorResult> {
    const content = await FileUtils.readTextFile(file.filePath);
    return this.refactorLinksForFileMoveWithContent(file, movedFilePath, newFilePath, content);
  }

  /** Update links in a file when another file has been moved (with provided content) */
  async refactorLinksForFileMoveWithContent(
    file: ParsedMarkdownFile,
    movedFilePath: string,
    newFilePath: string,
    content: string
  ): Promise<LinkRefactorResult> {
    const changes: OperationChange[] = [];
    const errors: string[] = [];

    const lines = content.split('\n');

    // Sort links by line and column in reverse order to avoid offset issues
    const sortedLinks = [...file.links].sort((a, b) => {
      if (a.line !== b.line) return b.line - a.line;
      return b.column - a.column;
    });

    for (const link of sortedLinks) {
      try {
        const newLink = this.updateLinkForMovedFile(
          link,
          file.filePath,
          movedFilePath,
          newFilePath
        );

        if (newLink !== link.href) {
          let lineIndex = link.line - 1;
          let oldLine = lines[lineIndex];

          // For Claude imports, if the import is not found on the expected line,
          // search for it in nearby lines (this handles parsing edge cases)
          if (link.type === 'claude-import') {
            const expectedImport = `@${link.href}`;
            if (!oldLine.includes(expectedImport)) {
              // Search in nearby lines
              for (
                let i = Math.max(0, lineIndex - 2);
                i < Math.min(lines.length, lineIndex + 3);
                i++
              ) {
                if (lines[i].includes(expectedImport)) {
                  lineIndex = i;
                  oldLine = lines[i];
                  break;
                }
              }
            }
          }

          const newLine = this.replaceLinkInLine(oldLine, link, newLink);

          if (newLine !== oldLine) {
            lines[lineIndex] = newLine;

            changes.push({
              type: 'link-updated',
              filePath: file.filePath,
              oldValue: link.href,
              newValue: newLink,
              line: lineIndex + 1,
            });
          }
        }
      } catch (error) {
        errors.push(`Failed to update link at line ${link.line}: ${error}`);
      }
    }

    const updatedContent = lines.join('\n');

    return {
      updatedContent,
      changes,
      errors,
    };
  }

  /** Update links when the current file is being moved */
  async refactorLinksForCurrentFileMove(
    file: ParsedMarkdownFile,
    newFilePath: string,
    movedPaths?: Map<string, string>
  ): Promise<LinkRefactorResult> {
    const content = await FileUtils.readTextFile(file.filePath);
    const changes: OperationChange[] = [];
    const errors: string[] = [];

    const lines = content.split('\n');

    // Sort links by line and column in reverse order
    const sortedLinks = [...file.links].sort((a, b) => {
      if (a.line !== b.line) return b.line - a.line;
      return b.column - a.column;
    });

    for (const link of sortedLinks) {
      if (
        link.type === 'internal' ||
        link.type === 'image' ||
        (link.type === 'claude-import' && this.options.updateClaudeImports)
      ) {
        try {
          const newLink = this.updateLinkForSourceFileMove(
            link,
            file.filePath,
            newFilePath,
            movedPaths
          );

          if (newLink !== link.href) {
            let lineIndex = link.line - 1;
            let oldLine = lines[lineIndex];

            // For Claude imports, if the import is not found on the expected line,
            // search for it in nearby lines (this handles parsing edge cases)
            if (link.type === 'claude-import') {
              const expectedImport = `@${link.href}`;
              if (!oldLine.includes(expectedImport)) {
                // Search in nearby lines
                for (
                  let i = Math.max(0, lineIndex - 2);
                  i < Math.min(lines.length, lineIndex + 3);
                  i++
                ) {
                  if (lines[i].includes(expectedImport)) {
                    lineIndex = i;
                    oldLine = lines[i];
                    break;
                  }
                }
              }
            }

            const newLine = this.replaceLinkInLine(oldLine, link, newLink);

            if (newLine !== oldLine) {
              lines[lineIndex] = newLine;

              changes.push({
                type: 'link-updated',
                filePath: newFilePath, // Note: using new file path
                oldValue: link.href,
                newValue: newLink,
                line: lineIndex + 1,
              });
            }
          }
        } catch (error) {
          errors.push(`Failed to update link at line ${link.line}: ${error}`);
        }
      }
    }

    const updatedContent = lines.join('\n');

    return {
      updatedContent,
      changes,
      errors,
    };
  }

  /** Update links when the current file is being moved (with provided content) */
  async refactorLinksForCurrentFileMoveWithContent(
    file: ParsedMarkdownFile,
    newFilePath: string,
    content: string,
    movedPaths?: Map<string, string>
  ): Promise<LinkRefactorResult> {
    const changes: OperationChange[] = [];
    const errors: string[] = [];

    const lines = content.split('\n');

    // Sort links by line and column in reverse order
    const sortedLinks = [...file.links].sort((a, b) => {
      if (a.line !== b.line) return b.line - a.line;
      return b.column - a.column;
    });

    for (const link of sortedLinks) {
      if (
        link.type === 'internal' ||
        link.type === 'image' ||
        (link.type === 'claude-import' && this.options.updateClaudeImports)
      ) {
        try {
          const newLink = this.updateLinkForSourceFileMove(
            link,
            file.filePath,
            newFilePath,
            movedPaths
          );

          if (newLink !== link.href) {
            let lineIndex = link.line - 1;
            let oldLine = lines[lineIndex];

            // For Claude imports, if the import is not found on the expected line, search for it in nearby lines (this handles parsing edge cases)
            if (link.type === 'claude-import') {
              const expectedImport = `@${link.href}`;
              if (!oldLine.includes(expectedImport)) {
                // Search in nearby lines
                for (
                  let i = Math.max(0, lineIndex - 2);
                  i < Math.min(lines.length, lineIndex + 3);
                  i++
                ) {
                  if (lines[i].includes(expectedImport)) {
                    lineIndex = i;
                    oldLine = lines[i];
                    break;
                  }
                }
              }
            }

            const newLine = this.replaceLinkInLine(oldLine, link, newLink);

            if (newLine !== oldLine) {
              lines[lineIndex] = newLine;

              changes.push({
                type: 'link-updated',
                filePath: newFilePath, // Note: using new file path
                oldValue: link.href,
                newValue: newLink,
                line: lineIndex + 1,
              });
            }
          }
        } catch (error) {
          errors.push(`Failed to update link at line ${link.line}: ${error}`);
        }
      }
    }

    const updatedContent = lines.join('\n');

    return {
      updatedContent,
      changes,
      errors,
    };
  }

  /** Update a single link when a target file has been moved */
  private updateLinkForMovedFile(
    link: MarkdownLink,
    sourceFilePath: string,
    movedFilePath: string,
    newFilePath: string
  ): string {
    // Only update if this link points to the moved file
    if (link.resolvedPath !== movedFilePath) {
      return link.href;
    }

    if (link.type === 'wikilink' || link.type === 'obsidian-transclusion') {
      return this.updateWikilinkForMovedFile(link, movedFilePath, newFilePath);
    }

    if (link.type === 'claude-import' && this.options.updateClaudeImports) {
      return this.updateClaudeImportPath(link, sourceFilePath, newFilePath);
    }

    if (link.type === 'internal' || link.type === 'image') {
      return this.updateInternalLinkPath(link, sourceFilePath, newFilePath);
    }

    return link.href;
  }

  /**
   * Update a wikilink or embed whose target moved.
   *
   * A wikilink resolves by note basename vault-wide, so a move that keeps the basename needs no
   * rewrite at all -- the link still resolves. A rename rewrites to the shortest unambiguous form:
   * the bare stem when exactly one note carries it, otherwise the vault-relative path, matching
   * what Obsidian itself generates. Without vault context (obsidian mode off) the link text is
   * preserved as-is.
   */
  private updateWikilinkForMovedFile(
    link: MarkdownLink,
    movedFilePath: string,
    newFilePath: string
  ): string {
    const vault = this.options.obsidianVault;
    if (!vault) {
      return link.href;
    }

    const oldStem = basename(movedFilePath, '.md');
    const newStem = basename(newFilePath, '.md');
    // A bare-stem href still resolves wherever the note lands, so an unchanged stem needs no
    // rewrite; a path-qualified href resolves by vault path and must be recomputed
    if (oldStem === newStem && !link.href.includes('/')) {
      return link.href;
    }

    // The bare stem stays unambiguous when no other note carries it -- which for an unchanged
    // stem means the pre-move count of one (this very note), and for a rename means zero
    const stemCount = vault.noteStemCounts.get(newStem) ?? 0;
    if (stemCount === 0 || (oldStem === newStem && stemCount === 1)) {
      return newStem;
    }

    return PathUtils.toUnixPath(relative(vault.vaultRoot, newFilePath)).replace(/\.md$/, '');
  }

  /** Update a link when the source file (containing the link) is being moved */
  private updateLinkForSourceFileMove(
    link: MarkdownLink,
    oldSourceFilePath: string,
    newSourceFilePath: string,
    movedPaths?: Map<string, string>
  ): string {
    if (link.type === 'claude-import' && this.options.updateClaudeImports) {
      const newPath = PathUtils.updateClaudeImportPath(
        link.href,
        oldSourceFilePath,
        newSourceFilePath,
        movedPaths
      );
      return this.ensureRelativePrefix(PathUtils.toUnixPath(newPath));
    }

    if (link.type === 'internal' || link.type === 'image') {
      const newPath = PathUtils.updateRelativePath(
        link.href,
        oldSourceFilePath,
        newSourceFilePath,
        movedPaths
      );
      return this.ensureRelativePrefix(PathUtils.toUnixPath(newPath));
    }

    return link.href;
  }

  /**
   * Ensure a rewritten same-directory path keeps an explicit ./ prefix, matching the bystander
   * update convention so both rewrite passes converge on identical output. The path must already be
   * in unix form, as markdown links always use forward slashes.
   */
  private ensureRelativePrefix(path: string): string {
    // Home-directory and drive-absolute forms are already absolute from the markdown point of
    // view; prefixing them would corrupt the link (./~/notes/x.md, ./C:/docs/x.md)
    const alreadyAnchored =
      path.startsWith('./') ||
      path.startsWith('../') ||
      path.startsWith('/') ||
      path.startsWith('~/') ||
      /^[A-Za-z]:/.test(path);
    if (!alreadyAnchored) {
      return `./${path}`;
    }
    return path;
  }

  private updateClaudeImportPath(
    link: MarkdownLink,
    sourceFilePath: string,
    newTargetFilePath: string
  ): string {
    // For Claude imports, we need to maintain the correct path
    const sourceDir = dirname(sourceFilePath);

    if (
      this.options.preferRelativePaths &&
      !link.href.startsWith('/') &&
      !link.href.startsWith('~/')
    ) {
      // Markdown links always use forward slashes; the ./ prefix check assumes unix form
      const unixPath = PathUtils.toUnixPath(PathUtils.makeRelative(newTargetFilePath, sourceDir));

      // Ensure relative paths start with ./ for markdown compatibility
      if (!unixPath.startsWith('./') && !unixPath.startsWith('../') && !unixPath.startsWith('/')) {
        return `./${unixPath}`;
      }

      return unixPath;
    }

    return newTargetFilePath;
  }

  private updateInternalLinkPath(
    link: MarkdownLink,
    sourceFilePath: string,
    newTargetFilePath: string
  ): string {
    const sourceDir = dirname(sourceFilePath);

    // Extract anchor if present
    const [, anchor] = link.href.split('#');
    const anchorSuffix = anchor ? `#${anchor}` : '';

    let newPath: string;

    if (this.options.preferRelativePaths && !link.absolute) {
      // Markdown links always use forward slashes; the ./ prefix check assumes unix form
      newPath = PathUtils.toUnixPath(PathUtils.makeRelative(newTargetFilePath, sourceDir));

      // Ensure relative paths start with ./ for markdown compatibility
      if (!newPath.startsWith('./') && !newPath.startsWith('../') && !newPath.startsWith('/')) {
        newPath = `./${newPath}`;
      }
    } else {
      newPath = newTargetFilePath;
    }

    return PathUtils.toUnixPath(newPath) + anchorSuffix;
  }

  /** Replace a link in a line of text while preserving formatting */
  private replaceLinkInLine(line: string, link: MarkdownLink, newHref: string): string {
    if (link.type === 'claude-import') {
      // Replace Claude import: @old-path with @new-path
      const oldImport = `@${link.href}`;
      const newImport = `@${newHref}`;
      return line.replace(oldImport, newImport);
    }

    if (link.type === 'wikilink' || link.type === 'obsidian-transclusion') {
      // Replace the target inside [[...]] while keeping the embed marker, block reference, and display alias exactly as written
      const wikilinkRegex = new RegExp(
        `(!?)\\[\\[\\s*${this.escapeRegex(link.href)}((?:#[^\\]|]*)?\\s*(?:\\|[^\\]]*)?)\\]\\]`
      );
      // $-sequences in the new target are replacement-template metacharacters and must be escaped
      const escapedHref = newHref.replace(/\$/g, '$$$$');
      return line.replace(wikilinkRegex, `$1[[${escapedHref}$2]]`);
    }

    // For regular markdown links, we need to be more careful to preserve formatting
    if (link.type === 'image') {
      // Image links: ![alt](href) or ![alt](href "title")
      const imageRegex = new RegExp(
        `!\\[([^\\]]*)\\]\\(\\s*${this.escapeRegex(link.href)}(\\s+"[^"]*")?\\s*\\)`,
        'g'
      );
      return line.replace(imageRegex, `![$1](${newHref}$2)`);
    }

    if (link.type === 'reference') {
      // Reference-style links are handled in the reference definitions
      // For now, just return the line unchanged
      return line;
    }

    // Regular links: [text](href) or [text](href "title")
    const linkRegex = new RegExp(
      `\\[([^\\]]*)\\]\\(\\s*${this.escapeRegex(link.href)}(\\s+"[^"]*")?\\s*\\)`,
      'g'
    );

    return line.replace(linkRegex, `[$1](${newHref}$2)`);
  }

  /** Escape special regex characters in a string */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Update reference-style link definitions */
  async refactorReferenceDefinitions(
    file: ParsedMarkdownFile,
    movedFilePath: string,
    newFilePath: string
  ): Promise<LinkRefactorResult> {
    const content = await FileUtils.readTextFile(file.filePath);
    const changes: OperationChange[] = [];
    const errors: string[] = [];

    const lines = content.split('\n');

    // Update reference definitions that point to the moved file
    for (const reference of file.references) {
      const resolvedPath = PathUtils.resolvePath(reference.url, dirname(file.filePath));

      if (resolvedPath === movedFilePath) {
        try {
          const newUrl = this.updateInternalLinkPath(
            {
              ...reference,
              href: reference.url,
              type: 'internal',
              text: undefined,
              referenceId: undefined,
              line: reference.line,
              column: 1,
              absolute: false,
            },
            file.filePath,
            newFilePath
          );

          if (newUrl !== reference.url) {
            const oldLine = lines[reference.line - 1];
            const refRegex = new RegExp(
              `\\[${this.escapeRegex(reference.id)}\\]:\\s*${this.escapeRegex(reference.url)}(\\s+"[^"]*")?`,
              'g'
            );

            const newLine = oldLine.replace(
              refRegex,
              `[${reference.id}]: ${newUrl}${reference.title ? ` "${reference.title}"` : ''}`
            );

            if (newLine !== oldLine) {
              lines[reference.line - 1] = newLine;

              changes.push({
                type: 'link-updated',
                filePath: file.filePath,
                oldValue: reference.url,
                newValue: newUrl,
                line: reference.line,
              });
            }
          }
        } catch (error) {
          errors.push(
            `Failed to update reference ${reference.id} at line ${reference.line}: ${error}`
          );
        }
      }
    }

    const updatedContent = lines.join('\n');

    return {
      updatedContent,
      changes,
      errors,
    };
  }
}
