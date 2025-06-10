import { ContentSplitter } from '../core/content-splitter.js';
import type { SplitOperationOptions } from '../types/operations.js';

/**
 * Configuration options for split command operations.
 *
 * Controls how a single markdown file is divided into multiple files,
 * including strategy selection, output location, and preview mode.
 *
 * @category Commands
 */
export interface SplitOptions {
  /** Strategy for splitting the file content */
  strategy?: 'headers' | 'size' | 'manual' | 'lines';
  /** Output directory for the split files */
  output?: string;
  /** Perform a dry run without making actual changes */
  dryRun?: boolean;
  /** Header level to use for header-based splitting (1-6) */
  headerLevel?: number;
  /** Maximum size in KB for size-based splitting */
  maxSize?: number;
  /** Comma-separated line numbers for line-based splitting */
  splitLines?: string;
  /** Enable verbose output with detailed progress information */
  verbose?: boolean;
}

/**
 * Execute the split command to divide a single markdown file into multiple files.
 *
 * This command provides intelligent splitting of markdown files using various
 * strategies and automatic link refactoring. It supports:
 * - Header-based splitting (by heading levels)
 * - Size-based splitting (by file size limits)
 * - Line-based splitting (at specific line numbers)
 * - Manual splitting (with user guidance)
 * - Automatic link updates and integrity validation
 * - Custom output directory specification
 *
 * The split operation automatically updates all cross-references to reflect the
 * new file structure and maintains link integrity throughout the project.
 *
 * @param source - Path to the markdown file to split
 * @param options - Configuration options for the split operation
 *
 * @throws Will exit the process with code 1 if the operation fails
 *
 * @category Commands
 *
 * @example Header-based splitting
 * ```typescript
 * await splitCommand('large-document.md', {
 *   strategy: 'headers',
 *   headerLevel: 2,
 *   output: './sections/'
 * });
 * ```
 *
 * @example Size-based splitting with dry run
 * ```typescript
 * await splitCommand('big-file.md', {
 *   strategy: 'size',
 *   maxSize: 50, // 50KB per file
 *   dryRun: true,
 *   verbose: true
 * });
 * ```
 *
 * @example Line-based splitting
 * ```typescript
 * await splitCommand('content.md', {
 *   strategy: 'lines',
 *   splitLines: '100,250,400',
 *   output: './parts/'
 * });
 * ```
 */
export async function splitCommand(source: string, options: SplitOptions): Promise<void> {
  const splitter = new ContentSplitter();

  // Parse split lines if provided
  let splitLines: number[] | undefined;
  if (options.splitLines) {
    try {
      splitLines = options.splitLines
        .split(',')
        .map((line) => Number.parseInt(line.trim(), 10))
        .filter((line) => !Number.isNaN(line));

      if (splitLines.length === 0) {
        console.error('❌ Invalid split lines format. Use comma-separated numbers like: 10,25,50');
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Failed to parse split lines:', error);
      process.exit(1);
    }
  }

  const splitOptions: SplitOperationOptions = {
    strategy: options.strategy || 'headers',
    outputDir: options.output || '.',
    dryRun: options.dryRun || false,
    verbose: options.verbose || false,
    headerLevel: options.headerLevel || 2,
    maxSize: options.maxSize || 100,
    splitLines: splitLines || undefined,
  };

  if (options.verbose) {
    console.log(`🔪 Splitting ${source} using ${splitOptions.strategy} strategy`);
    if (options.dryRun) {
      console.log('🔍 Dry run mode - no changes will be made');
    }
    if (splitOptions.strategy === 'headers') {
      console.log(`📋 Split on header level: ${splitOptions.headerLevel}`);
    }
    if (splitOptions.strategy === 'size') {
      console.log(`📏 Maximum size per section: ${splitOptions.maxSize}KB`);
    }
    if (splitOptions.strategy === 'lines' && splitOptions.splitLines) {
      console.log(`📍 Split at lines: ${splitOptions.splitLines.join(', ')}`);
    }
  }

  try {
    const result = await splitter.splitFile(source, splitOptions);

    if (!result.success) {
      console.error('❌ Split operation failed:');
      for (const error of result.errors) {
        console.error(`  ${error}`);
      }
      process.exit(1);
    }

    // Display results
    if (options.dryRun) {
      console.log('\n📋 Changes that would be made:');

      if (result.createdFiles.length > 0) {
        console.log('\n📄 Files that would be created:');
        for (const file of result.createdFiles) {
          console.log(`  + ${file}`);
        }
      }

      if (result.modifiedFiles.length > 0) {
        console.log('\n📝 Files that would be modified:');
        for (const file of result.modifiedFiles) {
          console.log(`  ~ ${file}`);
        }
      }

      if (result.changes.length > 0 && options.verbose) {
        console.log('\n🔗 Changes:');
        for (const change of result.changes) {
          if (change.type === 'file-created') {
            console.log(`  + Created: ${change.filePath}`);
          } else if (change.type === 'link-updated') {
            console.log(`  ~ Updated links in: ${change.filePath}`);
          }
        }
      }

      console.log(
        `\n📊 Summary: Would create ${result.createdFiles.length} file(s) and modify ${result.modifiedFiles.length} file(s)`
      );
    } else {
      console.log('✅ Split operation completed successfully!');

      console.log(`📄 Created ${result.createdFiles.length} new file(s):`);
      for (const file of result.createdFiles) {
        console.log(`  + ${file}`);
      }

      if (result.modifiedFiles.length > 0) {
        console.log(`\n📝 Modified ${result.modifiedFiles.length} file(s):`);
        for (const file of result.modifiedFiles) {
          console.log(`  ~ ${file}`);
        }
      }

      if (options.verbose && result.changes.length > 0) {
        const linkUpdates = result.changes.filter((c) => c.type === 'link-updated').length;
        if (linkUpdates > 0) {
          console.log(`\n🔗 Updated links in ${linkUpdates} file(s)`);
        }
      }
    }

    // Display warnings
    if (result.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      for (const warning of result.warnings) {
        console.log(`  ${warning}`);
      }
    }

    // Show helpful tips
    if (!options.dryRun && result.success) {
      console.log('\n💡 Tips:');
      console.log('  • Use --dry-run to preview changes before splitting');
      console.log('  • Use --verbose for detailed operation logs');
      if (splitOptions.strategy === 'headers') {
        console.log('  • Use --header-level to control which headers trigger splits');
      }
      if (splitOptions.strategy === 'size') {
        console.log('  • Use --max-size to adjust the maximum file size (in KB)');
      }
      if (splitOptions.strategy === 'lines') {
        console.log(
          '  • Use --split-lines with comma-separated line numbers (e.g., --split-lines 10,25,50)'
        );
      }
    }
  } catch (error) {
    console.error(`❌ Unexpected error: ${error}`);
    process.exit(1);
  }
}
