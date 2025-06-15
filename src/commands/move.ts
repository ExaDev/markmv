import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { glob } from 'glob';
import { FileOperations } from '../core/file-operations.js';
import type { MoveOperationOptions, OperationResult } from '../types/operations.js';
import { PathUtils } from '../utils/path-utils.js';

/**
 * Configuration options for move command operations.
 *
 * Controls the behavior of the move command including preview mode and output verbosity.
 *
 * @category Commands
 */
export interface MoveOptions {
  /** Perform a dry run without making actual changes */
  dryRun?: boolean;
  /** Enable verbose output with detailed progress information */
  verbose?: boolean;
}

/**
 * Expand source patterns (which may include globs) to actual markdown file paths.
 *
 * This function processes an array of file patterns that may include:
 *
 * - Direct file paths
 * - Glob patterns (wildcard.md, nested/wildcard.md, etc.)
 * - Mixed combinations of both
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
 *   await expandSourcePatterns(['*.md', 'docs/*.md']);
 *
 *   // Mixed patterns
 *   await expandSourcePatterns(['README.md', 'docs/*.md']);
 *   ```
 *
 * @param patterns - Array of file patterns or direct paths to expand
 * @param verbose - Whether to output detailed expansion information
 *
 * @returns Promise resolving to an array of absolute markdown file paths
 *
 * @internal
 */
async function expandSourcePatterns(patterns: string[], verbose = false): Promise<string[]> {
  const allFiles = new Set<string>();

  for (const pattern of patterns) {
    if (verbose) {
      console.log(`🔍 Expanding pattern: ${pattern}`);
    }

    // Check if pattern is a direct file path first
    if (existsSync(pattern) && statSync(pattern).isFile()) {
      if (PathUtils.isMarkdownFile(pattern)) {
        allFiles.add(resolve(pattern));
        if (verbose) {
          console.log(`   ✅ Direct file: ${pattern}`);
        }
      } else {
        console.warn(`   ⚠️  Skipping non-markdown file: ${pattern}`);
      }
      continue;
    }

    // Expand glob pattern
    try {
      const globResults = await glob(pattern, {
        ignore: ['node_modules/**', '.git/**', 'dist/**'],
        absolute: true,
        nodir: true, // Only return files, not directories
      });

      if (verbose && globResults.length > 0) {
        console.log(`   📁 Found ${globResults.length} file(s) matching pattern`);
      }

      // Filter to only markdown files
      for (const file of globResults) {
        if (PathUtils.isMarkdownFile(file)) {
          allFiles.add(file);
          if (verbose) {
            console.log(`   ✅ ${file}`);
          }
        } else if (verbose) {
          console.log(`   ⚠️  Skipping non-markdown: ${file}`);
        }
      }

      if (globResults.length === 0 && verbose) {
        console.log(`   ❌ No files found for pattern: ${pattern}`);
      }
    } catch (error) {
      console.error(`   ❌ Error expanding pattern "${pattern}": ${error}`);
    }
  }

  return Array.from(allFiles).sort();
}

/**
 * Execute the move command to relocate markdown files with intelligent link refactoring.
 *
 * This is the main entry point for the move command functionality. It supports:
 *
 * - Single file moves to a new location
 * - Multiple file moves to a target directory
 * - Glob pattern expansion for source files
 * - Dry run mode for previewing changes
 * - Comprehensive link integrity validation and updates
 *
 * The command automatically discovers and updates all cross-references to moved files throughout
 * the project, ensuring that no links are broken during the move operation.
 *
 * @category Commands
 *
 * @example
 *   Single file move
 *   ```typescript
 *   await moveCommand(['docs/old.md', 'docs/new.md'], { verbose: true });
 *   ```
 *
 * @example
 *   Multiple files to directory
 *   ```typescript
 *   await moveCommand(['*.md', 'archive/'], { dryRun: true });
 *   ```
 *
 * @example
 *   Glob pattern with dry run
 *   ```typescript
 *   await moveCommand(['docs/**\/*.md', 'backup/'], {
 *   dryRun: true,
 *   verbose: true
 *   });
 *   ```
 *
 * @param sources - Array containing source patterns and destination (last element)
 * @param options - Configuration options for the move operation
 *
 * @throws Will exit the process with code 1 if the operation fails
 */
