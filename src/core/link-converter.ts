import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { visit } from "unist-util-visit";
import type { Node, Parent } from "unist";
import type {
  ConvertOperationOptions,
  OperationResult,
  OperationChange,
} from "../types/operations.js";
import type { MarkdownLink } from "../types/links.js";
import { LinkParser } from "./link-parser.js";

// Define MDAST node types for conversion
interface LinkNode extends Node {
  type: "link" | "image" | "linkReference" | "imageReference";
  url?: string;
  title?: string | null | undefined;
  alt?: string | null | undefined;
  identifier?: string;
  referenceType?: "full" | "collapsed" | "shortcut";
  children?: { type: string; value?: string }[];
}

interface TextNode extends Node {
  type: "text";
  value: string;
}

/**
 * Replaces the child at `index` of `parent`.
 * @throws Error when the node being replaced has no parent, which cannot happen for a link or text node.
 */
function replaceChild(
  parent: Parent | undefined,
  index: number | undefined,
  replacement: Node,
): void {
  if (parent === undefined || index === undefined) {
    throw new Error("Cannot replace a node that has no parent");
  }
  parent.children.splice(index, 1, replacement);
}

/**
 * Core class for converting markdown link formats and path resolution.
 *
 * Provides comprehensive link conversion functionality including path resolution changes
 * (absolute/relative) and link style transformations between different markdown syntaxes.
 * @category Core
 * @example
 * Basic link conversion
 * ```typescript
 * const converter = new LinkConverter();
 *
 * // Convert all links to relative paths and wikilink style
 * const result = await converter.convertFile('document.md', {
 *     pathResolution: 'relative',
 *     linkStyle: 'wikilink',
 *     basePath: process.cwd()
 * });
 * ```
 */
export class LinkConverter {
  private readonly parser: LinkParser;

  /**
   * Creates a converter with its own link parser.
   */
  constructor() {
    this.parser = new LinkParser();
  }

