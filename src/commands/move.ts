import { existsSync, statSync } from "node:fs";
import { readFile, readdir, rmdir } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { text } from "node:stream/consumers";
import { glob } from "glob";
import { FileOperations } from "../core/file-operations.js";
import type {
  MoveOperationOptions,
  OperationResult,
} from "../types/operations.js";
import { PathUtils } from "../utils/path-utils.js";

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
  /** Treat wikilinks as Obsidian vault links resolved by note basename */
  obsidian?: boolean;
  /** Treat the positional arguments as alternating source/destination pairs moved in one operation */
  pairs?: boolean;
  /** Read source/destination pairs from this file, one tab-separated pair per line ('-' reads stdin) */
  pairsFile?: string;
}

/**
 * A single source/destination relocation within a multi-pair move.
 *
 * Both paths are literal paths: pair mode performs no glob expansion and moves no directories as units, so the caller's shell does any matching up front.
 *
 * @category Commands
 */
export interface MovePair {
  /** Literal path of the file to move */
  source: string;
  /** Destination path; a directory destination receives the source's basename */
  destination: string;
}

/**
 * Parse the pairs input format read by --pairs-file.
 *
 * Each non-blank line is one pair: a source path, the first tab character on the line, and a destination path. The tab is the separator precisely because paths may contain spaces, so splitting at the first tab keeps the remainder of the line intact for the destination. Fields are trimmed, so padded input and CRLF line endings parse identically to plain input. A non-blank line without a tab is malformed and throws naming its 1-based line number.
 *
 * @example
 * ```typescript
 * parsePairsInput('acme/acme.md\tacme/README.md\n');
 * // => [{ source: 'acme/acme.md', destination: 'acme/README.md' }]
 * ```;
 *
 * @param input - Raw pairs input text
 *
 * @returns Pairs in input order
 *
 * @throws Error naming the offending 1-based line number when a non-blank line has no tab
 *
 * @internal
 */
export function parsePairsInput(input: string): MovePair[] {
  const pairs: MovePair[] = [];
  for (const [index, line] of input.split("\n").entries()) {
    // Trimming the whole line strips CR from CRLF endings and skips whitespace-only lines; a tab still in the trimmed line always sits between two non-empty fields, because trim removes leading and trailing tabs too
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const separator = trimmed.indexOf("\t");
    if (separator === -1) {
      throw new Error(
        `pairs file line ${String(index + 1)} must contain a source and destination separated by a tab`,
      );
    }
    pairs.push({
      source: trimmed.slice(0, separator).trim(),
      destination: trimmed.slice(separator + 1).trim(),
    });
  }
  return pairs;
}

/**
 * Read the raw pairs input for --pairs-file: the named file, or piped stdin when the path is "-".
 *
 * The stdin property is read at call time, and a TTY stdin is refused rather than read, since reading an interactive terminal would hang waiting for input that never arrives.
 *
 * @param pairsFile - Pairs file path, or "-" for stdin
 *
 * @returns Promise resolving to the raw input text
 *
 * @internal
 */
async function readPairsInput(pairsFile: string): Promise<string> {
  if (pairsFile !== "-") {
    return readFile(pairsFile, "utf-8");
  }
  if (process.stdin.isTTY) {
    throw new Error("--pairs-file - expects piped input");
  }
  return text(process.stdin);
}

/**
 * Read and parse the --pairs-file input, failing loudly on read or format errors.
 *
 * @param pairsFile - Pairs file path, or "-" for stdin
 *
 * @returns Promise resolving to the parsed pairs
 *
 * @internal
 */
