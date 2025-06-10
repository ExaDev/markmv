export type LinkType = 'internal' | 'external' | 'anchor' | 'image' | 'reference' | 'claude-import' | 'obsidian-transclusion';

export interface MarkdownLink {
  /** Type of link */
  type: LinkType;
  /** The href/src attribute value */
  href: string;
  /** Link text (for regular links) or alt text (for images) */
  text?: string;
  /** Reference ID for reference-style links */
  referenceId?: string;
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

export interface LinkReference {
  /** Reference ID */
  id: string;
  /** URL/path */
  url: string;
  /** Optional title */
  title?: string;
  /** Line number where reference is defined */
  line: number;
}

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