export async function moveCommand(sources: string[], options: MoveOptions): Promise<void> {
  if (sources.length < 2) {
    console.error('❌ Error: At least 2 arguments required (source(s) and destination)');
    console.error('Usage: markmv move <sources...> <destination>');
    console.error('Examples:');
    console.error('  markmv move file.md ./target/');
    console.error('  markmv move file1.md file2.md ./target/');
    console.error('  markmv move "*.md" ./target/');
    console.error('  markmv move "**/*.md" ./archive/');
    process.exit(1);
  }

  // Last argument is the destination, rest are sources
  const destination = sources[sources.length - 1];
  const sourcePatterns = sources.slice(0, -1);

  try {
    // Expand glob patterns to actual file paths
    const sourceFiles = await expandSourcePatterns(sourcePatterns, options.verbose);

    if (sourceFiles.length === 0) {
      console.error('❌ No markdown files found matching the specified patterns');
      process.exit(1);
    }

    // Validate destination
    const resolvedDestination = resolve(destination);
    const isDestDirectory =
      PathUtils.isDirectory(resolvedDestination) || PathUtils.looksLikeDirectory(destination);

    if (sourceFiles.length > 1 && !isDestDirectory) {
      console.error('❌ Error: When moving multiple files, destination must be a directory');
      console.error(`   Destination: ${destination}`);
      console.error(`   Found ${sourceFiles.length} source files`);
      process.exit(1);
    }

    if (options.verbose) {
      console.log(`🎯 Destination: ${destination} ${isDestDirectory ? '(directory)' : '(file)'}`);
      console.log(`📁 Found ${sourceFiles.length} source file(s):`);
      for (const file of sourceFiles) {
        console.log(`   • ${file}`);
      }

      if (options.dryRun) {
        console.log('🔍 Dry run mode - no changes will be made');
      }
    }

    const fileOps = new FileOperations();
    const moveOptions: MoveOperationOptions = {
      dryRun: options.dryRun || false,
      verbose: options.verbose || false,
      createDirectories: true,
    };

    let result: OperationResult;

    if (sourceFiles.length === 1) {
      // Single file move
      result = await fileOps.moveFile(sourceFiles[0], destination, moveOptions);
    } else {
      // Batch move
      const moves = sourceFiles.map((source) => ({
        source,
        destination,
      }));
      result = await fileOps.moveFiles(moves, moveOptions);
    }

    if (!result.success) {
      console.error('❌ Move operation failed:');
      for (const error of result.errors) {
        console.error(`  ${error}`);
      }
      process.exit(1);
    }

    // Display results
    if (options.dryRun) {
      console.log('\n📋 Changes that would be made:');

      if (result.createdFiles.length > 0) {
        console.log('\n✅ Files that would be created:');
        for (const file of result.createdFiles) {
          console.log(`  + ${file}`);
        }
      }

      if (result.deletedFiles.length > 0) {
        console.log('\n🗑️  Files that would be deleted:');
        for (const file of result.deletedFiles) {
          console.log(`  - ${file}`);
        }
      }

      if (result.modifiedFiles.length > 0) {
        console.log('\n📝 Files that would be modified:');
        for (const file of result.modifiedFiles) {
          console.log(`  ~ ${file}`);
        }
      }

      if (result.changes.length > 0 && options.verbose) {
        console.log('\n🔗 Link changes:');
        for (const change of result.changes) {
          if (change.type === 'link-updated') {
            console.log(
              `  ${change.filePath}:${change.line} ${change.oldValue} → ${change.newValue}`
            );
          }
        }
      }

      console.log(
        `\n📊 Summary: ${result.changes.length} link(s) would be updated in ${result.modifiedFiles.length} file(s)`
      );
    } else {
      console.log('✅ Move operation completed successfully!');

      if (result.modifiedFiles.length > 0) {
        console.log(
          `📝 Updated ${result.changes.length} link(s) in ${result.modifiedFiles.length} file(s)`
        );

        if (options.verbose) {
          console.log('\nModified files:');
          for (const file of result.modifiedFiles) {
            console.log(`  ~ ${file}`);
          }
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

    // Validate the operation
    if (!options.dryRun && options.verbose) {
      console.log('\n🔍 Validating link integrity...');
      const validation = await fileOps.validateOperation(result);

      if (validation.valid) {
        console.log('✅ All links are valid');
      } else {
        console.log(`⚠️  Found ${validation.brokenLinks} broken link(s):`);
        for (const error of validation.errors) {
          console.log(`  ${error}`);
        }
      }
    }
  } catch (error) {
    console.error(`❌ Unexpected error: ${error}`);
    process.exit(1);
  }
}
