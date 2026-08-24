import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { FileOperations } from '../core/file-operations.js';
import { LinkParser } from '../core/link-parser.js';
import type { OperationChange } from '../types/operations.js';

/**
 * The two index file naming conventions this command converts between.
 *
 * @category Commands
 */
export type IndexConvention = 'readme' | 'index';

/** The markdown filename each convention uses. */
const CONVENTION_FILENAMES: Record<IndexConvention, string> = {
  readme: 'README.md',
  index: 'index.md',
};

/**
 * Configuration options for index file refactoring operations.
 *
 * Controls the target convention and the behaviour of the underlying move machinery.
 *
 * @category Commands
 */
export interface RefactorIndexOptions {
  /** Target naming convention; defaults to the opposite of the file's current convention */
  to?: IndexConvention;
  /** Perform a dry run without making actual changes */
  dryRun?: boolean;
  /** Enable verbose output with detailed progress information */
  verbose?: boolean;
  /**
   * Root anchoring bystander discovery; an in-place rename spans one directory, so callers should
   * pass the project or vault root to catch bystanders above it
   */
  discoveryRoot?: string;
}

/**
 * Result of an index file refactoring operation.
 *
 * @category Commands
 */
export interface RefactorIndexResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Absolute path of the file before the rename */
  sourcePath: string;
  /** Absolute path the file is renamed to; absent when no target could be derived from the request */
  targetPath?: string;
  /** Number of inbound links rewritten to the new name */
  linksUpdated: number;
  /** Distinct files whose links were rewritten */
  filesWithUpdatedLinks: string[];
  /** Detailed link changes recorded by the move machinery */
  changes: OperationChange[];
  /** Warnings reported by the move machinery */
  warnings: string[];
  /** Files that failed to parse during the operation; their links could not be checked or rewritten */
  parseFailures: { file: string; error: string }[];
  /** Errors that prevented the operation */
  errors: string[];
}

/**
 * Detect which index convention a filename follows.
 *
 * @param filename - Exact basename to inspect, matched case-sensitively
 *
 * @returns The convention the filename belongs to, or undefined when it is neither index filename
 */
function detectConvention(filename: string): IndexConvention | undefined {
  if (filename === CONVENTION_FILENAMES.readme) return 'readme';
  if (filename === CONVENTION_FILENAMES.index) return 'index';
  return undefined;
}

/**
 * Build the result for a request refused before any file was touched.
 *
 * @param sourcePath - Absolute path of the file that was refused
 * @param errors - Human-readable reasons the request was refused
 *
 * @returns A failed result describing the refusal
 */
function refusalResult(sourcePath: string, errors: string[]): RefactorIndexResult {
  return {
    success: false,
    sourcePath,
    linksUpdated: 0,
    filesWithUpdatedLinks: [],
    changes: [],
    warnings: [],
    parseFailures: [],
    errors,
  };
}

/**
 * Convert a README.md to index.md, or an index.md to README.md, in place.
 *
 * The file is renamed within its own directory and every markdown link in the scanned tree that
 * pointed at the old name is rewritten to the new one, reusing the move machinery's link
 * refactoring (relative-path recomputation and bystander discovery included). The file's own
 * content is never reformatted by this command; it reaches the new name byte-for-byte apart from
 * any link rewrites the shared move machinery itself performs.
 *
 * @param filePath - Path to the README.md or index.md file to convert
 * @param options - Configuration options for the operation
 *
 * @returns Promise resolving to the outcome of the conversion
 */
export async function refactorIndex(
  filePath: string,
  options: RefactorIndexOptions = {}
): Promise<RefactorIndexResult> {
  const sourcePath = resolve(filePath);
  const currentConvention = detectConvention(basename(sourcePath));

  if (currentConvention === undefined) {
    return refusalResult(sourcePath, [
      `Only README.md and index.md files can be converted between conventions: "${basename(sourcePath)}" is neither`,
    ]);
  }

  if (!existsSync(sourcePath)) {
    return refusalResult(sourcePath, [`File does not exist: ${sourcePath}`]);
  }

  // options.to is typed as IndexConvention for well-typed callers, but this function is also part of the public library API: a plain-JS consumer, or a caller that bypasses the type system, can still pass an arbitrary string here. Widening to unknown before the check keeps it a real runtime guard instead of one TypeScript considers unreachable given options.to's own type.
  const rawTargetConvention: unknown =
    options.to ?? (currentConvention === 'readme' ? 'index' : 'readme');
  if (rawTargetConvention !== 'readme' && rawTargetConvention !== 'index') {
    throw new Error(
      `Unknown index convention '${String(rawTargetConvention)}': expected readme or index`
    );
  }
  const targetConvention: IndexConvention = rawTargetConvention;
  const targetFilename = CONVENTION_FILENAMES[targetConvention];

  if (targetConvention === currentConvention) {
    return refusalResult(sourcePath, [
      `"${sourcePath}" is already named ${targetFilename}; nothing to convert`,
    ]);
  }

  const targetPath = join(dirname(sourcePath), targetFilename);

  if (existsSync(targetPath)) {
    return refusalResult(sourcePath, [
      `Cannot convert to ${targetFilename}: target file already exists at ${targetPath}`,
    ]);
  }

  // A file that links to itself appears among its own dependents, and the move machinery then records a content update for the vacated source path alongside the rename, resurrecting the old filename next to the new one. Refuse upfront rather than corrupt the tree.
  const parsedSource = await new LinkParser().parseFile(sourcePath);
  const selfLink = parsedSource.links.find((link) => link.resolvedPath === sourcePath);
  if (selfLink !== undefined) {
    return refusalResult(sourcePath, [
      `"${sourcePath}" links to itself ("${selfLink.href}"); the move machinery cannot rename a self-linking file without leaving both files behind, so rewrite or remove the self-link first`,
    ]);
  }

  const fileOps = new FileOperations();
  const moveResult = await fileOps.moveFile(sourcePath, targetPath, {
    dryRun: options.dryRun ?? false,
    verbose: options.verbose ?? false,
    ...(options.discoveryRoot ? { discoverySeeds: [options.discoveryRoot] } : {}),
  });

  const linkChanges = moveResult.changes.filter((change) => change.type === 'link-updated');

  return {
    success: moveResult.success,
    sourcePath,
    targetPath,
    linksUpdated: linkChanges.length,
    filesWithUpdatedLinks: Array.from(new Set(linkChanges.map((change) => change.filePath))),
    changes: moveResult.changes,
    warnings: moveResult.warnings,
    parseFailures: moveResult.parseFailures ?? [],
    errors: moveResult.errors,
  };
}

