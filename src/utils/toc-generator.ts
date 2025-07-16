import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { Node } from 'unist';
import { visit } from 'unist-util-visit';

interface HeadingNode extends Node {
  type: 'heading';
  depth: number;
  children: Array<{ type: string; value?: string }>;
}


/**
 * Represents a heading extracted from markdown content.
 *
 * @category Utils
 */
export interface MarkdownHeading {
  /** Heading level (1-6) */
  level: number;
  /** Heading text content */
  text: string;
  /** Anchor slug for linking */
  slug: string;
  /** Line number in the source file */
  line: number;
}

/**
 * Configuration options for table of contents generation.
 *
 * @category Utils
 */
export interface TocOptions {
  /** Minimum heading level to include (default: 1) */
  minDepth?: number;
  /** Maximum heading level to include (default: 6) */
  maxDepth?: number;
  /** Include line numbers in output (default: false) */
  includeLineNumbers?: boolean;
  /** Custom slug generator function */
  slugify?: (text: string) => string;
}

/**
 * Result of table of contents generation.
 *
 * @category Utils
 */
export interface TocResult {
  /** Generated table of contents markdown */
  toc: string;
  /** Extracted headings */
  headings: MarkdownHeading[];
}

/**
 * Utility for generating table of contents from markdown content.
 *
 * This class extracts headings from markdown content and generates formatted
 * table of contents with proper indentation and anchor links.
 *
 * @category Utils
 *
 * @example
 *   Basic usage
 *   ```typescript
 *   const generator = new TocGenerator();
 *   const content = `# Title\n## Section 1\n### Subsection\n## Section 2`;
 *   const result = await generator.generateToc(content);
 *   
 *   console.log(result.toc);
 *   // Output:
 *   // - [Title](#title)
 *   //   - [Section 1](#section-1)
 *   //     - [Subsection](#subsection)
 *   //   - [Section 2](#section-2)
 *   ```
 *
 * @example
 *   With custom options
 *   ```typescript
 *   const generator = new TocGenerator();
 *   const options = {
 *     minDepth: 2,
 *     maxDepth: 4,
 *     includeLineNumbers: true
 *   };
 *   const result = await generator.generateToc(content, options);
 *   ```
 */
export class TocGenerator {
  private processor = unified().use(remarkParse);

  /**
   * Generate table of contents from markdown content.
   *
   * @param content - Markdown content to analyze
   * @param options - Configuration options
   * @returns Promise resolving to TOC result
   */
  async generateToc(content: string, options: TocOptions = {}): Promise<TocResult> {
    const {
      minDepth = 1,
      maxDepth = 6,
      includeLineNumbers = false,
      slugify = this.defaultSlugify,
    } = options;

    const tree = this.processor.parse(content);
    const headings: MarkdownHeading[] = [];

    // Extract headings from AST
    visit(tree, 'heading', (node: HeadingNode) => {
      if (!node.position) return;
      
      // Skip headings outside depth range
      if (node.depth < minDepth || node.depth > maxDepth) return;

      // Extract text from all child nodes recursively
      const text = this.extractTextFromNodes(node.children);

      if (text.trim()) {
        headings.push({
          level: node.depth,
          text: text.trim(),
          slug: slugify(text.trim()),
          line: node.position.start.line,
        });
      }
    });

    const toc = this.formatToc(headings, includeLineNumbers);

    return {
      toc,
      headings,
    };
  }

  /**
   * Extract headings from markdown content without generating TOC.
   *
   * @param content - Markdown content to analyze
   * @param options - Configuration options
   * @returns Promise resolving to array of headings
   */
  async extractHeadings(content: string, options: TocOptions = {}): Promise<MarkdownHeading[]> {
    const result = await this.generateToc(content, options);
    return result.headings;
  }

  /**
   * Format headings into a table of contents string.
   *
   * @param headings - Array of extracted headings
   * @param includeLineNumbers - Whether to include line numbers
   * @returns Formatted TOC markdown
   */
  private formatToc(headings: MarkdownHeading[], includeLineNumbers: boolean): string {
    if (headings.length === 0) {
      return '';
    }

    const lines: string[] = [];
    const minLevel = Math.min(...headings.map((h) => h.level));

    for (const heading of headings) {
      const indent = '  '.repeat(heading.level - minLevel);
      const link = `[${heading.text}](#${heading.slug})`;
      const lineInfo = includeLineNumbers ? ` (line ${heading.line})` : '';
      lines.push(`${indent}- ${link}${lineInfo}`);
    }

    return lines.join('\n');
  }

  /**
   * Extract text content from AST nodes recursively.
   *
   * @param nodes - Array of AST nodes
   * @returns Combined text content
   */
  private extractTextFromNodes(nodes: Array<{ type: string; value?: string; children?: unknown[] }>): string {
    return nodes
      .map((node) => {
        if (node.type === 'text') {
          return node.value || '';
        } else if (node.children && Array.isArray(node.children)) {
          return this.extractTextFromNodes(node.children as Array<{ type: string; value?: string; children?: unknown[] }>);
        }
        return '';
      })
      .join('');
  }

  /**
   * Default slugify function that converts text to URL-friendly anchors.
   *
   * @param text - Text to slugify
   * @returns URL-friendly slug
   */
  private defaultSlugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '-') // Replace special characters with hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }
}