import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { Node } from 'unist';
import { visit } from 'unist-util-visit';
import type { LinkReference, LinkType, MarkdownLink, ParsedMarkdownFile } from '../types/links.js';

interface LinkNode extends Node {
  type: 'link' | 'image' | 'linkReference' | 'imageReference';
  url?: string;
  title?: string;
  alt?: string;
  identifier?: string;
  referenceType?: 'full' | 'collapsed' | 'shortcut';
  children?: Array<{ type: string; value?: string }>;
  position?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

interface DefinitionNode extends Node {
  type: 'definition';
  identifier: string;
  url: string;
  title?: string;
  position?: {
    start: { line: number; column: number };
  };
}

export class LinkParser {
  private processor = unified().use(remarkParse);

  async parseFile(filePath: string): Promise<ParsedMarkdownFile> {
    const absolutePath = resolve(filePath);
    const content = await readFile(absolutePath, 'utf-8');
    const tree = this.processor.parse(content);

    const links: MarkdownLink[] = [];
    const references: LinkReference[] = [];

    // Extract link references/definitions
    visit(tree, 'definition', (node: DefinitionNode) => {
      if (node.position) {
        references.push({
          id: node.identifier,
          url: node.url,
          title: node.title,
          line: node.position.start.line,
        });
      }
    });

    // Extract Claude import links from text nodes
    visit(
      tree,
      'text',
      (node: { value: string; position?: { start: { line: number; column: number } } }) => {
        if (!node.position) return;

        const claudeImportRegex = /@([^\s\n]+)/g;
        let match;

        while ((match = claudeImportRegex.exec(node.value)) !== null) {
          const importPath = match[1];
          const link: MarkdownLink = {
            type: 'claude-import',
            href: importPath,
            text: match[0], // Full "@path" text
            line: node.position.start.line,
            column: node.position.start.column + match.index,
            absolute: importPath.startsWith('/') || importPath.startsWith('~'),
          };

          // Resolve Claude import paths
          link.resolvedPath = this.resolveClaudeImportPath(importPath, dirname(absolutePath));

          links.push(link);
        }
      }
    );

    // Extract links and images
    visit(tree, ['link', 'image', 'linkReference', 'imageReference'], (node: LinkNode) => {
      if (!node.position) return;

      let href: string;
      let text: string | undefined;
      let referenceId: string | undefined;
      let linkType: LinkType;

      if (node.type === 'link' || node.type === 'image') {
        href = node.url || '';
        linkType = node.type === 'image' ? 'image' : this.determineLinkType(href);

        if (node.type === 'image') {
          text = node.alt;
        } else if (node.children) {
          text = node.children
            .filter((child) => child.type === 'text')
            .map((child) => child.value)
            .join('');
        }
      } else {
        // Reference-style links
        referenceId = node.identifier;
        const reference = references.find((ref) => ref.id === referenceId);
        href = reference?.url || '';
        linkType = node.type === 'imageReference' ? 'image' : 'reference';

        if (node.type === 'imageReference') {
          text = node.alt;
        } else if (node.children) {
          text = node.children
            .filter((child) => child.type === 'text')
            .map((child) => child.value)
            .join('');
        }
      }

      const link: MarkdownLink = {
        type: linkType,
        href,
        text,
        referenceId,
        line: node.position.start.line,
        column: node.position.start.column,
        absolute: isAbsolute(href),
      };

      // Resolve internal links
      if (linkType === 'internal') {
        link.resolvedPath = this.resolveInternalPath(href, dirname(absolutePath));
      }

      links.push(link);
    });

    const dependencies = this.extractDependencies(links);

    return {
      filePath: absolutePath,
      links,
      references,
      dependencies,
      dependents: [], // Will be populated by DependencyGraph
    };
  }

  private determineLinkType(href: string): LinkType {
    if (!href) return 'internal';

    // External links (http/https/ftp/mailto)
    if (/^(https?|ftp|mailto):/i.test(href)) {
      return 'external';
    }

    // Anchor links (starting with #)
    if (href.startsWith('#')) {
      return 'anchor';
    }

    // Internal links (relative or absolute file paths)
    return 'internal';
  }

  private resolveInternalPath(href: string, baseDir: string): string {
    // Remove anchor fragments
    const pathPart = href.split('#')[0];

    if (isAbsolute(pathPart)) {
      return pathPart;
    }

    return resolve(join(baseDir, pathPart));
  }

  private resolveClaudeImportPath(importPath: string, baseDir: string): string {
    // Handle home directory paths (~)
    if (importPath.startsWith('~/')) {
      const { homedir } = require('node:os');
      return resolve(join(homedir(), importPath.slice(2)));
    }

    // Handle absolute paths
    if (isAbsolute(importPath)) {
      return importPath;
    }

    // Handle relative paths
    return resolve(join(baseDir, importPath));
  }

  private extractDependencies(links: MarkdownLink[]): string[] {
    return links
      .filter(
        (link) => (link.type === 'internal' || link.type === 'claude-import') && link.resolvedPath
      )
      .map((link) => link.resolvedPath!)
      .filter((path, index, arr) => arr.indexOf(path) === index); // Remove duplicates
  }

  async parseDirectory(
    dirPath: string,
    extensions = ['.md', '.markdown', '.mdx']
  ): Promise<ParsedMarkdownFile[]> {
    const { glob } = await import('node:fs');
    const { promisify } = await import('node:util');
    const globAsync = promisify(glob);

    const pattern =
      extensions.length === 1
        ? `**/*${extensions[0]}`
        : `**/*.{${extensions.map((ext) => ext.slice(1)).join(',')}}`;

    const files = await globAsync(pattern, { cwd: dirPath, absolute: true });

    const results = await Promise.allSettled(files.map((file) => this.parseFile(file)));

    return results
      .filter(
        (result): result is PromiseFulfilledResult<ParsedMarkdownFile> =>
          result.status === 'fulfilled'
      )
      .map((result) => result.value);
  }
}
