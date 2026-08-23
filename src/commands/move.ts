import { existsSync, statSync } from 'node:fs';
import { readdir, rmdir } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
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
 * Expand source patterns (which may include globs) to actual file paths.
 *
 * This function processes an array of file patterns that may include:
 *
 * - Direct file paths, markdown or otherwise (e.g. an image referenced from a markdown file)
 * - Glob patterns (wildcard.md, nested/*.png, etc.)
 * - Mixed combinations of both
 *
 * Any resolved file is accepted, since `markmv move` can relocate a non-markdown asset (an image,
 * for example) and update every markdown link that points at it, not only markdown files
 * themselves. Provides verbose output when requested.
 *
 * @example
 *   ```typescript
 *   // Direct file paths
 *   await expandSourcePatterns(['README.md', 'docs/guide.md', 'docs/diagram.png']);
 *
 *   // Glob patterns
 *   await expandSourcePatterns(['*.md', 'docs/*.png']);
 *
 *   // Mixed patterns
 *   await expandSourcePatterns(['README.md', 'docs/*.md']);
 *   ```;
 *
 * @param patterns - Array of file patterns or direct paths to expand
 * @param verbose - Whether to output detailed expansion information
 *
 * @returns Promise resolving to an array of absolute file paths
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
      allFiles.add(resolve(pattern));
      if (verbose) {
        console.log(`   ✅ Direct file: ${pattern}`);
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

      for (const file of globResults) {
        allFiles.add(file);
        if (verbose) {
          console.log(`   ✅ ${file}`);
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

/** Directory names never moved as part of a directory source expansion */
const IGNORED_DIRECTORY_NAMES = new Set(['node_modules', '.git', 'dist']);

/**
 * Collect every file inside a directory tree, recursively, mirroring the ignores that glob expansion applies so a directory source and a glob source treat the same tree consistently.
 *
 * @param directoryRoot - Directory to walk
 *
 * @returns Promise resolving to sorted absolute file paths
 *
 * @internal
 */
async function collectDirectoryFiles(directoryRoot: string): Promise<string[]> {
  const files: string[] = [];

  const walk = async (currentDir: string): Promise<void> => {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
        await walk(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  };

  await walk(resolve(directoryRoot));
  return files.sort();
}

/**
 * Remove the directories a unit move vacated, deepest first. A directory that still contains anything is left untouched, so a partial expansion or files the operator left behind keep their parent directories alive.
 *
 * @param directoryRoot - The directory whose contents were just moved out
 *
 * @internal
 */
async function pruneEmptyDirectories(directoryRoot: string): Promise<void> {
  const prune = async (currentDir: string): Promise<boolean> => {
    let allChildrenPruned = true;
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        allChildrenPruned = false;
        continue;
      }
      if (IGNORED_DIRECTORY_NAMES.has(entry.name)) {
        allChildrenPruned = false;
        continue;
      }
      const childPruned = await prune(join(currentDir, entry.name));
      if (!childPruned) allChildrenPruned = false;
    }
    if (!allChildrenPruned) {
      return false;
    }
    await rmdir(currentDir);
    return true;
  };

  await prune(resolve(directoryRoot));
}

