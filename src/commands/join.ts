import { ContentJoiner } from '../core/content-joiner.js';
import type { JoinOperationOptions } from '../types/operations.js';

/**
 * Configuration options for join command operations.
 *
 * Controls how multiple markdown files are combined into a single file, including ordering
 * strategy, output location, and preview mode.
 *
 * @category Commands
 */
export interface JoinOptions {
  /** Output file path for the joined content */
  output?: string;
  /** Perform a dry run without making actual changes */
  dryRun?: boolean;
  /** Strategy for ordering content when joining files */
  orderStrategy?: 'alphabetical' | 'manual' | 'dependency' | 'chronological';
  /** Enable verbose output with detailed progress information */
  verbose?: boolean;
}

/**
 * Execute the join command to combine multiple markdown files into a single file.
 *
 * This command provides intelligent joining of markdown files with configurable ordering strategies
 * and automatic link refactoring. It supports:
 *
 * - Multiple ordering strategies (dependency, alphabetical, chronological, manual)
 * - Custom output file specification
 * - Dry run mode for previewing changes
 * - Automatic link updates and integrity validation
 * - Header conflict resolution and frontmatter merging
 *
 * The join operation automatically updates all cross-references to reflect the new unified file
 * structure and maintains link integrity throughout the project.
 *
 * @category Commands
 *
 * @example
 *   Basic file joining
 *   ```typescript
 *   await joinCommand(['intro.md', 'content.md', 'conclusion.md'], {
 *   output: 'complete-guide.md',
 *   orderStrategy: 'dependency'
 *   });
 *   ```
 *
 * @example
 *   Dry run with verbose output
 *   ```typescript
 *   await joinCommand(['docs/*.md'], {
 *   output: 'handbook.md',
 *   dryRun: true,
 *   verbose: true,
 *   orderStrategy: 'alphabetical'
 *   });
 *   ```
 *
 * @param files - Array of markdown file paths to join together
 * @param options - Configuration options for the join operation
 *
 * @throws Will exit the process with code 1 if the operation fails
 */
export async function joinCommand(files: string[], options: JoinOptions): Promise<void> {
  const joiner = new ContentJoiner();

  if (files.length === 0) {
    console.error('❌ No files provided to join');
    process.exit(1);
  }

  if (files.length === 1) {
    console.error('❌ At least two files are required for joining');
    process.exit(1);
  }

  const joinOptions: JoinOperationOptions = {
    output: options.output || undefined,
    dryRun: options.dryRun || false,
    verbose: options.verbose || false,
    orderStrategy: options.orderStrategy || 'dependency',
  };

  if (options.verbose) {
    console.log(`🔗 Joining ${files.length} files using ${joinOptions.orderStrategy} strategy`);
    console.log(`📁 Input files: ${files.join(', ')}`);
    if (options.output) {
      console.log(`📄 Output file: ${options.output}`);
    }
    if (options.dryRun) {
      console.log('🔍 Dry run mode - no changes will be made');
    }
  }

  try {
    const result = await joiner.joinFiles(files, joinOptions);

    if (!result.success) {
      console.error('❌ Join operation failed:');
      for (const error of result.errors) {
        console.error(`  ${error}`);
      }
      process.exit(1);
    }

    // Display results
    if (options.dryRun) {
      console.log('\\n📋 Changes that would be made:');

      if (result.createdFiles.length > 0) {
        console.log('\\n📄 Files that would be created:');
        for (const file of result.createdFiles) {
          console.log(`  + ${file}`);
        }
      }

      if (result.modifiedFiles.length > 0) {
        console.log('\\n📝 Files that would be modified:');
        for (const file of result.modifiedFiles) {
          console.log(`  ~ ${file}`);
        }
      }

      if (result.changes.length > 0 && options.verbose) {
        console.log('\\n🔗 Changes:');
        for (const change of result.changes) {
          if (change.type === 'file-created') {
            console.log(`  + Created: ${change.filePath}`);
          } else if (change.type === 'link-updated') {
            console.log(`  ~ Updated links in: ${change.filePath}`);
          }
        }
      }

      console.log(
        `\\n📊 Summary: Would create ${result.createdFiles.length} file(s) and modify ${result.modifiedFiles.length} file(s)`
      );
    } else {
      console.log('✅ Join operation completed successfully!');

      if (result.createdFiles.length > 0) {
        console.log(`📄 Created file: ${result.createdFiles[0]}`);
      }

      if (result.modifiedFiles.length > 0) {
        console.log(`\\n📝 Modified ${result.modifiedFiles.length} file(s):`);
        for (const file of result.modifiedFiles) {
          console.log(`  ~ ${file}`);
        }
      }

      if (options.verbose && result.changes.length > 0) {
        const linkUpdates = result.changes.filter((c) => c.type === 'link-updated').length;
        if (linkUpdates > 0) {
          console.log(`\\n🔗 Updated links in ${linkUpdates} file(s)`);
        }
      }
    }

    // Display warnings
    if (result.warnings.length > 0) {
      console.log('\\n⚠️  Warnings:');
      for (const warning of result.warnings) {
        console.log(`  ${warning}`);
      }
    }

    // Show helpful tips
    if (!options.dryRun && result.success) {
      console.log('\\n💡 Tips:');
      console.log('  • Use --dry-run to preview changes before joining');
      console.log('  • Use --verbose for detailed operation logs');
      if (joinOptions.orderStrategy === 'dependency') {
        console.log('  • Files are ordered by dependency relationships');
      } else if (joinOptions.orderStrategy === 'alphabetical') {
        console.log('  • Files are ordered alphabetically by title');
      } else if (joinOptions.orderStrategy === 'chronological') {
        console.log('  • Files are ordered by date (from frontmatter or filename)');
      }
    }
  } catch (error) {
    console.error(`❌ Unexpected error: ${error}`);
    process.exit(1);
  }
}