async function loadPairsFile(pairsFile: string): Promise<MovePair[]> {
  try {
    return parsePairsInput(await readPairsInput(pairsFile));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Error: ${message}`);
    console.error(
      "Usage: markmv move --pairs-file <path> ('-' reads pairs from stdin)",
    );
    console.error(
      "Format: one pair per line, source and destination separated by a tab",
    );
    process.exit(1);
  }
}

/**
 * Group a flat alternating argument list into source/destination pairs.
 *
 * @param args - Even-length list alternating source and destination
 *
 * @returns Pairs in argument order
 *
 * @internal
 */
function pairUpArguments(args: string[]): MovePair[] {
  const pairs: MovePair[] = [];
  for (let index = 0; index < args.length; index += 2) {
    pairs.push({ source: args[index], destination: args[index + 1] });
  }
  return pairs;
}

/**
 * Resolve every pair source to an absolute path and validate it: each source must be an existing file, and each may appear in only one pair. Globs and directory-as-unit sources are classic-mode concepts, so a source that fails these checks means pair mode was handed the wrong shape of input; every offender is collected and listed rather than stopping at the first.
 *
 * @param pairs - Pairs whose sources to resolve and validate
 *
 * @returns Pairs with sources resolved, destinations unchanged
 *
 * @internal
 */
function resolvePairSources(pairs: MovePair[]): MovePair[] {
  const resolved = pairs.map((pair) => ({
    source: resolve(pair.source),
    destination: pair.destination,
  }));

  const notFiles: string[] = [];
  for (const pair of resolved) {
    if (!existsSync(pair.source) || statSync(pair.source).isDirectory()) {
      notFiles.push(pair.source);
    }
  }
  if (notFiles.length > 0) {
    console.error("❌ Error: pair sources must be existing files:");
    for (const source of notFiles) {
      console.error(`   ${source}`);
    }
    process.exit(1);
  }

  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const pair of resolved) {
    if (seen.has(pair.source) && !duplicates.includes(pair.source)) {
      duplicates.push(pair.source);
    }
    seen.add(pair.source);
  }
  if (duplicates.length > 0) {
    console.error(
      "❌ Error: each source may appear in only one pair; duplicated sources:",
    );
    for (const source of duplicates) {
      console.error(`   ${source}`);
    }
    process.exit(1);
  }

  return resolved;
}

/**
 * Execute a batch of source/destination pairs as one moveFiles operation.
 *
 * Each pair is an independent rename, but all of them share a single transaction and one dependency-graph pass, so links between co-moved files are rewritten to their new sibling locations alongside the inbound links from bystander files.
 *
 * @param pairs - Pairs to move; must contain at least one pair
 * @param options - Configuration options for the move operation
 *
 * @throws Will exit the process with code 1 if the operation fails
 *
 * @internal
 */
async function executePairMoves(
  pairs: MovePair[],
  options: MoveOptions,
): Promise<void> {
  const moves = resolvePairSources(pairs);

  try {
    if (options.verbose) {
      console.log(
        `🔀 Moving ${String(moves.length)} pair(s) in one operation:`,
      );
      for (const move of moves) {
        console.log(`   • ${move.source} → ${move.destination}`);
      }

      if (options.dryRun) {
        console.log("🔍 Dry run mode - no changes will be made");
      }
    }

    const fileOps = new FileOperations();
    const moveOptions = toMoveOperationOptions(options);

    // Destinations stay as given: moveFiles applies PathUtils.resolveDestination, which joins the source basename for existing-directory and trailing-slash destinations
    const result = await fileOps.moveFiles(moves, moveOptions);
    await reportMoveResult(result, options, fileOps);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Unexpected error: ${message}`);
    process.exit(1);
  }
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
async function expandSourcePatterns(
  patterns: string[],
  verbose = false,
): Promise<string[]> {
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
      // Glob patterns use forward slashes on every platform; backslashes are pattern escapes
      const globResults = await glob(pattern.replace(/\\/g, "/"), {
        ignore: ["node_modules/**", ".git/**", "dist/**"],
        absolute: true,
        nodir: true, // Only return files, not directories
      });

      if (verbose && globResults.length > 0) {
        console.log(
          `   📁 Found ${String(globResults.length)} file(s) matching pattern`,
        );
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
      const message = error instanceof Error ? error.message : String(error);
      console.error(`   ❌ Error expanding pattern "${pattern}": ${message}`);
    }
  }

  return Array.from(allFiles).sort();
}