/**
 * Execute the move command to relocate markdown files (or files they link to) with intelligent link
 * refactoring.
 *
 * This is the main entry point for the move command functionality. It supports:
 *
 * - Single file moves to a new location
 * - Multiple file moves to a target directory
 * - Glob pattern expansion for source files
 * - Moving non-markdown assets (images and other linked files), updating every markdown link that
 *   points at them
 * - Dry run mode for previewing changes
 * - Comprehensive link integrity validation and updates
 *
 * The command automatically discovers and updates all cross-references to moved files throughout
 * the project, ensuring that no links are broken during the move operation.
 *
 * @category Commands
 *
 * @example
 *   Single file move ```typescript await moveCommand(['docs/old.md', 'docs/new.md'], { verbose: true }); ```
 *
 * @example
 *   Moving a linked image, updating any markdown files that reference it ```typescript await moveCommand(['image.png', 'assets/image.png'], { verbose: true }); ```
 *
 * @example
 *   Multiple files to directory ```typescript await moveCommand(['*.md', 'archive/'], { dryRun: true }); ```
 *
 * @example
 *   Glob pattern with dry run ```typescript await moveCommand(['docs/**\/*.md', 'backup/'], { dryRun: true, verbose: true }); ```
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
    console.error('  markmv move directory ./target/');
    console.error('  markmv move "*.md" ./target/');
    console.error('  markmv move "**/*.md" ./archive/');
    process.exit(1);
  }

  // Last argument is the destination, rest are sources
  const destination = sources[sources.length - 1];
  const sourcePatterns = sources.slice(0, -1);

  try {
    // A directory source moves as a unit: every file inside relocates under the destination with its internal structure preserved, and the destination directory is created on demand.
    const directorySources: string[] = [];
    const nonDirectoryPatterns: string[] = [];
    for (const pattern of sourcePatterns) {
      if (PathUtils.isDirectory(resolve(pattern))) {
        directorySources.push(resolve(pattern));
      } else {
        nonDirectoryPatterns.push(pattern);
      }
    }

    // Expand glob patterns to actual file paths
    const sourceFiles = await expandSourcePatterns(nonDirectoryPatterns, options.verbose);

    if (sourceFiles.length === 0 && directorySources.length === 0) {
      console.error('❌ No files found matching the specified patterns');
      process.exit(1);
    }

    // Validate destination
    const resolvedDestination = resolve(destination);
    const isDestDirectory =
      PathUtils.isDirectory(resolvedDestination) ||
      PathUtils.looksLikeDirectory(destination) ||
      directorySources.length > 0;

    if (sourceFiles.length > 1 && !isDestDirectory) {
      console.error('❌ Error: When moving multiple files, destination must be a directory');
      console.error(`   Destination: ${destination}`);
      console.error(`   Found ${sourceFiles.length} source files`);
      process.exit(1);
    }

    // Expand directory sources into per-file moves that map each file to its mirrored path under the destination
    const directoryMoves: Array<{ source: string; destination: string }> = [];
    for (const directorySource of directorySources) {
      const filesInDirectory = await collectDirectoryFiles(directorySource);
      if (options.verbose) {
        console.log(`📁 Directory source ${directorySource}: ${filesInDirectory.length} file(s)`);
      }
      for (const file of filesInDirectory) {
        directoryMoves.push({
          source: file,
          destination: join(resolvedDestination, relative(directorySource, file)),
        });
      }
    }

    const totalSourceFiles = sourceFiles.length + directoryMoves.length;

    if (options.verbose) {
      console.log(`🎯 Destination: ${destination} ${isDestDirectory ? '(directory)' : '(file)'}`);
      console.log(`📁 Found ${totalSourceFiles} source file(s):`);
      for (const file of sourceFiles) {
        console.log(`   • ${file}`);
      }
      for (const move of directoryMoves) {
        console.log(`   • ${move.source}`);
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

    if (directoryMoves.length === 0 && sourceFiles.length === 1) {
      // Single file move
      result = await fileOps.moveFile(sourceFiles[0], destination, moveOptions);
    } else {
      // Batch move: directory-expanded files carry explicit mirrored destinations; plain sources either rename to the destination path or join it when the destination is a directory
      const moves = [
        ...directoryMoves,
        ...sourceFiles.map((source) => ({
          source,
          destination: isDestDirectory ? join(resolvedDestination, basename(source)) : destination,
        })),
      ];
      result = await fileOps.moveFiles(moves, moveOptions);

      // Once a directory's contents have relocated, remove the directories it vacated
      if (!options.dryRun && result.success) {
        for (const directorySource of directorySources) {
          await pruneEmptyDirectories(directorySource);
        }
      }
    }

    if (!result.success) {
      console.error('❌ Move operation failed:');
      for (const error of result.errors) {
        console.error(`  ${error}`);
      }
      process.exit(1);
    }

    // Display results. Link updates can land in bystander files and in the moved files themselves, so counts derive from the recorded changes rather than the bystander-only modifiedFiles list.
    const linkChanges = result.changes.filter((change) => change.type === 'link-updated');
    const changedFilePaths = Array.from(new Set(linkChanges.map((change) => change.filePath)));

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

      if (changedFilePaths.length > 0) {
        console.log('\n📝 Files whose links would be updated:');
        for (const file of changedFilePaths) {
          console.log(`  ~ ${file}`);
        }
      }

      if (linkChanges.length > 0) {
        console.log('\n🔗 Link rewrites:');
        for (const change of linkChanges) {
          console.log(
            `  ${change.filePath}:${change.line} ${change.oldValue} → ${change.newValue}`
          );
        }
      }

      console.log(
        `\n📊 Summary: ${linkChanges.length} link(s) would be updated across ${changedFilePaths.length} file(s)`
      );
    } else {
      console.log('✅ Move operation completed successfully!');

      if (linkChanges.length > 0) {
        console.log(
          `📝 Updated ${linkChanges.length} link(s) across ${changedFilePaths.length} file(s)`
        );
      } else {
        console.log('📝 No links needed updating');
      }

      if (options.verbose && changedFilePaths.length > 0) {
        console.log('\nFiles with updated links:');
        for (const file of changedFilePaths) {
          console.log(`  ~ ${file}`);
        }
      }
    }

    // Surface parse failures: a file that could not be parsed had its links left untouched, so the operation cannot guarantee link integrity even though the move itself succeeded
    if (result.parseFailures && result.parseFailures.length > 0) {
      console.log(`\n⚠️  Parse Failures (${result.parseFailures.length}):`);
      console.log('  Links in these files were NOT checked or rewritten:');
      for (const failure of result.parseFailures) {
        console.log(`  ${failure.file}: ${failure.error}`);
      }
      process.exitCode = 1;
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
