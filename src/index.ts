/**
 * Markmv - TypeScript library for markdown file operations with intelligent link refactoring
 * @remarks
 * This library provides programmatic access to all markmv functionality for use in scripts, build
 * processes, and other Node.js applications.
 * @packageDocumentation
 * @example
 * Basic usage
 * ```typescript
 * import { FileOperations } from 'markmv';
 *
 * const fileOps = new FileOperations();
 * const result = await fileOps.moveFile('old.md', 'new.md');
 * console.log(`Moved file successfully: ${result.success}`);
 * ```
 * @example
 * Advanced usage with options
 * ```typescript
 * import { FileOperations, type MoveOperationOptions } from 'markmv';
 *
 * const fileOps = new FileOperations();
 * const options: MoveOperationOptions = {
 *   dryRun: true,
 *   verbose: true
 * };
 *
 * const result = await fileOps.moveFile('docs/old.md', 'docs/new.md', options);
 * if (result.success) {
 *   console.log(`Would modify ${result.modifiedFiles.length} files`);
 *   result.changes.forEach(change => {
 *       console.log(`${change.type}: ${change.filePath}`);
 *   });
 * }
 * ```
 */

// Core library classes
export { FileOperations } from "./core/file-operations.js";
export { LinkParser } from "./core/link-parser.js";
export { LinkRefactorer } from "./core/link-refactorer.js";
export { LinkValidator } from "./core/link-validator.js";
export { LinkConverter } from "./core/link-converter.js";
export { LinkGraphGenerator } from "./core/link-graph-generator.js";
export {
  resolveWikilinks,
  createWikilinkResolver,
  findDuplicateNoteStems,
  computeNoteStemCounts,
  type ObsidianAmbiguity,
  type DuplicateNoteStem,
  type WikilinkResolution,
} from "./core/obsidian-vault.js";
export {
  suggestLinkFixes,
  type LinkSuggestion,
} from "./core/link-suggester.js";
export {
  findLocalImages,
  findInlineImages,
  parseImageDataUri,
  imageMimeTypeForExtension,
  imageExtensionForMimeType,
  renderImageMarkdown,
  type ImageLinkOccurrence,
  type ParsedImageDataUri,
  type SpanReplacement,
} from "./core/image-inline.js";
export {
  embedCommand,
  type EmbedOptions,
  type EmbedSummary,
} from "./commands/embed.js";
export {
  extractCommand,
  type ExtractOptions,
  type ExtractSummary,
} from "./commands/extract.js";
export {
  waybackCommand,
  toWaybackUrl,
  type WaybackOptions,
  type WaybackResult,
  type WaybackFileResult,
  type WaybackLinkChange,
} from "./commands/wayback.js";
export {
  refactorIndex,
  refactorIndexCommand,
  type IndexConvention,
  type RefactorIndexOptions,
  type RefactorIndexCliOptions,
  type RefactorIndexResult,
} from "./commands/refactor-index.js";
export {
  treeCommand,
  scanMarkdownTree,
  buildFileTree,
  renderTreeAscii,
  computeTreeStatistics,
  countWords,
  type ScanOptions,
  type ScannedMarkdownFile,
  type TreeDirectoryNode,
  type TreeFileNode,
  type TreeStatistics,
  type TreeFormat,
  type TreeCliOptions,
} from "./commands/tree.js";
export { DependencyGraph } from "./core/dependency-graph.js";
export { ContentJoiner } from "./core/content-joiner.js";
export { ContentSplitter } from "./core/content-splitter.js";

// Utility classes
export { FileUtils } from "./utils/file-utils.js";
export { PathUtils } from "./utils/path-utils.js";
export { TransactionManager } from "./utils/transaction-manager.js";
export { TocGenerator } from "./utils/toc-generator.js";

// Strategy classes
export {
  BaseJoinStrategy,
  DependencyOrderJoinStrategy,
  AlphabeticalJoinStrategy,
  ManualOrderJoinStrategy,
  ChronologicalJoinStrategy,
} from "./strategies/join-strategies.js";

