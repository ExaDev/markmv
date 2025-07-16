/**
 * Markmv - TypeScript library for markdown file operations with intelligent link refactoring
 *
 * This library provides programmatic access to all markmv functionality for use in scripts, build
 * processes, and other Node.js applications.
 *
 * @example
 *   Basic usage
 *   ```typescript
 *   import { FileOperations } from 'markmv';
 *
 *   const fileOps = new FileOperations();
 *   const result = await fileOps.moveFile('old.md', 'new.md');
 *   console.log(`Moved file successfully: ${result.success}`);
 *   ```
 *
 * @example
 *   Advanced usage with options
 *   ```typescript
 *   import { FileOperations, type MoveOperationOptions } from 'markmv';
 *
 *   const fileOps = new FileOperations();
 *   const options: MoveOperationOptions = {
 *   dryRun: true,
 *   verbose: true
 *   };
 *
 *   const result = await fileOps.moveFile('docs/old.md', 'docs/new.md', options);
 *   if (result.success) {
 *   console.log(`Would modify ${result.modifiedFiles.length} files`);
 *   result.changes.forEach(change => {
 *   console.log(`${change.type}: ${change.filePath}`);
 *   });
 *   }
 *   ```
 */

// Core library classes
import { FileOperations } from './core/file-operations.js';
import type { MoveOperationOptions, OperationResult } from './types/operations.js';

export { FileOperations };
export { LinkParser } from './core/link-parser.js';
export { LinkRefactorer } from './core/link-refactorer.js';
export { LinkValidator } from './core/link-validator.js';
export { LinkConverter } from './core/link-converter.js';
export { DependencyGraph } from './core/dependency-graph.js';
export { ContentJoiner } from './core/content-joiner.js';
export { ContentSplitter } from './core/content-splitter.js';

// Utility classes
export { FileUtils } from './utils/file-utils.js';
export { PathUtils } from './utils/path-utils.js';
export { TransactionManager } from './utils/transaction-manager.js';
export { TocGenerator } from './utils/toc-generator.js';

// Strategy classes
export {
  BaseJoinStrategy,
  DependencyOrderJoinStrategy,
  AlphabeticalJoinStrategy,
  ManualOrderJoinStrategy,
  ChronologicalJoinStrategy,
} from './strategies/join-strategies.js';

export {
  BaseMergeStrategy,
  AppendMergeStrategy,
  PrependMergeStrategy,
  InteractiveMergeStrategy,
} from './strategies/merge-strategies.js';

export {
  BaseSplitStrategy,
  HeaderBasedSplitStrategy,
  SizeBasedSplitStrategy,
  ManualSplitStrategy,
  LineBasedSplitStrategy,
} from './strategies/split-strategies.js';

// Command functions for programmatic access
export { convertCommand } from './commands/convert.js';
export { indexCommand } from './commands/index.js';
export { validateCommand, validateLinks } from './commands/validate.js';

// Type definitions
export type {
  // Core types
  MarkdownLink,
  ParsedMarkdownFile,
  LinkType,
  LinkStyle,
} from './types/links.js';

export type {
  OperationResult,
  OperationChange,
  MoveOperationOptions,
  OperationOptions,
  SplitOperationOptions,
  JoinOperationOptions,
  MergeOperationOptions,
  ConvertOperationOptions,
} from './types/operations.js';

export type { IndexOptions, FileMetadata, IndexableFile } from './commands/index.js';
export type { TocOptions, TocResult, MarkdownHeading } from './utils/toc-generator.js';

// Re-export specific strategy types that might be useful
export type {
  JoinSection,
  JoinResult,
  JoinConflict,
  JoinStrategyOptions,
} from './strategies/join-strategies.js';

export type {
  MergeSection,
  MergeResult,
  MergeConflict,
  MergeStrategyOptions,
} from './strategies/merge-strategies.js';

export type {
  SplitSection,
  SplitResult,
  SplitStrategyOptions,
} from './strategies/split-strategies.js';

/**
 * Main entry point for the markmv library
 *
 * Creates a new FileOperations instance for performing markdown file operations. This is the
 * recommended way to get started with the library.
 *
 * @example
 *   ```typescript
 *   import { createMarkMv } from 'markmv';
 *
 *   const markmv = createMarkMv();
 *   const result = await markmv.moveFile('old.md', 'new.md');
 *   ```;
 *
 * @returns A new FileOperations instance
 *
 * @group Core API
 */
export function createMarkMv(): FileOperations {
  return new FileOperations();
}

