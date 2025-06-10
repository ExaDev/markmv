/**
 * Main configuration interface for the Markmv library.
 *
 * Defines settings for file operations, validation, and default behaviors.
 * This configuration can be provided programmatically or loaded from
 * configuration files.
 *
 * @category Types
 *
 * @example Basic configuration
 * ```typescript
 * const config: MarkmvConfig = {
 *   baseDir: './docs',
 *   include: ['**/*.md'],
 *   exclude: ['node_modules/**', '.git/**'],
 *   defaults: {
 *     move: { dryRun: false, verbose: true }
 *   }
 * };
 * ```
 */
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

/**
 * Result of a link validation operation.
 *
 * Contains comprehensive information about the validation process
 * including success status, statistics, and any broken links found.
 *
 * @category Types
 *
 * @example Checking validation results
 * ```typescript
 * const result: ValidationResult = await validator.validateFiles(files);
 * 
 * if (!result.valid) {
 *   console.log(`Found ${result.brokenLinks.length} broken links in ${result.filesChecked} files`);
 *   result.brokenLinks.forEach(link => {
 *     console.log(`- ${link.sourceFile}: ${link.reason}`);
 *   });
 * }
 * ```
 */
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

/**
 * Represents a broken or invalid link found during validation.
 *
 * Contains detailed information about the link, where it was found,
 * and why it's considered broken. Used for reporting and debugging
 * link integrity issues.
 *
 * @category Types
 *
 * @example Handling broken links
 * ```typescript
 * const brokenLinks: BrokenLink[] = validationResult.brokenLinks;
 * 
 * brokenLinks.forEach(broken => {
 *   console.log(`${broken.sourceFile}:`);
 *   console.log(`  Link: ${broken.link.href}`);
 *   console.log(`  Reason: ${broken.reason}`);
 *   if (broken.details) {
 *     console.log(`  Details: ${broken.details}`);
 *   }
 * });
 * ```
 */
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