  /**
   * Convert links in a single markdown file.
   * @param filePath - Path to the markdown file to convert
   * @param options - Conversion options specifying target format
   * @returns Promise resolving to operation result with conversion details
   */
  async convertFile(
    filePath: string,
    options: Readonly<ConvertOperationOptions>,
  ): Promise<OperationResult> {
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
      const content = await readFile(filePath, "utf-8");
      const parsed = await this.parser.parseFile(filePath);

      // Convert the content
      const convertedContent = this.convertContent(
        content,
        parsed.links,
        filePath,
        options,
      );

      // Check if content actually changed
      if (convertedContent === content) {
        if (options.verbose === true) {
          console.log(`No changes needed in ${filePath}`);
        }
        result.success = true;

        return result;
      }

      // Write the converted content (unless dry run)
      if (options.dryRun !== true) {
        await writeFile(filePath, convertedContent, "utf-8");
        result.modifiedFiles.push(filePath);
      }

      // Track changes made
      const changes = this.detectChanges(content, convertedContent, filePath);
      result.changes.push(...changes);

      if (options.verbose === true) {
        console.log(`Converted ${String(changes.length)} links in ${filePath}`);
      }

      result.success = true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to convert ${filePath}: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Convert links in multiple markdown files.
   * @param filePaths - Array of file paths to convert
   * @param options - Conversion options specifying target format
   * @returns Promise resolving to combined operation result
   */
  async convertFiles(
    filePaths: readonly string[],
    options: Readonly<ConvertOperationOptions>,
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
   * @private
   * @param content - Original markdown content
   * @param _links - Parsed link information
   * @param filePath - Path of the source file (for relative path calculations)
   * @param options - Conversion options
   * @returns Promise resolving to converted content
   */
  private convertContent(
    content: string,
    _links: readonly MarkdownLink[],
    filePath: string,
    options: Readonly<ConvertOperationOptions>,
  ): string {
    // Parse markdown AST
    const processor = unified().use(remarkParse).use(remarkStringify, {
      bullet: "-",
      fences: true,
      incrementListMarker: false,
    });

    const tree = processor.parse(content);
    // A plain boolean flag mutated only inside the visit() callback isn't tracked by TypeScript's control-flow analysis across the call boundary, which makes the later `if` look permanently false to it; a counter avoids that blind spot.
    let changeCount = 0;

    // Transform links in the AST, replacing each changed node in its parent
    visit(
      tree,
      (node: Node, index: number | undefined, parent: Parent | undefined) => {
        if (this.isLinkNode(node)) {
          const transformed = this.transformLinkNode(node, filePath, options);
          if (transformed !== undefined) {
            replaceChild(parent, index, transformed);
            changeCount++;
          }
        } else if (node.type === "text" && options.linkStyle !== undefined) {
          // Handle Claude imports and other text-based link formats
          if (this.isTextNode(node)) {
            const transformed = this.transformTextLinks(
              node,
              filePath,
              options,
            );
            if (transformed !== undefined) {
              replaceChild(parent, index, transformed);
              changeCount++;
            }
          }
        }
      },
    );

    if (changeCount === 0) {
      return content;
    }

    const result = processor.stringify(tree);

    return typeof result === "string" ? result : String(result);
  }

  /**
   * Transform a link node according to conversion options.
   * @private
   * @param node - The link/image node to transform
   * @param filePath - Source file path for relative calculations
   * @param options - Conversion options
   * @returns A modified copy of the node, or undefined when nothing changed
   */
  private transformLinkNode(
    node: Readonly<LinkNode>,
    filePath: string,
    options: Readonly<ConvertOperationOptions>,
  ): LinkNode | undefined {
    if (node.url === undefined || node.url === "") return undefined;

    let updated: LinkNode = node;

    // Transform path resolution
    if (options.pathResolution !== undefined && this.isInternalLink(node.url)) {
      const newUrl = this.convertPathResolution(
        node.url,
        filePath,
        options.pathResolution,
        options.basePath,
      );
      if (newUrl !== node.url) {
        updated = { ...updated, url: newUrl };
      }
    }

    // Transform link style (this affects the overall syntax, handled at AST level)
    if (
      options.linkStyle !== undefined &&
      updated.url !== undefined &&
      this.isInternalLink(updated.url)
    ) {
      updated = this.convertLinkStyle(updated, options.linkStyle) ?? updated;
    }

    return updated === node ? undefined : updated;
  }

  /**
   * Transform text-based links (like Claude imports).
   * @private
   * @param node - Text node that might contain text-based links
   * @param filePath - Source file path for relative calculations
   * @param options - Conversion options
   * @returns A modified copy of the node, or undefined when nothing changed
   */
  private transformTextLinks(
    node: Readonly<TextNode>,
    filePath: string,
    options: Readonly<ConvertOperationOptions>,
  ): TextNode | undefined {
    // Handle Claude imports (@./file.md, @~/file.md)
    const claudeImportRegex = /@(\.\/|~\/|[^@\s]+)/g;
    const newValue = node.value.replace(
      claudeImportRegex,
      (match: string, path: string) => {
        if (options.pathResolution !== undefined) {
          const convertedPath = this.convertPathResolution(
            path,
            filePath,
            options.pathResolution,
            options.basePath,
          );

          return `@${convertedPath}`;
        }

        return match;
      },
    );

    if (newValue !== node.value) {
      return { ...node, value: newValue };
    }

    return undefined;
  }

  /**
   * Convert path resolution between absolute and relative formats.
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
    targetResolution: "absolute" | "relative",
    basePath?: string,
  ): string {
    // Skip external URLs and anchors
    if (linkPath.startsWith("http") || linkPath.startsWith("#")) {
      return linkPath;
    }

    const sourceDir = dirname(sourceFile);
    const base = basePath ?? process.cwd();

    if (targetResolution === "absolute") {
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
   * @private
   * @param node - Link node to convert
   * @param targetStyle - Target link style
   * @returns A modified copy of the node, or undefined when nothing changed
   */
  private convertLinkStyle(
    node: Readonly<LinkNode>,
    targetStyle: string,
  ): LinkNode | undefined {
    if (node.url === undefined || node.url === "" || !node.children) {
      return undefined;
    }

    const url = node.url;
    const text = this.extractLinkText(node);

    // Determine current style
    const currentStyle = this.detectCurrentLinkStyle(text);

    // If already in target style, no changes needed
    if (currentStyle === targetStyle) {
      return undefined;
    }

    // Convert based on target style
    switch (targetStyle) {
      case "combined":
        return this.convertToCombined(node, text, url);
      case "claude":
        return this.convertToClaude(url);
      case "wikilink":
        return this.convertToWikilink(url);
      case "markdown":
        return this.convertToMarkdown(node, text);
      default:
        return undefined;
    }
  }

  /** Extract text content from link node children. */
  private extractLinkText(node: Readonly<LinkNode>): string {
    if (!node.children) return "";

    return node.children
      .filter((child) => child.type === "text")
      .map((child) => child.value ?? "")
      .join("");
  }

  /** Detect the current link style of a node from its text. */
  private detectCurrentLinkStyle(text: string): string {
    // Check for combined format: text starting with @
    if (text.startsWith("@")) {
      return "combined";
    }

    /* For now, assume standard markdown if it's a regular link node
       More sophisticated detection could be added here */
    return "markdown";
  }

  /** Returns a copy of the link whose first child text node has the given value, or undefined when the first child is not text. */
  private withFirstTextValue(
    node: Readonly<LinkNode>,
    value: string,
  ): LinkNode | undefined {
    if (node.children === undefined || node.children.length === 0) {
      return undefined;
    }

    const [first, ...rest] = node.children;
    if (first.type !== "text") {
      return undefined;
    }

    return { ...node, children: [{ ...first, value }, ...rest] };
  }

  /** Convert link to combined format `[@url](url)`. */
  private convertToCombined(
    node: Readonly<LinkNode>,
    text: string,
    url: string,
  ): LinkNode | undefined {
    if (!node.children || !this.isInternalLink(url)) return undefined;

    // Only convert if text doesn't already start with @
    if (text.startsWith("@")) {
      return undefined;
    }

    // Set the text node to @url format
    return this.withFirstTextValue(node, `@${url}`);
  }

  /**
   * Convert link to Claude import format `@url`. Note: This requires AST restructuring which is
   * complex. For now, this returns undefined to indicate no changes made.
   */
  private convertToClaude(url: string): LinkNode | undefined {
    if (!this.isInternalLink(url)) return undefined;

    // TODO: Implement proper AST restructuring for Claude imports
    /* This would require parent node access to replace the link node with a text node
       For now, we indicate no changes to maintain type safety */

    return undefined;
  }

  /**
   * Convert link to wikilink format [[url]]. Note: This requires AST restructuring which is
   * complex. For now, this returns undefined to indicate no changes made.
   */
  private convertToWikilink(url: string): LinkNode | undefined {
    if (!this.isInternalLink(url)) return undefined;

    // TODO: Implement proper AST restructuring for wikilinks
    /* This would require parent node access to replace the link node with a text node
       For now, we indicate no changes to maintain type safety */

    return undefined;
  }

  /** Convert link to standard markdown format `[text](url)`. */
  private convertToMarkdown(
    node: Readonly<LinkNode>,
    text: string,
  ): LinkNode | undefined {
    if (!node.children) return undefined;

    // If text starts with @, remove it for standard markdown
    if (text.startsWith("@")) {
      return this.withFirstTextValue(node, text.substring(1));
    }

    return undefined;
  }

  /**
   * Detect changes between original and converted content.
   * @private
   * @param original - Original content
   * @param converted - Converted content
   * @param filePath - File path for change tracking
   * @returns Array of detected changes
   */
  private detectChanges(
    original: string,
    converted: string,
    filePath: string,
  ): OperationChange[] {
    const changes: OperationChange[] = [];

    // Simple line-by-line comparison for now
    const originalLines = original.split("\n");
    const convertedLines = converted.split("\n");

    const maxLines = Math.max(originalLines.length, convertedLines.length);

    for (let i = 0; i < maxLines; i++) {
      const originalLine = originalLines[i] || "";
      const convertedLine = convertedLines[i] || "";

      if (originalLine !== convertedLine) {
        changes.push({
          type: "link-updated",
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
   * @private
   * @param node - Node to check
   * @returns Whether the node is a link node
   */
  private isLinkNode(node: Node): node is LinkNode {
    return ["link", "image", "linkReference", "imageReference"].includes(
      node.type,
    );
  }

  /**
   * Check if a node is a text node.
   * @private
   * @param node - Node to check
   * @returns Whether the node is a text node
   */
  private isTextNode(node: Node): node is TextNode {
    return node.type === "text";
  }

  /**
   * Check if a URL represents an internal link.
   * @private
   * @param url - URL to check
   * @returns Whether the URL is an internal link
   */
  private isInternalLink(url: string): boolean {
    return (
      !url.startsWith("http") &&
      !url.startsWith("#") &&
      !url.startsWith("mailto:")
    );
  }
}