export {
  BaseMergeStrategy,
  AppendMergeStrategy,
  PrependMergeStrategy,
  InteractiveMergeStrategy,
} from "./strategies/merge-strategies.js";

export {
  BaseSplitStrategy,
  HeaderBasedSplitStrategy,
  SizeBasedSplitStrategy,
  ManualSplitStrategy,
  LineBasedSplitStrategy,
} from "./strategies/split-strategies.js";

// Command functions for programmatic access
export { convertCommand } from "./commands/convert.js";
export { graphCommand, generateGraph } from "./commands/graph.js";
export { indexCommand } from "./commands/generate-index.js";
export {
  tocCommand,
  generateToc as generateTocForFiles,
} from "./commands/toc.js";
export {
  validateCommand,
  validateLinks,
  planLinkFixes,
  applyLinkFix,
  type ValidateCliOptions,
  type ValidateResult,
  type PlannedLinkFix,
  type FixPrompter,
} from "./commands/validate.js";

// Type definitions
export type {
  // Core types
  MarkdownLink,
  ParsedMarkdownFile,
  LinkType,
  LinkStyle,
} from "./types/links.js";

export type {
  OperationResult,
  OperationChange,
  MoveOperationOptions,
  OperationOptions,
  SplitOperationOptions,
  JoinOperationOptions,
  MergeOperationOptions,
  ConvertOperationOptions,
  BarrelOperationOptions,
} from "./types/operations.js";

export type {
  GraphOperationOptions,
  GraphCliOptions,
  GraphResult,
} from "./commands/graph.js";
export type {
  LinkGraphOptions,
  GraphNode,
  GraphEdge,
  LinkGraph,
  GraphOutputFormat,
} from "./core/link-graph-generator.js";
export type {
  IndexOptions,
  IndexCliOptions,
  FileMetadata,
  IndexableFile,
} from "./commands/generate-index.js";
export type { ConvertOptions } from "./commands/convert.js";
export type {
  ValidateOperationOptions,
  ExtendedBrokenLink,
} from "./commands/validate.js";
export type { ValidationResult, BrokenLink } from "./types/config.js";
export type { LinkReference } from "./types/links.js";
export type { FileNode } from "./core/dependency-graph.js";
export type {
  RefactorOptions,
  LinkRefactorResult,
  ObsidianVaultContext,
} from "./core/link-refactorer.js";
export type { LinkValidatorOptions } from "./core/link-validator.js";
export type { TransactionOptions } from "./utils/transaction-manager.js";
export type {
  FileStats,
  FileCopyOptions,
  FileMoveOptions,
} from "./utils/file-utils.js";
export type { AuthConfig, AuthInfo } from "./utils/auth-detection.js";
export type {
  FreshnessConfig,
  ContentFreshnessInfo,
} from "./utils/content-freshness.js";
export type {
  TocOperationOptions,
  TocCliOptions,
  TocResult,
} from "./commands/toc.js";
export type {
  TocOptions,
  TocResult as TocGeneratorResult,
  MarkdownHeading,
} from "./utils/toc-generator.js";

// Re-export specific strategy types that might be useful
export type {
  JoinSection,
  JoinResult,
  JoinConflict,
  JoinStrategyOptions,
} from "./strategies/join-strategies.js";

export type {
  MergeSection,
  MergeResult,
  MergeConflict,
  MergeStrategyOptions,
} from "./strategies/merge-strategies.js";

export type {
  SplitSection,
  SplitResult,
  SplitStrategyOptions,
} from "./strategies/split-strategies.js";

// Convenience functions
export {
  createMarkMv,
  moveFile,
  moveFiles,
  validateOperation,
  generateToc,
  generateIndex,
  generateBarrel,
  generateLinkGraph,
  testAutoExposure,
} from "./convenience.js";