/**
 * CLI-specific options for the refactor-index command.
 *
 * @category Commands
 */
export interface RefactorIndexCliOptions extends RefactorIndexOptions {
  /** Output results in JSON format */
  json?: boolean;
}

/**
 * Execute the refactor-index command, converting a README.md to index.md or an index.md to
 * README.md in place with automatic link updates.
 *
 * This is the entry point for the CLI command. It reports the outcome in conventional or JSON form,
 * exits non-zero when the conversion is refused or fails, and surfaces parse failures the move
 * machinery encountered along the way.
 *
 * @category Commands
 *
 * @example
 *   ```typescript await refactorIndexCommand('docs/README.md', { to: 'index' }); ```;
 *
 * @param filePath - Path to the README.md or index.md file to convert
 * @param options - CLI configuration options for the operation
 *
 * @throws Will exit the process with code 1 if the operation is refused or fails
 */
export async function refactorIndexCommand(
  filePath: string,
  options: RefactorIndexCliOptions
): Promise<void> {
  const operationOptions: RefactorIndexOptions = {
    dryRun: options.dryRun ?? false,
    verbose: options.verbose ?? false,
    // The CLI runs from the user's chosen working directory, which anchors discovery wide
    // enough to catch bystanders above the renamed file's directory
    discoveryRoot: process.cwd(),
  };
  if (options.to !== undefined) {
    operationOptions.to = options.to;
  }

  const result = await refactorIndex(filePath, operationOptions);

  if (options.json) {
    // stdout stays pure JSON: parse failures and warnings travel inside the payload, not as extra lines
    console.log(JSON.stringify(result, null, 2));
    if (!result.success) {
      process.exit(1);
    }
    if (result.parseFailures.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  if (!result.success) {
    console.error('❌ Index file refactoring failed:');
    for (const error of result.errors) {
      console.error(`  ${error}`);
    }
    process.exit(1);
  }

  // Every successful conversion carries a target path; a missing one is a broken result, not a partial rename to print
  if (result.targetPath === undefined) {
    console.error('❌ Index file refactoring failed: result carried no target path');
    process.exit(1);
  }

  if (operationOptions.dryRun) {
    console.log('🔍 Dry run mode - no changes will be made');
    console.log(`📄 ${result.sourcePath} would be renamed to ${result.targetPath}`);

    const plannedChanges = result.changes.filter((change) => change.type === 'link-updated');
    if (plannedChanges.length > 0) {
      console.log('\n🔗 Link rewrites:');
      for (const change of plannedChanges) {
        console.log(
          `  ${change.filePath}:${String(change.line)} ${String(change.oldValue)} → ${String(change.newValue)}`
        );
      }
    }

    console.log(
      `\n📊 Summary: ${String(result.linksUpdated)} link(s) would be updated across ${String(result.filesWithUpdatedLinks.length)} file(s)`
    );
  } else {
    console.log(`✅ Renamed ${result.sourcePath} → ${result.targetPath}`);

    if (result.linksUpdated > 0) {
      console.log(
        `📝 Updated ${String(result.linksUpdated)} link(s) across ${String(result.filesWithUpdatedLinks.length)} file(s)`
      );
      if (operationOptions.verbose) {
        console.log('\nFiles with updated links:');
        for (const file of result.filesWithUpdatedLinks) {
          console.log(`  ~ ${file}`);
        }
      }
    } else {
      console.log('📝 No links needed updating');
    }
  }

  // Surface parse failures: a file that could not be parsed had its links left untouched, so the operation cannot guarantee link integrity even though the rename itself succeeded
  if (result.parseFailures.length > 0) {
    console.log(`\n⚠️  Parse Failures (${String(result.parseFailures.length)}):`);
    console.log('  Links in these files were NOT checked or rewritten:');
    for (const failure of result.parseFailures) {
      console.log(`  ${failure.file}: ${failure.error}`);
    }
    process.exitCode = 1;
  }

  if (result.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    for (const warning of result.warnings) {
      console.log(`  ${warning}`);
    }
  }
}