/**
 * Convenience function for moving a single markdown file
 *
 * @example
 *   ```typescript
 *   import { moveFile } from 'markmv';
 *
 *   const result = await moveFile('docs/old.md', 'docs/new.md', {
 *     dryRun: true
 *   });
 *   ```;
 *
 * @param sourcePath - The current file path
 * @param destinationPath - The target file path
 * @param options - Optional configuration
 *
 * @returns Promise resolving to operation result
 *
 * @group Core API
 */
export async function moveFile(
  sourcePath: string,
  destinationPath: string,
  options: MoveOperationOptions = {}
): Promise<OperationResult> {
  const fileOps = new FileOperations();
  return fileOps.moveFile(sourcePath, destinationPath, options);
}

/**
 * Convenience function for moving multiple markdown files
 *
 * @example
 *   ```typescript
 *   import { moveFiles } from 'markmv';
 *
 *   const result = await moveFiles([
 *     { source: 'old1.md', destination: 'new1.md' },
 *     { source: 'old2.md', destination: 'new2.md' }
 *   ]);
 *   ```;
 *
 * @param moves - Array of source/destination pairs
 * @param options - Optional configuration
 *
 * @returns Promise resolving to operation result
 *
 * @group Core API
 */
export async function moveFiles(
  moves: Array<{ source: string; destination: string }>,
  options: MoveOperationOptions = {}
): Promise<OperationResult> {
  const fileOps = new FileOperations();
  return fileOps.moveFiles(moves, options);
}

/**
 * Convenience function for validating markdown file operations
 *
 * @example
 *   ```typescript
 *   import { moveFile, validateOperation } from 'markmv';
 *
 *   const result = await moveFile('old.md', 'new.md');
 *   const validation = await validateOperation(result);
 *
 *   if (!validation.valid) {
 *   console.error(`Found ${validation.brokenLinks} broken links`);
 *   }
 *   ```
 *
 * @param result - The operation result to validate
 *
 * @returns Promise resolving to validation result
 *
 * @group Core API
 */
export async function validateOperation(result: OperationResult): Promise<{
  valid: boolean;
  brokenLinks: number;
  errors: string[];
}> {
  const fileOps = new FileOperations();
  return fileOps.validateOperation(result);
}

/**
 * Generate table of contents for markdown content
 *
 * @example
 *   ```typescript
 *   import { generateToc } from 'markmv';
 *
 *   const content = '# Title\n## Section 1\n### Subsection';
 *   const result = await generateToc(content, { minDepth: 2 });
 *   console.log(result.toc);
 *   ```;
 *
 * @param content - Markdown content to analyze
 * @param options - TOC generation options
 *
 * @returns Promise resolving to TOC result
 *
 * @group Utilities
 */
export async function generateToc(
  content: string,
  options: import('./utils/toc-generator.js').TocOptions = {}
): Promise<import('./utils/toc-generator.js').TocResult> {
  const { TocGenerator } = await import('./utils/toc-generator.js');
  const generator = new TocGenerator();
  return generator.generateToc(content, options);
}

/**
 * Generate index files with optional table of contents
 *
 * @example
 *   ```typescript
 *   import { generateIndex } from 'markmv';
 *
 *   const options = {
 *     type: 'links',
 *     strategy: 'directory',
 *     generateToc: true,
 *     tocOptions: { minDepth: 2 }
 *   };
 *   await generateIndex('.', options);
 *   ```;
 *
 * @param directory - Directory to generate index for
 * @param options - Index generation options
 *
 * @returns Promise resolving when index generation is complete
 *
 * @group Commands
 */
export async function generateIndex(
  directory: string,
  options: import('./commands/index.js').IndexOptions
): Promise<void> {
  const { indexCommand } = await import('./commands/index.js');
  return indexCommand(directory, options);
}

/**
 * Test function to demonstrate auto-exposure pattern
 *
 * @example
 *   ```typescript
 *   import { testAutoExposure } from 'markmv';
 *
 *   const result = await testAutoExposure('Hello World');
 *   console.log(result.message); // "Echo: Hello World"
 *   ```;
 *
 * @param input - The input message to echo
 *
 * @returns Promise resolving to echo result
 *
 * @group Testing
 */
export async function testAutoExposure(input: string): Promise<{
  message: string;
  timestamp: string;
  success: boolean;
}> {
  return {
    message: `Echo: ${input}`,
    timestamp: new Date().toISOString(),
    success: true,
  };
}
