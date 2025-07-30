import { readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { visit } from 'unist-util-visit';
import type { Node } from 'unist';
import type {
  ConvertOperationOptions,
  OperationResult,
  OperationChange,
} from '../types/operations.js';
import type { MarkdownLink } from '../types/links.js';
import { LinkParser } from './link-parser.js';

// Define MDAST node types for conversion
interface LinkNode extends Node {
  type: 'link' | 'image' | 'linkReference' | 'imageReference';
  url?: string;
  title?: string | null | undefined;
  alt?: string | null | undefined;
  identifier?: string;
  referenceType?: 'full' | 'collapsed' | 'shortcut';
  children?: Array<{ type: string; value?: string }>;
}

interface TextNode extends Node {
  type: 'text';
  value: string;
}


/**
 * Core class for converting markdown link formats and path resolution.
 *
 * Provides comprehensive link conversion functionality including path resolution changes
 * (absolute/relative) and link style transformations between different markdown syntaxes.
 *
 * @category Core
 *
 * @example
 *   Basic link conversion
 *   ```typescript
 *   const converter = new LinkConverter();
 *
 *   // Convert all links to relative paths and wikilink style
 *   const result = await converter.convertFile('document.md', {
 *   pathResolution: 'relative',
 *   linkStyle: 'wikilink',
 *   basePath: process.cwd()
 *   });
 *   ```
 */
export class LinkConverter {
  private parser: LinkParser;

  constructor() {
    this.parser = new LinkParser();
  }

  /**
   * Convert links in a single markdown file.
   *
   * @param filePath - Path to the markdown file to convert
   * @param options - Conversion options specifying target format
   *
   * @returns Promise resolving to operation result with conversion details
   */
  async convertFile(filePath: string, options: ConvertOperationOptions): Promise<OperationResult> {
    const result: OperationResult = {
      success: false,
      modifiedFiles: [],
      createdFiles: [],
      deletedFiles: [],
      errors: [],
      warnings: [],
      changes: [],
    };

    try {
      // Read and parse the file
      const content = await readFile(filePath, 'utf-8');
      const parsed = await this.parser.parseFile(filePath);

      // Convert the content
      const convertedContent = await this.convertContent(content, parsed.links, filePath, options);

      // Check if content actually changed
      if (convertedContent === content) {
        if (options.verbose) {
          console.log(`No changes needed in ${filePath}`);
        }
        result.success = true;
        return result;
      }

      // Write the converted content (unless dry run)
      if (!options.dryRun) {
        await writeFile(filePath, convertedContent, 'utf-8');
        result.modifiedFiles.push(filePath);
      }

      // Track changes made
      const changes = this.detectChanges(content, convertedContent, filePath);
      result.changes.push(...changes);

      if (options.verbose) {
        console.log(`Converted ${changes.length} links in ${filePath}`);
      }

      result.success = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to convert ${filePath}: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Convert links in multiple markdown files.
   *
   * @param filePaths - Array of file paths to convert
   * @param options - Conversion options specifying target format
   *
   * @returns Promise resolving to combined operation result
   */
  async convertFiles(
    filePaths: string[],
    options: ConvertOperationOptions
  ): Promise<OperationResult> {
    const combinedResult: OperationResult = {
      success: true,
      modifiedFiles: [],
      createdFiles: [],
      deletedFiles: [],
      errors: [],
      warnings: [],
      changes: [],
    };

    for (const filePath of filePaths) {
      const result = await this.convertFile(filePath, options);

      // Combine results
      combinedResult.modifiedFiles.push(...result.modifiedFiles);
      combinedResult.createdFiles.push(...result.createdFiles);
      combinedResult.deletedFiles.push(...result.deletedFiles);
      combinedResult.errors.push(...result.errors);
      combinedResult.warnings.push(...result.warnings);
      combinedResult.changes.push(...result.changes);

      if (!result.success) {
        combinedResult.success = false;
      }
    }

    return combinedResult;
  }

  /**
   * Convert markdown content with specified link transformations.
   *
   * @private
   *
   * @param content - Original markdown content
   * @param links - Parsed link information
   * @param filePath - Path of the source file (for relative path calculations)
   * @param options - Conversion options
   *
   * @returns Promise resolving to converted content
   */
  private async convertContent(
    content: string,
    _links: MarkdownLink[],
    filePath: string,
    options: ConvertOperationOptions
  ): Promise<string> {
    // Parse markdown AST
    const processor = unified().use(remarkParse).use(remarkStringify, {
      bullet: '-',
      fences: true,
      incrementListMarker: false,
    });

    const tree = processor.parse(content);
    let hasChanges = false;

    // Transform links in the AST
    visit(tree, (node: Node) => {
      if (this.isLinkNode(node)) {
        const transformed = this.transformLinkNode(node, filePath, options);
        if (transformed) {
          hasChanges = true;
        }
      } else if (node.type === 'text' && options.linkStyle) {
        // Handle Claude imports and other text-based link formats
        if (this.isTextNode(node)) {
          const transformed = this.transformTextLinks(node, filePath, options);
          if (transformed) {
            hasChanges = true;
          }
        }
      }
    });

    if (!hasChanges) {
      return content;
    }

    const result = processor.stringify(tree);
    return typeof result === 'string' ? result : String(result);
  }

  /**
   * Transform a link node according to conversion options.
   *
   * @private
   *
   * @param node - The link/image node to transform
   * @param filePath - Source file path for relative calculations
   * @param options - Conversion options
   *
   * @returns Whether the node was modified
   */
  private transformLinkNode(
    node: LinkNode,
    filePath: string,
    options: ConvertOperationOptions
  ): boolean {
    if (!node.url) return false;

    let hasChanges = false;

    // Transform path resolution
    if (options.pathResolution && this.isInternalLink(node.url)) {
      const newUrl = this.convertPathResolution(
        node.url,
        filePath,
        options.pathResolution,
        options.basePath
      );
      if (newUrl !== node.url) {
        node.url = newUrl;
        hasChanges = true;
      }
    }

    // Transform link style (this affects the overall syntax, handled at AST level)
    if (options.linkStyle && this.isInternalLink(node.url)) {
      hasChanges = this.convertLinkStyle(node, options.linkStyle) || hasChanges;
    }

    return hasChanges;
  }

  /**
   * Transform text-based links (like Claude imports).
   *
   * @private
   *
   * @param node - Text node that might contain text-based links
   * @param filePath - Source file path for relative calculations
   * @param options - Conversion options
   *
   * @returns Whether the node was modified
   */
  private transformTextLinks(
    node: TextNode,
    filePath: string,
    options: ConvertOperationOptions
  ): boolean {
    const originalValue = node.value;
    let newValue = node.value;

    // Handle Claude imports (@./file.md, @~/file.md)
    const claudeImportRegex = /@(\.\/|~\/|[^@\s]+)/g;
    newValue = newValue.replace(claudeImportRegex, (match, path) => {
      if (options.pathResolution) {
        const convertedPath = this.convertPathResolution(
          path,
          filePath,
          options.pathResolution,
          options.basePath
        );
        return `@${convertedPath}`;
      }
      return match;
    });

    if (newValue !== originalValue) {
      node.value = newValue;
      return true;
    }

    return false;
  }

  /**
   * Convert path resolution between absolute and relative formats.
   *
   * @private
   *
   * @param linkPath - Original link path
   * @param sourceFile - Path of the file containing the link
   * @param targetResolution - Target path resolution type
   * @param basePath - Base path for absolute resolution calculations
   *
   * @returns Converted path
   */
  private convertPathResolution(
    linkPath: string,
    sourceFile: string,
    targetResolution: 'absolute' | 'relative',
    basePath?: string
  ): string {
    // Skip external URLs and anchors
    if (linkPath.startsWith('http') || linkPath.startsWith('#')) {
      return linkPath;
    }

    const sourceDir = dirname(sourceFile);
    const base = basePath || process.cwd();

    if (targetResolution === 'absolute') {
      // Convert to absolute path
      if (isAbsolute(linkPath)) {
        return linkPath;
      }

      // Resolve relative to source file
      const resolvedPath = resolve(sourceDir, linkPath);
      return relative(base, resolvedPath);
    } else {
      // Convert to relative path
      if (!isAbsolute(linkPath)) {
        return linkPath;
      }

      // Convert absolute to relative from source file
      const absolutePath = resolve(base, linkPath);
      return relative(sourceDir, absolutePath);
    }
  }

  /**
   * Convert link style format.
   *
   * @private
   *
   * @param node - Link node to convert
   * @param targetStyle - Target link style
   *
   * @returns Whether the node was modified
   */
  private convertLinkStyle(node: LinkNode, targetStyle: string): boolean {
    if (!node.url || !node.children) return false;

    const url = node.url;
    const text = this.extractLinkText(node);
    
    // Determine current style
    const currentStyle = this.detectCurrentLinkStyle(node, text, url);
    
    // If already in target style, no changes needed
    if (currentStyle === targetStyle) {
      return false;
    }

    // Convert based on target style
    switch (targetStyle) {
      case 'combined':
        return this.convertToCombined(node, text, url);
      case 'claude':
        return this.convertToClaude(node, text, url);
      case 'wikilink':
        return this.convertToWikilink(node, text, url);
      case 'markdown':
        return this.convertToMarkdown(node, text, url);
      default:
        return false;
    }
  }

  /**
   * Extract text content from link node children.
   */
  private extractLinkText(node: LinkNode): string {
    if (!node.children) return '';
    
    return node.children
      .filter(child => child.type === 'text')
      .map(child => child.value || '')
      .join('');
  }

  /**
   * Detect the current link style of a node.
   */
  private detectCurrentLinkStyle(_node: LinkNode, text: string, _url: string): string {
    // Check for combined format: text starting with @
    if (text.startsWith('@')) {
      return 'combined';
    }
    
    // For now, assume standard markdown if it's a regular link node
    // More sophisticated detection could be added here
    return 'markdown';
  }

  /**
   * Convert link to combined format [@url](url).
   */
  private convertToCombined(node: LinkNode, text: string, url: string): boolean {
    if (!node.children || !this.isInternalLink(url)) return false;

    // Only convert if text doesn't already start with @
    if (text.startsWith('@')) {
      return false;
    }

    // Set text to @url format
    const newText = `@${url}`;
    
    // Update the text node
    if (node.children.length > 0 && node.children[0].type === 'text') {
      node.children[0].value = newText;
      return true;
    }

    return false;
  }

  /**
   * Convert link to Claude import format @url.
   * Note: This requires AST restructuring which is complex.
   * For now, this returns false to indicate no changes made.
   */
  private convertToClaude(_node: LinkNode, _text: string, url: string): boolean {
    if (!this.isInternalLink(url)) return false;

    // TODO: Implement proper AST restructuring for Claude imports
    // This would require parent node access to replace the link node with a text node
    // For now, we indicate no changes to maintain type safety
    
    return false;
  }

  /**
   * Convert link to wikilink format [[url]].
   * Note: This requires AST restructuring which is complex.
   * For now, this returns false to indicate no changes made.
   */
  private convertToWikilink(_node: LinkNode, _text: string, url: string): boolean {
    if (!this.isInternalLink(url)) return false;

    // TODO: Implement proper AST restructuring for wikilinks
    // This would require parent node access to replace the link node with a text node
    // For now, we indicate no changes to maintain type safety
    
    return false;
  }

  /**
   * Convert link to standard markdown format [text](url).
   */
  private convertToMarkdown(node: LinkNode, text: string, _url: string): boolean {
    if (!node.children) return false;

    // If text starts with @, remove it for standard markdown
    if (text.startsWith('@')) {
      const newText = text.substring(1);
      
      if (node.children.length > 0 && node.children[0].type === 'text') {
        node.children[0].value = newText;
        return true;
      }
    }

    return false;
  }

  /**
   * Detect changes between original and converted content.
   *
   * @private
   *
   * @param original - Original content
   * @param converted - Converted content
   * @param filePath - File path for change tracking
   *
   * @returns Array of detected changes
   */
  private detectChanges(original: string, converted: string, filePath: string): OperationChange[] {
    const changes: OperationChange[] = [];

    // Simple line-by-line comparison for now
    const originalLines = original.split('\n');
    const convertedLines = converted.split('\n');

    const maxLines = Math.max(originalLines.length, convertedLines.length);

    for (let i = 0; i < maxLines; i++) {
      const originalLine = originalLines[i] || '';
      const convertedLine = convertedLines[i] || '';

      if (originalLine !== convertedLine) {
        changes.push({
          type: 'link-updated',
          filePath,
          oldValue: originalLine,
          newValue: convertedLine,
          line: i + 1,
        });
      }
    }

    return changes;
  }

  /**
   * Check if a node is a link or image node.
   *
   * @private
   *
   * @param node - Node to check
   *
   * @returns Whether the node is a link node
   */
  private isLinkNode(node: Node): node is LinkNode {
    return ['link', 'image', 'linkReference', 'imageReference'].includes(node.type);
  }

  /**
   * Check if a node is a text node.
   *
   * @private
   *
   * @param node - Node to check
   *
   * @returns Whether the node is a text node
   */
  private isTextNode(node: Node): node is TextNode {
    return node.type === 'text';
  }

  /**
   * Check if a URL represents an internal link.
   *
   * @private
   *
   * @param url - URL to check
   *
   * @returns Whether the URL is an internal link
   */
  private isInternalLink(url: string): boolean {
    return !url.startsWith('http') && !url.startsWith('#') && !url.startsWith('mailto:');
  }
}
