import { FileOperations } from "./core/file-operations.js";
import type { GraphOperationOptions, GraphResult } from "./commands/graph.js";
import type { IndexOptions } from "./commands/generate-index.js";
import type { TocOptions, TocResult } from "./utils/toc-generator.js";
import type {
  MoveOperationOptions,
  OperationResult,
} from "./types/operations.js";

/**
 * Main entry point for the markmv library
 *
 * Creates a new FileOperations instance for performing markdown file operations. This is the
 * recommended way to get started with the library.
 * @example
 * ```typescript
 * import { createMarkMv } from 'markmv';
 *
 * const markmv = createMarkMv();
 * const result = await markmv.moveFile('old.md', 'new.md');
 * ```
 * @returns A new FileOperations instance
 * @category Core
 */
export function createMarkMv(): FileOperations {
  return new FileOperations();
}

/**
 * Convenience function for moving a single file: a markdown file or a non-markdown asset (such as
 * an image) that markdown files link to. Any markdown file that references the moved file has its
 * link updated to the new location.
 * @example
 * ```typescript
 * import { moveFile } from 'markmv';
 *
 * const result = await moveFile('docs/old.md', 'docs/new.md', {
 *   dryRun: true
 * });
 * ```
 * @param sourcePath - The current file path
 * @param destinationPath - The target file path
 * @param options - Optional configuration
 * @returns Promise resolving to operation result
 * @category Core
 */
export async function moveFile(
  sourcePath: string,
  destinationPath: string,
  options: MoveOperationOptions = {},
): Promise<OperationResult> {
  const fileOps = new FileOperations();

  return fileOps.moveFile(sourcePath, destinationPath, options);
}

/**
 * Convenience function for moving multiple files (markdown files, non-markdown assets, or a mix of
 * both) in a single batch
 * @example
 * ```typescript
 * import { moveFiles } from 'markmv';
 *
 * const result = await moveFiles([
 *   { source: 'old1.md', destination: 'new1.md' },
 *   { source: 'old2.md', destination: 'new2.md' }
 * ]);
 * ```
 * @param moves - Array of source/destination pairs
 * @param options - Optional configuration
 * @returns Promise resolving to operation result
 * @category Core
 */
export async function moveFiles(
  moves: readonly { source: string; destination: string }[],
  options: MoveOperationOptions = {},
): Promise<OperationResult> {
  const fileOps = new FileOperations();

  return fileOps.moveFiles([...moves], options);
}

/**
 * Convenience function that re-parses the files an operation modified or created (those that still exist on disk) and checks that every link in them resolves. A validation failure is reported in the result rather than thrown.
 * @example
 * ```typescript
 * import { moveFile, validateOperation } from 'markmv';
 *
 * const result = await moveFile('old.md', 'new.md');
 * const validation = await validateOperation(result);
 *
 * if (!validation.valid) {
 * console.error(`Found ${validation.brokenLinks} broken links`);
 * }
 * ```
 * @param result - The operation result to validate
 * @returns Promise resolving to the validity flag, the number of broken links and a message for each
 * @category Core
 */
export async function validateOperation(result: OperationResult): Promise<{
  /** Whether every link in the modified and created files resolved */
  valid: boolean;
  /** Number of broken links found */
  brokenLinks: number;
  /** One message per broken link, or a single message when validation itself failed */
  errors: string[];
}> {
  const fileOps = new FileOperations();

  return fileOps.validateOperation(result);
}

/**
 * Generate table of contents for markdown content
 * @example
 * ```typescript
 * import { generateToc } from 'markmv';
 *
 * const content = '# Title\n## Section 1\n### Subsection';
 * const result = await generateToc(content, { minDepth: 2 });
 * console.log(result.toc);
 * ```
 * @param content - Markdown content to analyze
 * @param options - TOC generation options
 * @returns Promise resolving to TOC result
 * @category Core
 */
export async function generateToc(
  content: string,
  options: Readonly<TocOptions> = {},
): Promise<TocResult> {
  const { TocGenerator } = await import("./utils/toc-generator.js");
  const generator = new TocGenerator();

  return generator.generateToc(content, options);
}

/**
 * Generate index files with optional table of contents
 * @example
 * ```typescript
 * import { generateIndex } from 'markmv';
 *
 * const options = {
 *   type: 'links',
 *   strategy: 'directory',
 *   generateToc: true,
 *   tocOptions: { minDepth: 2 }
 * };
 * await generateIndex('.', options);
 * ```
 * @param directory - Directory to generate index for
 * @param options - Index generation options
 * @returns Promise resolving when index generation is complete
 * @category Core
 */
export async function generateIndex(
  directory: string,
  options: IndexOptions,
): Promise<void> {
  const { indexCommand } = await import("./commands/generate-index.js");

  return indexCommand(directory, options);
}

/**
 * Generate barrel files for themed content aggregation (alias for generateIndex)
 * @example
 * ```typescript
 * import { generateBarrel } from 'markmv';
 *
 * const options = {
 *   type: 'links',
 *   strategy: 'directory',
 *   name: 'api-docs.md',
 *   generateToc: true
 * };
 * await generateBarrel('docs/', options);
 * ```
 * @param directory - Directory to generate barrel files for
 * @param options - Barrel generation options (same as IndexOptions)
 * @returns Promise resolving when barrel generation is complete
 * @category Core
 */
export async function generateBarrel(
  directory: string,
  options: IndexOptions,
): Promise<void> {
  return generateIndex(directory, options);
}

/**
 * Generate interactive link graphs from markdown file relationships
 * @example
 * Basic graph generation
 * ```typescript
 * import { generateLinkGraph } from 'markmv';
 *
 * const result = await generateLinkGraph(['docs/**\/*.md'], {
 * format: 'mermaid',
 * includeExternal: false
 * });
 *
 * console.log('Generated Mermaid diagram:');
 * console.log(result.content);
 * ```
 * @example
 * Interactive HTML visualization
 * ```typescript
 * import { generateLinkGraph } from 'markmv';
 *
 * const result = await generateLinkGraph(['**\/*.md'], {
 *     format: 'html',
 *     output: 'visualization.html',
 *     includeImages: true
 * });
 *
 * console.log('Interactive graph saved to: ' + result.outputFile);
 * ```
 * @param patterns - File patterns to analyze (supports globs)
 * @param options - Graph generation options
 * @returns Promise resolving to graph generation result
 * @category Core
 */
export async function generateLinkGraph(
  patterns: readonly string[],
  options: Readonly<GraphOperationOptions> = {
    format: "json",
  },
): Promise<GraphResult> {
  const { generateGraph } = await import("./commands/graph.js");

  return generateGraph([...patterns], options);
}

/**
 * Echoes the input back with a timestamp. Scaffolding used to check that exported functions are exposed automatically; it performs no markdown work and is not part of the supported API.
 * @example
 * ```typescript
 * import { testAutoExposure } from 'markmv';
 *
 * const result = await testAutoExposure('Hello World');
 * console.log(result.message); // "Echo: Hello World"
 * ```
 * @param input - The input message to echo
 * @returns Promise resolving to the echoed message, the ISO timestamp of the call and a success flag
 * @internal
 */
export async function testAutoExposure(input: string): Promise<{
  /** The input prefixed with `Echo: ` */
  message: string;
  /** ISO 8601 time at which the call was made */
  timestamp: string;
  /** Always `true` */
  success: boolean;
}> {
  return Promise.resolve({
    message: `Echo: ${input}`,
    timestamp: new Date().toISOString(),
    success: true,
  });
}
