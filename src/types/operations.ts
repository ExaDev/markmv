export interface OperationOptions {
  /** Show what would be changed without making changes */
  dryRun?: boolean;
  /** Show detailed output */
  verbose?: boolean;
  /** Force operation even if conflicts exist */
  force?: boolean;
}

export interface MoveOperationOptions extends OperationOptions {
  /** Create missing directories */
  createDirectories?: boolean;
}

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

export interface JoinOperationOptions extends OperationOptions {
  /** Output file path */
  output: string | undefined;
  /** Strategy for ordering joined content */
  orderStrategy?: 'alphabetical' | 'manual' | 'dependency' | 'chronological';
}

export interface MergeOperationOptions extends OperationOptions {
  /** Strategy for merging content */
  strategy: 'append' | 'prepend' | 'interactive';
  /** Separator between merged sections */
  separator?: string;
}

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
