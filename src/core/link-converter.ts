import { readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { visit } from 'unist-util-visit';
import type { Node } from 'unist';
import type { ConvertOperationOptions, OperationResult, OperationChange } from '../types/operations.js';
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
 *     pathResolution: 'relative',
 *     linkStyle: 'wikilink',
 *     basePath: process.cwd()
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
      changes: []
    };

    try {
      // Read and parse the file
      const content = await readFile(filePath, 'utf-8');
      const parsed = await this.parser.parseFile(filePath);
      
      // Convert the content
      const convertedContent = await this.convertContent(
        content, 
        parsed.links, 
        filePath, 
        options
      );

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
   * @returns Promise resolving to combined operation result
   */
  async convertFiles(filePaths: string[], options: ConvertOperationOptions): Promise<OperationResult> {
    const combinedResult: OperationResult = {
      success: true,
      modifiedFiles: [],
      createdFiles: [],
      deletedFiles: [],
      errors: [],
      warnings: [],
      changes: []
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
   * @param content - Original markdown content
   * @param links - Parsed link information
   * @param filePath - Path of the source file (for relative path calculations)
   * @param options - Conversion options
   * @returns Promise resolving to converted content
   */
  private async convertContent(
    content: string,
    _links: MarkdownLink[],
    filePath: string,
    options: ConvertOperationOptions
  ): Promise<string> {
    // Parse markdown AST
    const processor = unified()
      .use(remarkParse)
      .use(remarkStringify, {
        bullet: '-',
        fences: true,
        incrementListMarker: false
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
   * @param node - The link/image node to transform
   * @param filePath - Source file path for relative calculations
   * @param options - Conversion options
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
   * @param node - Text node that might contain text-based links
   * @param filePath - Source file path for relative calculations
   * @param options - Conversion options
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
   * @param linkPath - Original link path
   * @param sourceFile - Path of the file containing the link
   * @param targetResolution - Target path resolution type
   * @param basePath - Base path for absolute resolution calculations
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
   * @param node - Link node to convert
   * @param targetStyle - Target link style
   * @returns Whether the node was modified
   */
  private convertLinkStyle(_node: LinkNode, _targetStyle: string): boolean {
    // For now, this is a placeholder as style conversion requires more complex AST manipulation
    // The actual implementation would need to transform the node type and structure
    
    // TODO: Implement style conversion logic
    // This would involve changing node types and restructuring the AST
    
    return false;
  }

  /**
   * Detect changes between original and converted content.
   *
   * @private
   * @param original - Original content
   * @param converted - Converted content
   * @param filePath - File path for change tracking
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
          line: i + 1
        });
      }
    }

    return changes;
  }

  /**
   * Check if a node is a link or image node.
   *
   * @private
   * @param node - Node to check
   * @returns Whether the node is a link node
   */
  private isLinkNode(node: Node): node is LinkNode {
    return ['link', 'image', 'linkReference', 'imageReference'].includes(node.type);
  }

  /**
   * Check if a node is a text node.
   *
   * @private
   * @param node - Node to check
   * @returns Whether the node is a text node
   */
  private isTextNode(node: Node): node is TextNode {
    return node.type === 'text';
  }

  /**
   * Check if a URL represents an internal link.
   *
   * @private
   * @param url - URL to check
   * @returns Whether the URL is an internal link
   */
  private isInternalLink(url: string): boolean {
    return !url.startsWith('http') && !url.startsWith('#') && !url.startsWith('mailto:');
  }
}