/** Directory names never moved as part of a directory source expansion */
const IGNORED_DIRECTORY_NAMES = new Set(["node_modules", ".git", "dist"]);

/**
 * Collect every file inside a directory tree, recursively, mirroring the ignores that glob
 * expansion applies so a directory source and a glob source treat the same tree consistently.
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
 * Remove the directories a unit move vacated, deepest first. A directory that still contains
 * anything is left untouched, so a partial expansion or files the operator left behind keep their
 * parent directories alive.
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
 * Map the command's move options onto the operation options both modes hand to FileOperations, so the pair and classic paths cannot drift apart.
 *
 * @param options - Move options from the command layer
 *
 * @returns Operation options for FileOperations
 *
 * @internal
 */
function toMoveOperationOptions(options: MoveOptions): MoveOperationOptions {
  return {
    dryRun: options.dryRun ?? false,
    verbose: options.verbose ?? false,
    createDirectories: true,
    obsidian: options.obsidian ?? false,
  };
}

/**
 * Report a completed (or failed) move operation: failure errors, the dry-run preview, the success summary, parse failures, warnings, and the verbose post-move link validation. Shared by the classic and pair modes so both report identically.
 *
 * @param result - The operation result to report
 * @param options - Move options controlling dry-run and verbose reporting
 * @param fileOps - FileOperations instance used for the verbose post-move validation
 *
 * @internal
 */
async function reportMoveResult(
  result: OperationResult,
  options: MoveOptions,
  fileOps: FileOperations,
): Promise<void> {
  if (!result.success) {
    console.error("❌ Move operation failed:");
    for (const error of result.errors) {
      console.error(`  ${error}`);
    }
    process.exit(1);
  }

  // Display results. Link updates can land in bystander files and in the moved files themselves, so counts derive from the recorded changes rather than the bystander-only modifiedFiles list.
  const linkChanges = result.changes.filter(
    (change) => change.type === "link-updated",
  );
  const changedFilePaths = Array.from(
    new Set(linkChanges.map((change) => change.filePath)),
  );

  if (options.dryRun) {
    console.log("\n📋 Changes that would be made:");

    if (result.createdFiles.length > 0) {
      console.log("\n✅ Files that would be created:");
      for (const file of result.createdFiles) {
        console.log(`  + ${file}`);
      }
    }

    if (result.deletedFiles.length > 0) {
      console.log("\n🗑️  Files that would be deleted:");
      for (const file of result.deletedFiles) {
        console.log(`  - ${file}`);
      }
    }

    if (changedFilePaths.length > 0) {
      console.log("\n📝 Files whose links would be updated:");
      for (const file of changedFilePaths) {
        console.log(`  ~ ${file}`);
      }
    }

    if (linkChanges.length > 0) {
      console.log("\n🔗 Link rewrites:");
      for (const change of linkChanges) {
        console.log(
          `  ${change.filePath}:${String(change.line)} ${String(change.oldValue)} → ${String(change.newValue)}`,
        );
      }
    }

    console.log(
      `\n📊 Summary: ${String(linkChanges.length)} link(s) would be updated across ${String(changedFilePaths.length)} file(s)`,
    );
  } else {
    console.log("✅ Move operation completed successfully!");

    if (linkChanges.length > 0) {
      console.log(
        `📝 Updated ${String(linkChanges.length)} link(s) across ${String(changedFilePaths.length)} file(s)`,
      );
    } else {
      console.log("📝 No links needed updating");
    }

    if (options.verbose && changedFilePaths.length > 0) {
      console.log("\nFiles with updated links:");
      for (const file of changedFilePaths) {
        console.log(`  ~ ${file}`);
      }
    }
  }

  // Surface parse failures: a file that could not be parsed had its links left untouched, so the operation cannot guarantee link integrity even though the move itself succeeded
  if (result.parseFailures && result.parseFailures.length > 0) {
    console.log(
      `\n⚠️  Parse Failures (${String(result.parseFailures.length)}):`,
    );
    console.log("  Links in these files were NOT checked or rewritten:");
    for (const failure of result.parseFailures) {
      console.log(`  ${failure.file}: ${failure.error}`);
    }
    process.exitCode = 1;
  }

  // Display warnings
  if (result.warnings.length > 0) {
    console.log("\n⚠️  Warnings:");
    for (const warning of result.warnings) {
      console.log(`  ${warning}`);
    }
  }

  // Validate the operation
  if (!options.dryRun && options.verbose) {
    console.log("\n🔍 Validating link integrity...");
    const validation = await fileOps.validateOperation(result);

    if (validation.valid) {
      console.log("✅ All links are valid");
    } else {
      console.log(
        `⚠️  Found ${String(validation.brokenLinks)} broken link(s):`,
      );
      for (const error of validation.errors) {
        console.log(`  ${error}`);
      }
    }
  }
}

