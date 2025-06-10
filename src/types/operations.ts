/**
 * Base configuration options common to all file operations.
 *
 * Provides essential flags for controlling operation behavior including
 * dry run mode, verbosity, and force execution.
 *
 * @category Types
 */
export interface OperationOptions {
  /** Show what would be changed without making changes */
  dryRun?: boolean;
  /** Show detailed output */
  verbose?: boolean;
  /** Force operation even if conflicts exist */
  force?: boolean;
}

/**
 * Configuration options specific to move operations.
 *
 * Extends base operation options with move-specific settings
 * such as directory creation behavior.
 *
 * @category Types
 */
export interface MoveOperationOptions extends OperationOptions {
  /** Create missing directories */
  createDirectories?: boolean;
}

/**
 * Configuration options specific to split operations.
 *
 * Extends base operation options with split-specific settings
 * including strategy selection and output configuration.
 *
 * @category Types
 */
export interface SplitOperationOptions extends OperationOptions {
  /** Strategy for splitting the file */
  strategy: 'headers' | 'size' | 'manual' | 'lines';
  /** Output directory for split files */
  outputDir: string;
  /** Maximum file size in KB (for size strategy) */
  maxSize?: number;
  /** Header level to split on (for headers strategy) */
  headerLevel?: number;
  /** Line numbers to split on (for lines strategy) */
  splitLines: number[] | undefined;
}

/**
 * Configuration options specific to join operations.
 *
 * Extends base operation options with join-specific settings
 * including output path and ordering strategy.
 *
 * @category Types
 */
export interface JoinOperationOptions extends OperationOptions {
  /** Output file path */
  output: string | undefined;
  /** Strategy for ordering joined content */
  orderStrategy?: 'alphabetical' | 'manual' | 'dependency' | 'chronological';
}

/**
 * Configuration options specific to merge operations.
 *
 * Extends base operation options with merge-specific settings
 * including strategy selection and content formatting.
 *
 * @category Types
 */
export interface MergeOperationOptions extends OperationOptions {
  /** Strategy for merging content */
  strategy: 'append' | 'prepend' | 'interactive';
  /** Separator between merged sections */
  separator?: string;
}

/**
 * Result of any file operation containing comprehensive status information.
 *
 * Provides detailed information about what was changed, created, or deleted
 * during an operation, along with any errors or warnings encountered.
 *
 * @category Types
 *
 * @example Handling operation results
 * ```typescript
 * const result: OperationResult = await fileOps.moveFile('old.md', 'new.md');
 * 
 * if (result.success) {
 *   console.log(`Operation completed successfully`);
 *   console.log(`Modified ${result.modifiedFiles.length} files`);
 *   console.log(`Created ${result.createdFiles.length} files`);
 * } else {
 *   console.error('Operation failed:');
 *   result.errors.forEach(error => console.error(`  ${error}`));
 * }
 * ```
 */
export interface OperationResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Files that were modified */
  modifiedFiles: string[];
  /** Files that were created */
  createdFiles: string[];
  /** Files that were deleted */
  deletedFiles: string[];
  /** Any errors that occurred */
  errors: string[];
  /** Warnings */
  warnings: string[];
  /** Detailed changes made */
  changes: OperationChange[];
}

/**
 * Represents a specific change made during an operation.
 *
 * Provides detailed information about individual modifications
 * including the type of change, location, and before/after values.
 *
 * @category Types
 *
 * @example Analyzing operation changes
 * ```typescript
 * const changes: OperationChange[] = result.changes;
 * 
 * changes.forEach(change => {
 *   console.log(`${change.type} in ${change.filePath}`);
 *   if (change.line) {
 *     console.log(`  Line ${change.line}: ${change.oldValue} → ${change.newValue}`);
 *   }
 * });
 * ```
 */
export interface OperationChange {
  /** Type of change */
  type: 'file-moved' | 'file-created' | 'file-deleted' | 'link-updated' | 'content-modified';
  /** File path affected */
  filePath: string;
  /** Old value (for updates) */
  oldValue?: string;
  /** New value (for updates) */
  newValue?: string;
  /** Line number where change occurred */
  line?: number;
}
