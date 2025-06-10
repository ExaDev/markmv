import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  AlphabeticalJoinStrategy,
  ChronologicalJoinStrategy,
  DependencyOrderJoinStrategy,
  type JoinResult,
  type JoinSection,
  type JoinStrategyOptions,
  ManualOrderJoinStrategy,
} from '../strategies/join-strategies.js';
import type { JoinOperationOptions, OperationResult } from '../types/operations.js';
import { LinkParser } from './link-parser.js';

/**
 * Combines multiple markdown files into a single file using configurable strategies.
 *
 * The ContentJoiner provides intelligent merging of markdown content with support for
 * different ordering strategies, header management, and frontmatter handling. It can
 * handle complex scenarios like dependency resolution and conflicting content.
 *
 * @category Core
 *
 * @example Basic file joining
 * ```typescript
 * const joiner = new ContentJoiner();
 * const result = await joiner.joinFiles(
 *   ['intro.md', 'setup.md', 'usage.md'],
 *   {
 *     outputPath: 'complete-guide.md',
 *     strategy: 'alphabetical',
 *     dryRun: false
 *   }
 * );
 * 
 * if (result.success) {
 *   console.log(`Created ${result.createdFiles[0]}`);
 * }
 * ```
 *
 * @example Advanced joining with dependency ordering
 * ```typescript
 * const joiner = new ContentJoiner();
 * const result = await joiner.joinFiles(
 *   ['api.md', 'examples.md', 'getting-started.md'],
 *   {
 *     outputPath: 'documentation.md',
 *     strategy: 'dependency',
 *     preserveHeaders: true,
 *     handleFrontmatter: 'merge'
 *   }
 * );
 * ```
 */
export class ContentJoiner {
  private linkParser: LinkParser;

  constructor() {
    this.linkParser = new LinkParser();
  }

  /**
   * Joins multiple markdown files into a single output file.
   *
   * This method processes the input files according to the specified strategy,
   * handles header levels, manages frontmatter, and ensures proper link resolution.
   * It supports various joining strategies including alphabetical, dependency-based,
   * chronological, and manual ordering.
   *
   * @param filePaths - Array of file paths to join together
   * @param options - Configuration options for the join operation
   * @returns Promise resolving to operation result with success status and file changes
   *
   * @example
   * ```typescript
   * const result = await joiner.joinFiles(
   *   ['chapter1.md', 'chapter2.md', 'chapter3.md'],
   *   {
   *     outputPath: 'book.md',
   *     strategy: 'manual', // Preserve input order
   *     headerLevelOffset: 1, // Shift headers down one level
   *     preserveHeaders: true,
   *     handleFrontmatter: 'first' // Use first file's frontmatter
   *   }
   * );
   * ```
   */
  async joinFiles(filePaths: string[], options: JoinOperationOptions): Promise<OperationResult> {
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
      // Prepare sections from input files
      const sections = await this.prepareSections(filePaths, result);

      if (sections.length === 0) {
        result.errors.push('No valid files to join');
        return result;
      }

      // Choose join strategy
      const strategy = this.createJoinStrategy(options);

      // Perform the join
      const joinResult = await strategy.join(sections);

      // Handle join result
      result.errors.push(...joinResult.errors);
      result.warnings.push(...joinResult.warnings);

      if (joinResult.errors.length > 0) {
        return result;
      }

      // Generate output file path
      const outputPath = this.generateOutputPath(filePaths, options);

      // Create the joined content
      const finalContent = this.buildFinalContent(joinResult);

      if (!options.dryRun) {
        // Create output directory if needed
        await fs.mkdir(dirname(outputPath), { recursive: true });

        // Write the joined file
        await fs.writeFile(outputPath, finalContent, 'utf8');
        result.createdFiles.push(outputPath);

        result.changes.push({
          type: 'file-created',
          filePath: outputPath,
          newValue: finalContent,
        });
      } else {
        // In dry run, just record what would be created
        result.createdFiles.push(outputPath);
        result.changes.push({
          type: 'file-created',
          filePath: outputPath,
          newValue: finalContent,
        });
      }

      // Add conflicts as warnings
      for (const conflict of joinResult.conflicts) {
        result.warnings.push(`${conflict.type}: ${conflict.description}`);
      }

      result.success = true;
      return result;
    } catch (error) {
      result.errors.push(`Failed to join files: ${error}`);
      return result;
    }
  }

  private async prepareSections(
    filePaths: string[],
    result: OperationResult
  ): Promise<JoinSection[]> {
    const sections: JoinSection[] = [];

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];

      try {
        // Check if file exists
        await fs.access(filePath);

        // Read file content
        const content = await fs.readFile(filePath, 'utf8');

        // Parse links to find dependencies
        const parsedFile = await this.linkParser.parseFile(filePath);
        const dependencies = parsedFile.dependencies;

        // Extract frontmatter
        const { frontmatter, content: mainContent } = this.extractFrontmatter(content);

        // Extract title
        const title = this.extractTitle(mainContent, frontmatter);

        sections.push({
          filePath,
          content,
          frontmatter: frontmatter || undefined,
          title: title || undefined,
          dependencies,
          order: i, // Default order based on input order
        });
      } catch (error) {
        result.warnings.push(`Failed to read file ${filePath}: ${error}`);
      }
    }

    return sections;
  }

  private extractFrontmatter(content: string): { frontmatter?: string; content: string } {
    const frontmatterMatch = content.match(/^---\n(.*?)\n---\n/s);

    if (frontmatterMatch) {
      return {
        frontmatter: frontmatterMatch[0],
        content: content.substring(frontmatterMatch[0].length),
      };
    }

    return { content };
  }

  private extractTitle(content: string, frontmatter?: string): string | undefined {
    // Try frontmatter first
    if (frontmatter) {
      const titleMatch = frontmatter.match(/^title:\s*(.+)$/m);
      if (titleMatch) {
        return titleMatch[1].trim().replace(/['"]/g, '');
      }
    }

    // Try first header
    const lines = content.split('\n');
    for (const line of lines) {
      const headerMatch = line.match(/^#+\s+(.+)$/);
      if (headerMatch) {
        return headerMatch[1].trim();
      }
    }

    return undefined;
  }

  private createJoinStrategy(options: JoinOperationOptions) {
    const strategyOptions: JoinStrategyOptions = {
      orderStrategy: options.orderStrategy || 'dependency',
      mergeFrontmatter: true,
      deduplicateLinks: true,
      resolveHeaderConflicts: false,
    };

    switch (options.orderStrategy) {
      case 'alphabetical':
        return new AlphabeticalJoinStrategy(strategyOptions);
      case 'manual':
        return new ManualOrderJoinStrategy(strategyOptions);
      case 'chronological':
        return new ChronologicalJoinStrategy(strategyOptions);
      default:
        return new DependencyOrderJoinStrategy(strategyOptions);
    }
  }

  private generateOutputPath(filePaths: string[], options: JoinOperationOptions): string {
    if (options.output) {
      return resolve(options.output);
    }

    // Generate default output path based on input files
    const firstFile = filePaths[0];
    const baseName = firstFile.replace(/\.[^.]+$/, '');
    return `${baseName}-joined.md`;
  }

  private buildFinalContent(joinResult: JoinResult): string {
    let content = '';

    // Add frontmatter if present
    if (joinResult.frontmatter) {
      content += joinResult.frontmatter;
      if (!joinResult.frontmatter.endsWith('\n')) {
        content += '\n';
      }
      content += '\n';
    }

    // Add main content
    content += joinResult.content;

    return content;
  }
}
