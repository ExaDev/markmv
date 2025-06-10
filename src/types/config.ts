export interface MarkmvConfig {
  /** Base directory for operations */
  baseDir?: string;
  /** File patterns to include */
  include?: string[];
  /** File patterns to exclude */
  exclude?: string[];
  /** Whether to follow symbolic links */
  followSymlinks?: boolean;
  /** Default options for operations */
  defaults?: {
    move?: Partial<import('./operations.js').MoveOperationOptions>;
    split?: Partial<import('./operations.js').SplitOperationOptions>;
    join?: Partial<import('./operations.js').JoinOperationOptions>;
    merge?: Partial<import('./operations.js').MergeOperationOptions>;
  };
  /** Link validation settings */
  validation?: {
    /** Check external links */
    checkExternal?: boolean;
    /** Timeout for external link checks (ms) */
    externalTimeout?: number;
    /** Whether to treat missing files as errors */
    strictInternal?: boolean;
  };
}

export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Files that were validated */
  filesChecked: number;
  /** Links that were validated */
  linksChecked: number;
  /** Broken links found */
  brokenLinks: BrokenLink[];
  /** Warnings */
  warnings: string[];
}

export interface BrokenLink {
  /** File containing the broken link */
  sourceFile: string;
  /** The broken link */
  link: import('./links.js').MarkdownLink;
  /** Reason the link is broken */
  reason: 'file-not-found' | 'external-error' | 'invalid-format' | 'circular-reference';
  /** Additional error details */
  details?: string;
}
