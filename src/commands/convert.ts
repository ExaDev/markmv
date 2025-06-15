import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { glob } from 'glob';
import { LinkConverter } from '../core/link-converter.js';
import type { ConvertOperationOptions } from '../types/operations.js';
import { PathUtils } from '../utils/path-utils.js';

/**
 * Configuration options for convert command operations.
 *
 * Controls the behavior of the convert command including target formats and processing options.
 *
 * @category Commands
 */
export interface ConvertOptions {
  /** Target path resolution type */
  pathResolution?: 'absolute' | 'relative';
  /** Base path for relative path calculations */
  basePath?: string;
  /** Target link style format */
  linkStyle?: 'markdown' | 'claude' | 'combined' | 'wikilink';
  /** Perform a dry run without making actual changes */
  dryRun?: boolean;
  /** Enable verbose output with detailed progress information */
  verbose?: boolean;
  /** Process directories recursively */
  recursive?: boolean;
}

/**
 * Expand source patterns (which may include globs) to actual markdown file paths.
 *
 * This function processes an array of file patterns that may include:
 *
 * - Direct file paths
 * - Glob patterns (star.md, starstar/star.md, etc.)
 * - Directory paths (when recursive is enabled)
 * - Mixed combinations of all above
 *
 * It validates that all resolved files are markdown files and provides verbose output when
 * requested.
 *
 * @example
 *   ```typescript
 *   // Direct file paths
 *   await expandSourcePatterns(['README.md', 'docs/guide.md']);
 *
 *   // Glob patterns
 *   await expandSourcePatterns(['star.md', 'docs/star.md']);
 *
 *   // Recursive directory processing
 *   await expandSourcePatterns(['docs/'], { recursive: true });
 *   ```;
 *
 * @param patterns - Array of file patterns, paths, or directories to expand
 * @param options - Conversion options including recursive processing
 *
 * @returns Promise resolving to an array of absolute markdown file paths
 *
 * @throws Error if no markdown files are found or if patterns are invalid
 */
