import { dirname } from 'node:path';
import type { MarkdownLink, ParsedMarkdownFile } from '../types/links.js';
import type { OperationChange } from '../types/operations.js';
import { FileUtils } from '../utils/file-utils.js';
import { PathUtils } from '../utils/path-utils.js';

export interface LinkRefactorResult {
  /** Updated content with refactored links */
  updatedContent: string;
  /** Changes made to links */
  changes: OperationChange[];
  /** Any errors encountered during refactoring */
  errors: string[];
}

export interface RefactorOptions {
  /** Convert absolute paths to relative where possible */
  preferRelativePaths?: boolean;
  /** Update Claude import links */
  updateClaudeImports?: boolean;
  /** Preserve link formatting (brackets, quotes, etc.) */
  preserveFormatting?: boolean;
}

export class LinkRefactorer {
  private options: Required<RefactorOptions>;

  constructor(options: RefactorOptions = {}) {
    this.options = {
      preferRelativePaths: options.preferRelativePaths ?? true,
      updateClaudeImports: options.updateClaudeImports ?? true,
      preserveFormatting: options.preserveFormatting ?? true,
    };
  }

  /**
   * Update links in a file when another file has been moved
   */
  async refactorLinksForFileMove(
    file: ParsedMarkdownFile,
    movedFilePath: string,
    newFilePath: string
  ): Promise<LinkRefactorResult> {
    const content = await FileUtils.readTextFile(file.filePath);
    return this.refactorLinksForFileMoveWithContent(file, movedFilePath, newFilePath, content);
  }

  /**
   * Update links in a file when another file has been moved (with provided content)
   */
  async refactorLinksForFileMoveWithContent(
    file: ParsedMarkdownFile,
    movedFilePath: string,
    newFilePath: string,
    content: string
  ): Promise<LinkRefactorResult> {
    const changes: OperationChange[] = [];
    const errors: string[] = [];

    let updatedContent = content;
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
              for (let i = Math.max(0, lineIndex - 2); i < Math.min(lines.length, lineIndex + 3); i++) {
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

    updatedContent = lines.join('\n');

    return {
      updatedContent,
      changes,
      errors,
    };
  }

  /**
   * Update links when the current file is being moved
   */
  async refactorLinksForCurrentFileMove(
    file: ParsedMarkdownFile,
    newFilePath: string
  ): Promise<LinkRefactorResult> {
    const content = await FileUtils.readTextFile(file.filePath);
    const changes: OperationChange[] = [];
    const errors: string[] = [];

    let updatedContent = content;
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
          const newLink = this.updateLinkForSourceFileMove(link, file.filePath, newFilePath);

          if (newLink !== link.href) {
            let lineIndex = link.line - 1;
            let oldLine = lines[lineIndex];
            
            // For Claude imports, if the import is not found on the expected line,
            // search for it in nearby lines (this handles parsing edge cases)
            if (link.type === 'claude-import') {
              const expectedImport = `@${link.href}`;
              if (!oldLine.includes(expectedImport)) {
                // Search in nearby lines
                for (let i = Math.max(0, lineIndex - 2); i < Math.min(lines.length, lineIndex + 3); i++) {
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

    updatedContent = lines.join('\n');

    return {
      updatedContent,
      changes,
      errors,
    };
  }

  /**
   * Update links when the current file is being moved (with provided content)
   */
  async refactorLinksForCurrentFileMoveWithContent(
    file: ParsedMarkdownFile,
    newFilePath: string,
    content: string
  ): Promise<LinkRefactorResult> {
    const changes: OperationChange[] = [];
    const errors: string[] = [];

    let updatedContent = content;
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
          const newLink = this.updateLinkForSourceFileMove(link, file.filePath, newFilePath);

          if (newLink !== link.href) {
            let lineIndex = link.line - 1;
            let oldLine = lines[lineIndex];
            
            // For Claude imports, if the import is not found on the expected line,
            // search for it in nearby lines (this handles parsing edge cases)
            if (link.type === 'claude-import') {
              const expectedImport = `@${link.href}`;
              if (!oldLine.includes(expectedImport)) {
                // Search in nearby lines
                for (let i = Math.max(0, lineIndex - 2); i < Math.min(lines.length, lineIndex + 3); i++) {
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

    updatedContent = lines.join('\n');

    return {
      updatedContent,
      changes,
      errors,
    };
  }

  /**
   * Update a single link when a target file has been moved
   */
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

    if (link.type === 'claude-import' && this.options.updateClaudeImports) {
      return this.updateClaudeImportPath(link, sourceFilePath, newFilePath);
    }

    if (link.type === 'internal' || link.type === 'image') {
      return this.updateInternalLinkPath(link, sourceFilePath, newFilePath);
    }

    return link.href;
  }

  /**
   * Update a link when the source file (containing the link) is being moved
   */
  private updateLinkForSourceFileMove(
    link: MarkdownLink,
    oldSourceFilePath: string,
    newSourceFilePath: string
  ): string {
    if (link.type === 'claude-import' && this.options.updateClaudeImports) {
      return PathUtils.updateClaudeImportPath(link.href, oldSourceFilePath, newSourceFilePath);
    }

    if (link.type === 'internal' || link.type === 'image') {
      return PathUtils.updateRelativePath(link.href, oldSourceFilePath, newSourceFilePath);
    }

    return link.href;
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
      let newPath = PathUtils.makeRelative(newTargetFilePath, sourceDir);
      
      // Ensure relative paths start with ./ for markdown compatibility
      if (!newPath.startsWith('./') && !newPath.startsWith('../') && !newPath.startsWith('/')) {
        newPath = './' + newPath;
      }
      
      return newPath;
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
      newPath = PathUtils.makeRelative(newTargetFilePath, sourceDir);
      
      // Ensure relative paths start with ./ for markdown compatibility
      if (!newPath.startsWith('./') && !newPath.startsWith('../') && !newPath.startsWith('/')) {
        newPath = './' + newPath;
      }
    } else {
      newPath = newTargetFilePath;
    }

    // Convert to Unix-style paths for markdown
    newPath = PathUtils.toUnixPath(newPath);

    return newPath + anchorSuffix;
  }

  /**
   * Replace a link in a line of text while preserving formatting
   */
  private replaceLinkInLine(line: string, link: MarkdownLink, newHref: string): string {
    if (link.type === 'claude-import') {
      // Replace Claude import: @old-path with @new-path
      const oldImport = `@${link.href}`;
      const newImport = `@${newHref}`;
      return line.replace(oldImport, newImport);
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

  /**
   * Escape special regex characters in a string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Update reference-style link definitions
   */
  async refactorReferenceDefinitions(
    file: ParsedMarkdownFile,
    movedFilePath: string,
    newFilePath: string
  ): Promise<LinkRefactorResult> {
    const content = await FileUtils.readTextFile(file.filePath);
    const changes: OperationChange[] = [];
    const errors: string[] = [];

    let updatedContent = content;
    const lines = content.split('\n');

    // Update reference definitions that point to the moved file
    for (const reference of file.references) {
      const resolvedPath = PathUtils.resolvePath(
        reference.url,
        dirname(file.filePath)
      );

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

    updatedContent = lines.join('\n');

    return {
      updatedContent,
      changes,
      errors,
    };
  }
}
