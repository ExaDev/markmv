import { existsSync } from 'node:fs';
import { constants, access } from 'node:fs/promises';
import type { BrokenLink, ValidationResult } from '../types/config.js';
import type { MarkdownLink, ParsedMarkdownFile } from '../types/links.js';

export interface LinkValidatorOptions {
  /** Check external links (http/https) */
  checkExternal?: boolean;
  /** Timeout for external link checks in milliseconds */
  externalTimeout?: number;
  /** Treat missing files as errors */
  strictInternal?: boolean;
  /** Check Claude import links */
  checkClaudeImports?: boolean;
}

export class LinkValidator {
  private options: Required<LinkValidatorOptions>;

  constructor(options: LinkValidatorOptions = {}) {
    this.options = {
      checkExternal: options.checkExternal ?? false,
      externalTimeout: options.externalTimeout ?? 5000,
      strictInternal: options.strictInternal ?? true,
      checkClaudeImports: options.checkClaudeImports ?? true,
    };
  }

  async validateFiles(files: ParsedMarkdownFile[]): Promise<ValidationResult> {
    const brokenLinks: BrokenLink[] = [];
    const warnings: string[] = [];
    let linksChecked = 0;

    for (const file of files) {
      const fileErrors = await this.validateFile(file);
      brokenLinks.push(...fileErrors);
      linksChecked += file.links.length;
    }

    return {
      valid: brokenLinks.length === 0,
      filesChecked: files.length,
      linksChecked,
      brokenLinks,
      warnings,
    };
  }

  async validateFile(file: ParsedMarkdownFile): Promise<BrokenLink[]> {
    const brokenLinks: BrokenLink[] = [];

    for (const link of file.links) {
      const broken = await this.validateLink(link, file.filePath);
      if (broken) {
        brokenLinks.push(broken);
      }
    }

    return brokenLinks;
  }

  async validateLink(link: MarkdownLink, sourceFile: string): Promise<BrokenLink | null> {
    try {
      switch (link.type) {
        case 'internal':
          return await this.validateInternalLink(link, sourceFile);

        case 'claude-import':
          return this.options.checkClaudeImports
            ? await this.validateClaudeImportLink(link, sourceFile)
            : null;

        case 'external':
          return this.options.checkExternal
            ? await this.validateExternalLink(link, sourceFile)
            : null;

        case 'anchor':
          // Anchor links are always valid (they reference sections within the same file)
          return null;

        case 'image':
          return await this.validateImageLink(link, sourceFile);

        case 'reference':
          // Reference links are validated if they resolve to an internal/external link
          return null;

        default:
          return null;
      }
    } catch (error) {
      return {
        sourceFile,
        link,
        reason: 'invalid-format',
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async validateInternalLink(
    link: MarkdownLink,
    sourceFile: string
  ): Promise<BrokenLink | null> {
    if (!link.resolvedPath) {
      return {
        sourceFile,
        link,
        reason: 'invalid-format',
        details: 'Could not resolve internal link path',
      };
    }

    try {
      await access(link.resolvedPath, constants.F_OK);
      return null; // Link is valid
    } catch {
      if (this.options.strictInternal) {
        return {
          sourceFile,
          link,
          reason: 'file-not-found',
          details: `File does not exist: ${link.resolvedPath}`,
        };
      }
      return null; // Not strict, so ignore missing files
    }
  }

  private async validateClaudeImportLink(
    link: MarkdownLink,
    sourceFile: string
  ): Promise<BrokenLink | null> {
    if (!link.resolvedPath) {
      return {
        sourceFile,
        link,
        reason: 'invalid-format',
        details: 'Could not resolve Claude import path',
      };
    }

    // Claude imports should point to existing files
    try {
      await access(link.resolvedPath, constants.F_OK);
      return null; // Import is valid
    } catch {
      return {
        sourceFile,
        link,
        reason: 'file-not-found',
        details: `Claude import file does not exist: ${link.resolvedPath}`,
      };
    }
  }

  private async validateExternalLink(
    link: MarkdownLink,
    sourceFile: string
  ): Promise<BrokenLink | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.options.externalTimeout);

      const response = await fetch(link.href, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          sourceFile,
          link,
          reason: 'external-error',
          details: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      return null; // Link is valid
    } catch (error) {
      return {
        sourceFile,
        link,
        reason: 'external-error',
        details: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async validateImageLink(
    link: MarkdownLink,
    sourceFile: string
  ): Promise<BrokenLink | null> {
    // For external images, use external validation if enabled
    if (link.href.startsWith('http')) {
      return this.options.checkExternal ? await this.validateExternalLink(link, sourceFile) : null;
    }

    // For internal images, check if file exists
    if (!link.resolvedPath) {
      return {
        sourceFile,
        link,
        reason: 'invalid-format',
        details: 'Could not resolve image path',
      };
    }

    try {
      await access(link.resolvedPath, constants.F_OK);
      return null; // Image exists
    } catch {
      return {
        sourceFile,
        link,
        reason: 'file-not-found',
        details: `Image file does not exist: ${link.resolvedPath}`,
      };
    }
  }

  async checkCircularReferences(files: ParsedMarkdownFile[]): Promise<string[][]> {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const buildGraph = () => {
      const graph = new Map<string, string[]>();

      for (const file of files) {
        const dependencies = file.links
          .filter((link) => link.type === 'internal' || link.type === 'claude-import')
          .map((link) => link.resolvedPath!)
          .filter((path) => path); // Remove empty paths

        graph.set(file.filePath, dependencies);
      }

      return graph;
    };

    const graph = buildGraph();

    const dfs = (filePath: string, path: string[]): void => {
      if (recursionStack.has(filePath)) {
        // Found a cycle
        const cycleStart = path.indexOf(filePath);
        cycles.push([...path.slice(cycleStart), filePath]);
        return;
      }

      if (visited.has(filePath)) return;

      visited.add(filePath);
      recursionStack.add(filePath);

      const dependencies = graph.get(filePath) || [];
      for (const dep of dependencies) {
        dfs(dep, [...path, filePath]);
      }

      recursionStack.delete(filePath);
    };

    for (const file of files) {
      if (!visited.has(file.filePath)) {
        dfs(file.filePath, []);
      }
    }

    return cycles;
  }

  async validateLinkIntegrity(files: ParsedMarkdownFile[]): Promise<{
    valid: boolean;
    circularReferences: string[][];
    brokenLinks: BrokenLink[];
    warnings: string[];
  }> {
    const [validationResult, circularReferences] = await Promise.all([
      this.validateFiles(files),
      this.checkCircularReferences(files),
    ]);

    const warnings = [...validationResult.warnings];

    if (circularReferences.length > 0) {
      warnings.push(`Found ${circularReferences.length} circular reference(s)`);
    }

    return {
      valid: validationResult.valid && circularReferences.length === 0,
      circularReferences,
      brokenLinks: validationResult.brokenLinks,
      warnings,
    };
  }
}