/** Usage line for the --pairs form of the move command */
const PAIRS_USAGE =
  "Usage: markmv move --pairs <source> <destination> [<source> <destination> ...]";

/** Usage line for the --pairs-file form of the move command */
const PAIRS_FILE_USAGE = "Usage: markmv move --pairs-file <path>";

/**
 * Report a pair-mode usage error and exit: the error line, the given usage lines, and an Examples block, mirroring the classic path's error output.
 *
 * @param error - One-line description of the rejected input
 * @param usageLines - Usage lines naming the valid invocation forms
 * @param examples - Example invocations, printed indented under an Examples header
 *
 * @internal
 */
function failPairUsage(
  error: string,
  usageLines: string[],
  examples: string[],
): never {
  console.error(`❌ Error: ${error}`);
  for (const line of usageLines) {
    console.error(line);
  }
  console.error("Examples:");
  for (const example of examples) {
    console.error(`  ${example}`);
  }
  process.exit(1);
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
 * - Multi-pair moves via --pairs (alternating source/destination arguments) or --pairs-file
 *   (tab-separated pairs from a file or stdin), each batch executed as one operation
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
 * @example
 *   Multi-pair move, renaming two folder-named indexes in one operation ```typescript await moveCommand(['acme/acme.md', 'acme/README.md', 'globex/globex.md', 'globex/README.md'], { pairs: true }); ```
 *
 * @param sources - Classic mode: source patterns with the destination last. Pair mode (--pairs): an alternating source/destination list. Unused with --pairs-file.
 * @param options - Configuration options for the move operation
 *
 * @throws Will exit the process with code 1 if the operation fails
 */
export async function moveCommand(
  sources: string[],
  options: MoveOptions,
): Promise<void> {
  if (options.pairs === true && options.pairsFile !== undefined) {
    failPairUsage(
      "--pairs and --pairs-file are mutually exclusive",
      [PAIRS_USAGE, PAIRS_FILE_USAGE],
      [
        "markmv move --pairs acme/acme.md acme/README.md",
        "markmv move --pairs-file pairs.txt --dry-run",
      ],
    );
  }

  if (options.pairsFile !== undefined) {
    if (sources.length > 0) {
      failPairUsage(
        "--pairs-file reads pairs from a file, so positional arguments are not allowed",
        [PAIRS_FILE_USAGE],
        [
          "markmv move --pairs-file pairs.txt --dry-run",
          "find ... | markmv move --pairs-file - --dry-run",
        ],
      );
    }
    const pairs = await loadPairsFile(options.pairsFile);
    // An empty input would otherwise succeed as a silent no-op, and a sweep that moved nothing is a mistake worth surfacing
    if (pairs.length === 0) {
      console.error(
        `❌ Error: no source and destination pairs found in ${options.pairsFile}`,
      );
      process.exit(1);
    }
    await executePairMoves(pairs, options);
    return;
  }

  if (options.pairs === true) {
    if (sources.length === 0) {
      failPairUsage(
        "--pairs requires at least one source and destination pair (an even number of arguments)",
        [PAIRS_USAGE],
        ["markmv move --pairs acme/acme.md acme/README.md"],
      );
    }
    if (sources.length % 2 === 1) {
      failPairUsage(
        `--pairs expects an even number of arguments (alternating source and destination), got ${String(sources.length)}`,
        [PAIRS_USAGE],
        [
          "markmv move --pairs acme/acme.md acme/README.md globex/globex.md globex/README.md",
        ],
      );
    }
    await executePairMoves(pairUpArguments(sources), options);
    return;
  }

  if (sources.length < 2) {
    console.error(
      "❌ Error: At least 2 arguments required (source(s) and destination)",
    );
    console.error("Usage: markmv move <sources...> <destination>");
    console.error("Examples:");
    console.error("  markmv move file.md ./target/");
    console.error("  markmv move file1.md file2.md ./target/");
    console.error("  markmv move directory ./target/");
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
    const sourceFiles = await expandSourcePatterns(
      nonDirectoryPatterns,
      options.verbose,
    );

    if (sourceFiles.length === 0 && directorySources.length === 0) {
      console.error("❌ No files found matching the specified patterns");
      process.exit(1);
    }

    // Validate destination
    const resolvedDestination = resolve(destination);
    const isDestDirectory =
      PathUtils.isDirectory(resolvedDestination) ||
      PathUtils.looksLikeDirectory(destination) ||
      directorySources.length > 0;

    if (sourceFiles.length > 1 && !isDestDirectory) {
      console.error(
        "❌ Error: When moving multiple files, destination must be a directory",
      );
      console.error(`   Destination: ${destination}`);
      console.error(`   Found ${String(sourceFiles.length)} source files`);
      process.exit(1);
    }

    // Expand directory sources into per-file moves that map each file to its mirrored path under the destination
    const directoryMoves: MovePair[] = [];
    for (const directorySource of directorySources) {
      const filesInDirectory = await collectDirectoryFiles(directorySource);
      if (options.verbose) {
        console.log(
          `📁 Directory source ${directorySource}: ${String(filesInDirectory.length)} file(s)`,
        );
      }
      for (const file of filesInDirectory) {
        directoryMoves.push({
          source: file,
          destination: join(
            resolvedDestination,
            relative(directorySource, file),
          ),
        });
      }
    }

    const totalSourceFiles = sourceFiles.length + directoryMoves.length;

    if (options.verbose) {
      console.log(
        `🎯 Destination: ${destination} ${isDestDirectory ? "(directory)" : "(file)"}`,
      );
      console.log(`📁 Found ${String(totalSourceFiles)} source file(s):`);
      for (const file of sourceFiles) {
        console.log(`   • ${file}`);
      }
      for (const move of directoryMoves) {
        console.log(`   • ${move.source}`);
      }

      if (options.dryRun) {
        console.log("🔍 Dry run mode - no changes will be made");
      }
    }

    const fileOps = new FileOperations();
    const moveOptions = toMoveOperationOptions(options);

    let result: OperationResult;

    if (directoryMoves.length === 0 && sourceFiles.length === 1) {
      // Single file move
      result = await fileOps.moveFile(sourceFiles[0], destination, moveOptions);
    } else {
      // Batch move: directory-expanded files carry explicit mirrored destinations; plain sources either rename to the destination path or join it when the destination is a directory
      const moves: MovePair[] = [
        ...directoryMoves,
        ...sourceFiles.map((source) => ({
          source,
          destination: isDestDirectory
            ? join(resolvedDestination, basename(source))
            : destination,
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

    await reportMoveResult(result, options, fileOps);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Unexpected error: ${message}`);
    process.exit(1);
  }
}