async function expandSourcePatterns(
  patterns: string[],
  options: ConvertOptions
): Promise<string[]> {
  const resolvedFiles = new Set<string>();

  for (const pattern of patterns) {
    const absolutePattern = resolve(pattern);

    // Check if it's a direct file
    if (existsSync(absolutePattern) && statSync(absolutePattern).isFile()) {
      if (PathUtils.isMarkdownFile(absolutePattern)) {
        resolvedFiles.add(absolutePattern);
        if (options.verbose) {
          console.log(`Added file: ${absolutePattern}`);
        }
      } else {
        console.warn(`Skipping non-markdown file: ${absolutePattern}`);
      }
      continue;
    }

    // Check if it's a directory
    if (existsSync(absolutePattern) && statSync(absolutePattern).isDirectory()) {
      if (options.recursive) {
        const globPattern = `${absolutePattern}/**/*.md`;
        const files = await glob(globPattern, { absolute: true });
        files.forEach((file) => resolvedFiles.add(file));
        if (options.verbose) {
          console.log(`Added ${files.length} files from directory: ${absolutePattern}`);
        }
      } else {
        const globPattern = `${absolutePattern}/*.md`;
        const files = await glob(globPattern, { absolute: true });
        files.forEach((file) => resolvedFiles.add(file));
        if (options.verbose) {
          console.log(`Added ${files.length} files from directory: ${absolutePattern}`);
        }
      }
      continue;
    }

    // Treat as glob pattern
    try {
      const files = await glob(pattern, { absolute: true });
      const markdownFiles = files.filter((file) => PathUtils.isMarkdownFile(file));

      if (markdownFiles.length === 0 && options.verbose) {
        console.warn(`No markdown files found for pattern: ${pattern}`);
      }

      markdownFiles.forEach((file) => resolvedFiles.add(file));

      if (options.verbose) {
        console.log(`Pattern "${pattern}" matched ${markdownFiles.length} markdown files`);
      }
    } catch (error) {
      throw new Error(
        `Invalid glob pattern "${pattern}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const finalFiles = Array.from(resolvedFiles);

  if (finalFiles.length === 0) {
    throw new Error(
      `No markdown files found matching the provided patterns: ${patterns.join(', ')}`
    );
  }

  return finalFiles.sort();
}

/**
 * Validate conversion options and provide defaults.
 *
 * @param options - Raw conversion options from CLI
 *
 * @returns Validated options with defaults applied
 *
 * @throws Error if options are invalid
 */
function validateConvertOptions(options: ConvertOptions): ConvertOptions {
  const validated = { ...options };

  // Validate path resolution
  if (validated.pathResolution && !['absolute', 'relative'].includes(validated.pathResolution)) {
    throw new Error(
      `Invalid path resolution type: ${validated.pathResolution}. Must be 'absolute' or 'relative'`
    );
  }

  // Validate link style
  if (
    validated.linkStyle &&
    !['markdown', 'claude', 'combined', 'wikilink'].includes(validated.linkStyle)
  ) {
    throw new Error(
      `Invalid link style: ${validated.linkStyle}. Must be 'markdown', 'claude', 'combined', or 'wikilink'`
    );
  }

  // Require at least one conversion operation
  if (!validated.pathResolution && !validated.linkStyle) {
    throw new Error(
      'At least one conversion option must be specified (--path-resolution or --link-style)'
    );
  }

  // Set default base path
  if (validated.pathResolution && !validated.basePath) {
    validated.basePath = process.cwd();
  }

  return validated;
}

/**
 * Print conversion summary statistics.
 *
 * @param files - Array of files processed
 * @param result - Operation result with conversion details
 * @param options - Conversion options for context
 */
function printConvertSummary(
  files: string[],
  result: import('../types/operations.js').OperationResult,
  options: ConvertOptions
): void {
  console.log('\n=== Conversion Summary ===');
  console.log(`Files processed: ${files.length}`);
  console.log(`Files modified: ${result.modifiedFiles.length}`);
  console.log(`Total changes: ${result.changes.length}`);

  if (options.pathResolution && options.linkStyle) {
    console.log(`Path resolution: converted to ${options.pathResolution}`);
    console.log(`Link style: converted to ${options.linkStyle}`);
  } else if (options.pathResolution) {
    console.log(`Path resolution: converted to ${options.pathResolution}`);
  } else if (options.linkStyle) {
    console.log(`Link style: converted to ${options.linkStyle}`);
  }

  if (result.errors.length > 0) {
    console.log(`Errors: ${result.errors.length}`);
    result.errors.forEach((error) => console.error(`  - ${error}`));
  }

  if (result.warnings.length > 0) {
    console.log(`Warnings: ${result.warnings.length}`);
    result.warnings.forEach((warning) => console.warn(`  - ${warning}`));
  }

  if (options.dryRun) {
    console.log('\n(Dry run - no files were actually modified)');
  }
}

/**
 * CLI command handler for convert operations.
 *
 * Processes markdown files to convert link formats and path resolution according to specified
 * options. Supports dry run mode, verbose output, and various conversion strategies.
 *
 * @example
 *   ```bash
 *   # Convert all links to relative paths
 *   markmv convert docs/star.md --path-resolution relative
 *
 *   # Convert to wikilink style with absolute paths
 *   markmv convert starstar/star.md --link-style wikilink --path-resolution absolute
 *
 *   # Dry run with verbose output
 *   markmv convert README.md --link-style claude --dry-run --verbose
 *   ```;
 *
 * @param patterns - File patterns to process (supports globs)
 * @param options - Command options specifying conversion parameters
 *
 * @group Commands
 */
export async function convertCommand(patterns: string[], options: ConvertOptions): Promise<void> {
  try {
    // Validate input patterns
    if (!patterns || patterns.length === 0) {
      throw new Error('At least one file pattern must be specified');
    }

    // Validate and normalize options
    const validatedOptions = validateConvertOptions(options);

    if (validatedOptions.verbose) {
      console.log('Starting link conversion...');
      console.log(`Patterns: ${patterns.join(', ')}`);
      if (validatedOptions.pathResolution) {
        console.log(`Path resolution: ${validatedOptions.pathResolution}`);
      }
      if (validatedOptions.linkStyle) {
        console.log(`Link style: ${validatedOptions.linkStyle}`);
      }
      if (validatedOptions.dryRun) {
        console.log('Dry run mode: no files will be modified');
      }
    }

    // Expand file patterns
    const files = await expandSourcePatterns(patterns, validatedOptions);

    if (validatedOptions.verbose) {
      console.log(`Found ${files.length} markdown files to process`);
    }

    // Create converter and process files
    const converter = new LinkConverter();
    const operationOptions: ConvertOperationOptions = {
      ...(validatedOptions.pathResolution && { pathResolution: validatedOptions.pathResolution }),
      ...(validatedOptions.basePath && { basePath: validatedOptions.basePath }),
      ...(validatedOptions.linkStyle && { linkStyle: validatedOptions.linkStyle }),
      ...(validatedOptions.recursive && { recursive: validatedOptions.recursive }),
      ...(validatedOptions.dryRun && { dryRun: validatedOptions.dryRun }),
      ...(validatedOptions.verbose && { verbose: validatedOptions.verbose }),
    };

    const result = await converter.convertFiles(files, operationOptions);

    // Print results
    if (validatedOptions.verbose || result.changes.length > 0) {
      printConvertSummary(files, result, validatedOptions);
    }

    // Exit with appropriate code
    if (!result.success) {
      console.error('\nConversion completed with errors');
      process.exit(1);
    } else if (result.changes.length === 0) {
      console.log('No changes were needed');
    } else {
      console.log('\nConversion completed successfully');
    }
  } catch (error) {
    console.error('Conversion failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
