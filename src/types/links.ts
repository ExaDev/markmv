/**
 * Types of markdown links that can be parsed and validated.
 *
 * Covers all common link formats including standard markdown links, images, Claude imports, and
 * Obsidian-style transclusions.
 *
 * @category Types
 */
export type LinkType =
  | 'internal' // Links to other files in the project
  | 'external' // HTTP/HTTPS URLs
  | 'anchor' // Same-file section links (#heading)
  | 'image' // Image references
  | 'reference' // Reference-style links [text][ref]
  | 'claude-import' // Claude @import syntax
  | 'obsidian-transclusion'; // Obsidian [[file]] or ![[file]] syntax

/**
 * Represents a parsed markdown link with comprehensive metadata.
 *
 * Contains all information needed for link validation, path resolution, and cross-reference
 * tracking. Used throughout the system for link analysis and manipulation.
 *
 * @category Types
 *
 * @example
 *   Accessing link information
 *   ```typescript
 *   const links: MarkdownLink[] = parsedFile.links;
 *
 *   links.forEach(link => {
 *   console.log(`${link.type} link: ${link.href}`);
 *   if (link.resolvedPath) {
 *   console.log(`  Resolves to: ${link.resolvedPath}`);
 *   }
 *   console.log(`  Location: line ${link.line}, column ${link.column}`);
 *   });
 *   ```
 */
export interface MarkdownLink {
  /** Type of link */
  type: LinkType;
  /** The href/src attribute value */
  href: string;
  /** Link text (for regular links) or alt text (for images) */
  text: string | undefined;
  /** Reference ID for reference-style links */
  referenceId: string | undefined;
  /** Block/section reference for transclusions (e.g., #section or ^block-id) */
  blockReference?: string;
  /** Line number in source file (1-based) */
  line: number;
  /** Column number in source file (1-based) */
  column: number;
  /** Whether the link uses an absolute path */
  absolute: boolean;
  /** Resolved absolute file path (for internal links) */
  resolvedPath?: string;
  /** Whether the link target exists */
  exists?: boolean;
}

/**
 * Represents a reference-style link definition.
 *
 * Reference links are defined separately from their usage (e.g., [1]: https://example.com) and can
 * be referenced multiple times throughout the document.
 *
 * @category Types
 *
 * @example
 *   Working with reference links
 *   ```typescript
 *   const references: LinkReference[] = parsedFile.references;
 *
 *   references.forEach(ref => {
 *   console.log(`Reference [${ref.id}]: ${ref.url}`);
 *   if (ref.title) {
 *   console.log(`  Title: ${ref.title}`);
 *   }
 *   });
 *   ```
 */
export interface LinkReference {
  /** Reference ID */
  id: string;
  /** URL/path */
  url: string;
  /** Optional title */
  title: string | undefined;
  /** Line number where reference is defined */
  line: number;
}

/**
 * Represents a completely parsed markdown file with all extracted metadata.
 *
 * Contains all links, references, and dependency information needed for intelligent file operations
 * and cross-reference management.
 *
 * @category Types
 *
 * @example
 *   Using parsed file data
 *   ```typescript
 *   const parsedFile: ParsedMarkdownFile = await parser.parseFile('document.md');
 *
 *   console.log(`File: ${parsedFile.filePath}`);
 *   console.log(`Links: ${parsedFile.links.length}`);
 *   console.log(`Dependencies: ${parsedFile.dependencies.length}`);
 *   console.log(`Dependents: ${parsedFile.dependents.length}`);
 *   ```
 */
export interface ParsedMarkdownFile {
  /** Absolute file path */
  filePath: string;
  /** All links found in the file */
  links: MarkdownLink[];
  /** Reference-style link definitions */
  references: LinkReference[];
  /** Files that this file depends on (links to) */
  dependencies: string[];
  /** Files that depend on this file (link to this file) */
  dependents: string[];
}
