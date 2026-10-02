import { existsSync } from "node:fs";
import { dirname, sep } from "node:path";
import type { ParsedMarkdownFile } from "../types/links.js";
import type {
  MoveOperationOptions,
  OperationChange,
  OperationResult,
} from "../types/operations.js";
import { FileUtils } from "../utils/file-utils.js";
import { PathUtils } from "../utils/path-utils.js";
import { TransactionManager } from "../utils/transaction-manager.js";
import { DependencyGraph } from "./dependency-graph.js";
import { LinkParser } from "./link-parser.js";
import type { LinkRefactorResult } from "./link-refactorer.js";
import { LinkRefactorer } from "./link-refactorer.js";
import { LinkValidator } from "./link-validator.js";
import {
  computeNoteStemCounts,
  findDuplicateNoteStems,
  resolveWikilinks,
} from "./obsidian-vault.js";

/** Format an unknown caught value as a human-readable error message. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Whether an optional string holds any text; an empty string is treated like an absent one. */
function isNonEmpty(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

/** Print the changes a dry run would make, with before and after values where both are known. */
function logPlannedChanges(changes: readonly OperationChange[]): void {
  console.log("Dry run - changes that would be made:");
  for (const change of changes) {
    console.log(`  ${change.type}: ${change.filePath}`);
    if (isNonEmpty(change.oldValue) && isNonEmpty(change.newValue)) {
      console.log(`    ${change.oldValue} → ${change.newValue}`);
    }
  }
}

/** Mutable planning state shared by every step of a batch move's content-rewrite pass. */
interface BatchPlan {
  /** Current content of every parsed file, updated as earlier moves in the batch plan rewrites so later moves build on them. */
  readonly fileContents: Map<string, string>;
  /** Transaction collecting the planned writes. */
  readonly transaction: TransactionManager;
  /** When set, nothing is staged on the transaction. */
  readonly dryRun: boolean;
  /** Files whose content a rewrite changed. */
  readonly modifiedFiles: Set<string>;
  /** Every individual link change planned. */
  readonly allChanges: OperationChange[];
  /** Non-fatal problems reported by the refactorer. */
  readonly warnings: string[];
}

/** A dependent file and the move that affects it. */
interface BatchDependentTarget {
  /** Key of the dependent file in the dependency graph. */
  readonly dependentFilePath: string;
  /** The parsed dependent file. */
  readonly dependentFile: ParsedMarkdownFile;
  /** Source path of the move being planned. */
  readonly source: string;
  /** Destination path of the move being planned. */
  readonly destination: string;
}

/** A moved file whose own links are rewritten against the whole batch. */
interface BatchSelfTarget {
  /** The parsed moved file. */
  readonly sourceFile: ParsedMarkdownFile;
  /** Source path of the moved file. */
  readonly source: string;
  /** Destination path of the moved file. */
  readonly destination: string;
  /** Final location of every file the batch moves, keyed by resolved source path. */
  readonly movedPathMap: Map<string, string>;
}

/** The result of refactoring one dependent file, or the failure that prevented it. */
type DependentRefactorOutcome =
  | {
      readonly dependentFilePath: string;
      readonly refactorResult: LinkRefactorResult;
      readonly failure?: never;
    }
  | {
      readonly dependentFilePath: string;
      readonly failure: string;
      readonly refactorResult?: never;
    };

/**
 * Order a batch of relocations so that a move whose destination is another relocation's source runs after that source has vacated it, making the batch's outcome independent of argument order. The order also governs the per-move link rewriting, which must see each move's source path free of any earlier move's output: a link rewritten to a vacated path would be rewritten again by the move that later claims that path.
 *
 * Relocations that cannot be ordered form rename cycles (a swap or rotation, where every remaining move's destination is freed only by another cyclic move). These are returned separately for rejection: no execution order completes them, and per-move link rewriting cannot express a permutation of paths.
 * @param moves - Relocations to order; sources and destinations must already be resolved and unique
 * @returns The relocations in execution order, plus any that form cycles and could not be ordered
 */
function orderRelocations(
  moves: readonly { source: string; destination: string }[],
): {
  ordered: { source: string; destination: string }[];
  cyclic: { source: string; destination: string }[];
} {
  // Sources and destinations are unique by contract, so each path is vacated by at most one relocation and claimed by at most one: blocking is a plain set membership, not a count
  const departingPaths = new Set(moves.map((move) => move.source));
  // Relocations waiting on each departing path, keyed by the path they will claim once it is vacated
  const waitersByPath = new Map<
    string,
    { source: string; destination: string }[]
  >();
  for (const move of moves) {
    if (!departingPaths.has(move.destination)) continue;
    const waiters = waitersByPath.get(move.destination);
    if (waiters === undefined) {
      waitersByPath.set(move.destination, [move]);
    } else {
      waiters.push(move);
    }
  }
  const blocked = new Set(
    moves.filter((move) => departingPaths.has(move.destination)),
  );
  const queue = moves.filter((move) => !blocked.has(move));
  const ordered: { source: string; destination: string }[] = [];
  // for-of walks the queue as it grows: iteration reads the array live, so relocations unblocked by earlier entries join the tail and are still visited
  for (const move of queue) {
    ordered.push(move);
    for (const waiter of waitersByPath.get(move.source) ?? []) {
      // A waiter's unique destination pins it to exactly one blocker, so the first vacate frees it and later visits find nothing to delete
      if (blocked.delete(waiter)) {
        queue.push(waiter);
      }
    }
  }

  return {
    ordered,
    cyclic: [...blocked],
  };
}

/**
 * Collapse a parsed file list to one entry per path.
 *
 * Move operations parse the moved sources directly and again during project discovery, so the
 * combined list carries duplicates; vault-wide wikilink analysis (stem counts, duplicate detection)
 * must see each note exactly once or every moved file reports itself as a duplicate.
 */
function uniqueByFilePath(
  files: readonly ParsedMarkdownFile[],
): ParsedMarkdownFile[] {
  return Array.from(
    new Map(files.map((file) => [file.filePath, file])).values(),
  );
}

/**
 * Core class for performing markdown file operations with intelligent link refactoring.
 *
 * This class provides the main functionality for moving, splitting, joining, and merging markdown
 * files while maintaining the integrity of cross-references and links.
 * @category Core
 * @example
 * Basic file move
 * ```typescript
 * const fileOps = new FileOperations();
 * const result = await fileOps.moveFile('old.md', 'new.md');
 *
 * if (result.success) {
 *   console.log(`Successfully moved file and updated ${result.modifiedFiles.length} references`);
 * } else {
 *   console.error('Move failed:', result.errors);
 * }
 * ```
 * @example
 * Dry run with verbose output
 * ```typescript
 * const fileOps = new FileOperations();
 * const result = await fileOps.moveFile('docs/guide.md', 'tutorials/guide.md', {
 *     dryRun: true,
 *     verbose: true
 * });
 *
 * // Preview changes without actually modifying files
 * result.changes.forEach(change => {
 *     console.log(`${change.type}: ${change.filePath} - ${change.description}`);
 * });
 * ```
 */
export class FileOperations {
  private readonly linkParser = new LinkParser();

  private linkRefactorer = new LinkRefactorer();

  private readonly linkValidator = new LinkValidator();

  /**
   * Move a file (markdown, or a non-markdown asset such as an image) and update all links that
   * reference it.
   *
   * This method performs an intelligent move operation that:
   *
   * 1. Validates the source and destination paths
   * 2. Discovers all files that link to the source file
   * 3. Updates all cross-references to maintain link integrity
   * 4. If the source is markdown, also updates any links inside the moved file itself
   * 5. Optionally performs a dry run to preview changes
   *
   * A non-markdown source (an image, for example) is moved as-is; only the markdown files that link
   * to it are updated, since it has no markdown links of its own to refactor.
   * @example
   * ```typescript
   * const fileOps = new FileOperations();
   *
   * // Simple move
   * await fileOps.moveFile('docs/old.md', 'docs/new.md');
   *
   * // Move to directory (filename preserved)
   * await fileOps.moveFile('guide.md', './docs/');
   *
   * // Move a linked image, updating any markdown files that reference it
   * await fileOps.moveFile('image.png', 'assets/image.png');
   *
   * // Dry run with verbose output
   * const result = await fileOps.moveFile('api.md', 'reference/api.md', {
   *   dryRun: true,
   *   verbose: true
   * });
   * ```
   * @param sourcePath - The current path of the file to move
   * @param destinationPath - The target path (can be a directory)
   * @param options - Configuration options for the move operation
   * @returns Promise resolving to detailed operation results
   */
  async moveFile(
    sourcePath: string,
    destinationPath: string,
    options: MoveOperationOptions = {},
  ): Promise<OperationResult> {
    const { dryRun = false, verbose = false } = options;

    try {
      // Resolve destination in case it's a directory
      const resolvedDestination = PathUtils.resolveDestination(
        sourcePath,
        destinationPath,
      );

      // Validate inputs
      const validation = this.validateMoveOperation(
        sourcePath,
        resolvedDestination,
      );
      if (!validation.valid) {
        return {
          success: false,
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
          errors: [validation.error ?? "Validation failed"],
          warnings: [],
          changes: [],
        };
      }

      // A move never overwrites, so an occupied destination is rejected here — naming the colliding path itself — rather than mid-transaction after retries. Checking before the planning work also makes a dry run report the collision instead of previewing a move that cannot succeed. (On a case-insensitive filesystem this also rejects a case-only rename, whose destination always appears to exist.)
      if (existsSync(resolvedDestination)) {
        return {
          success: false,
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
          errors: [`Destination file already exists: ${resolvedDestination}`],
          warnings: [],
          changes: [],
        };
      }

      // Parse the source file (only meaningful for markdown, which may itself contain links to update) and build a dependency graph from the surrounding project's markdown files.
      const sourceIsMarkdown = PathUtils.isMarkdownFile(sourcePath);
      const sourceFile = sourceIsMarkdown
        ? await this.linkParser.parseFile(sourcePath)
        : null;
      const {
        files: projectFiles,
        parseFailures,
        vaultRoot,
      } = await this.discoverProjectFiles([sourcePath, resolvedDestination]);
      const allParsedFiles = uniqueByFilePath(
        sourceFile ? [...projectFiles, sourceFile] : projectFiles,
      );
      const obsidianWarnings = this.prepareObsidianMode(
        allParsedFiles,
        vaultRoot,
        options,
      );
      const dependencyGraph = new DependencyGraph(allParsedFiles);

      // Find all files that link to the source file. The moved file itself is excluded: a link to its own old path is the self pass's job, and scheduling it here would write content to the vacated source path after the move, resurrecting the old file
      const dependentFiles = dependencyGraph
        .getDependents(sourcePath)
        .filter((dependent) => dependent !== sourcePath);

      if (verbose) {
        console.log(
          `Found ${String(dependentFiles.length)} files that reference ${sourcePath}`,
        );
      }

      // Prepare transaction
      const transaction = new TransactionManager({
        createBackups: !dryRun,
        continueOnError: false,
      });

      const changes: OperationChange[] = [];
      const modifiedFiles: string[] = [];
      const warnings: string[] = [...obsidianWarnings];

      // Plan file move
      if (!dryRun) {
        transaction.addFileMove(
          sourcePath,
          resolvedDestination,
          `Move ${sourcePath} to ${resolvedDestination}`,
        );
      }

      // Plan link updates in all dependent files. Each file is refactored independently, so the work runs concurrently; the results are applied in dependent order so changes and warnings keep a stable order.
      const dependentOutcomes = await Promise.all(
        dependentFiles.map(
          async (
            dependentFilePath,
          ): Promise<DependentRefactorOutcome | undefined> => {
            const dependentFile =
              dependencyGraph.getNode(dependentFilePath)?.data;
            if (!dependentFile) return undefined;

            try {
              const refactorResult: LinkRefactorResult =
                await this.linkRefactorer.refactorLinksForFileMove(
                  dependentFile,
                  sourcePath,
                  resolvedDestination,
                );

              return { dependentFilePath, refactorResult };
            } catch (error) {
              return { dependentFilePath, failure: errorMessage(error) };
            }
          },
        ),
      );

      for (const outcome of dependentOutcomes) {
        if (outcome === undefined) continue;
        if (outcome.failure !== undefined) {
          warnings.push(
            `Failed to process ${outcome.dependentFilePath}: ${outcome.failure}`,
          );
          continue;
        }

        const { dependentFilePath, refactorResult } = outcome;
        if (refactorResult.changes.length > 0) {
          modifiedFiles.push(dependentFilePath);
          changes.push(...refactorResult.changes);

          if (!dryRun) {
            transaction.addContentUpdate(
              dependentFilePath,
              refactorResult.updatedContent,
              `Update links in ${dependentFilePath}`,
            );
          }
        }

        if (refactorResult.errors.length > 0) {
          warnings.push(...refactorResult.errors);
        }
      }

      // Update links within the moved file itself (a non-markdown asset has no internal links to refactor and is moved as raw bytes, so this step only applies to markdown sources).
      if (sourceFile) {
        try {
          /* The file's own relocation is in the map so self-links point at the destination
             rather than the vacated path */
          const selfRefactorResult =
            await this.linkRefactorer.refactorLinksForCurrentFileMove(
              sourceFile,
              resolvedDestination,
              new Map([
                [PathUtils.resolvePath(sourcePath), resolvedDestination],
              ]),
            );

          changes.push(...selfRefactorResult.changes);
          if (!dryRun && selfRefactorResult.changes.length > 0) {
            transaction.addContentUpdate(
              resolvedDestination,
              selfRefactorResult.updatedContent,
              "Update internal links in moved file",
            );
          }

          warnings.push(...selfRefactorResult.errors);
        } catch (error) {
          warnings.push(
            `Failed to update links in source file: ${errorMessage(error)}`,
          );
        }
      }

      // Execute transaction or return dry-run results
      if (dryRun) {
        if (verbose) {
          logPlannedChanges(changes);
        }

        return {
          success: true,
          modifiedFiles,
          createdFiles:
            resolvedDestination !== sourcePath ? [resolvedDestination] : [],
          deletedFiles: resolvedDestination !== sourcePath ? [sourcePath] : [],
          errors: [],
          warnings,
          changes,
          parseFailures,
        };
      }

      // Execute the transaction
      const executionResult = await transaction.execute();

      if (!executionResult.success) {
        return {
          success: false,
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
          errors: executionResult.errors,
          warnings,
          changes: [],
        };
      }

      return {
        success: true,
        modifiedFiles,
        createdFiles: [resolvedDestination],
        deletedFiles: [sourcePath],
        errors: [],
        warnings,
        changes,
        parseFailures,
      };
    } catch (error) {
      return {
        success: false,
        modifiedFiles: [],
        createdFiles: [],
        deletedFiles: [],
        errors: [`Move operation failed: ${errorMessage(error)}`],
        warnings: [],
        changes: [],
      };
    }
  }

  /** Move multiple files in a single operation */
  async moveFiles(
    moves: readonly { source: string; destination: string }[],
    options: MoveOperationOptions = {},
  ): Promise<OperationResult> {
    const { dryRun = false } = options;

    try {
      // Handle empty moves array
      if (moves.length === 0) {
        return {
          success: true,
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
          errors: [],
          warnings: [],
          changes: [],
        };
      }

      // Resolve both sides of every move first: sources to absolute paths and destinations through the directory-aware resolution, so every later comparison in the batch (collision validation, execution ordering, content bookkeeping) sees like forms regardless of how the caller spelled the paths
      const resolvedMoves = moves.map(({ source, destination }) => ({
        source: PathUtils.resolvePath(source),
        destination: PathUtils.resolveDestination(source, destination),
      }));

      for (const { source, destination } of resolvedMoves) {
        const validation = this.validateMoveOperation(source, destination);
        if (!validation.valid) {
          return {
            success: false,
            modifiedFiles: [],
            createdFiles: [],
            deletedFiles: [],
            errors: [
              `Invalid move ${source} → ${destination}: ${String(validation.error)}`,
            ],
            warnings: [],
            changes: [],
          };
        }
      }

      // Validate the batch's sources and destinations as a whole before anything moves, so both dry runs and real runs reject identically. A file relocates at most once, two relocations cannot land at the same path, and a destination already holding a file the batch does not itself vacate would be an overwrite, which move operations never perform. A destination occupied by another relocation's source is exempt: the execution order moves that source first.
      const destinationsBySource = new Map<string, string[]>();
      const sourcesByDestination = new Map<string, string[]>();
      for (const { source, destination } of resolvedMoves) {
        const destinations = destinationsBySource.get(source);
        if (destinations === undefined) {
          destinationsBySource.set(source, [destination]);
        } else {
          destinations.push(destination);
        }
        const sources = sourcesByDestination.get(destination);
        if (sources === undefined) {
          sourcesByDestination.set(destination, [source]);
        } else {
          sources.push(source);
        }
      }
      const batchSources = new Set(resolvedMoves.map((move) => move.source));
      const batchErrors: string[] = [];
      for (const [source, destinations] of destinationsBySource) {
        if (destinations.length > 1) {
          batchErrors.push(
            `Multiple moves depart the same source: ${source} (to ${destinations.join(", ")})`,
          );
        }
      }
      for (const [destination, sources] of sourcesByDestination) {
        if (sources.length > 1) {
          batchErrors.push(
            `Multiple moves target the same destination: ${destination} (from ${sources.join(", ")})`,
          );
          continue;
        }
        if (existsSync(destination) && !batchSources.has(destination)) {
          batchErrors.push(
            `Destination file already exists: ${destination} (while moving ${sources[0]})`,
          );
        }
      }
      if (batchErrors.length > 0) {
        return {
          success: false,
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
          errors: batchErrors,
          warnings: [],
          changes: [],
        };
      }

      // Order the moves so chained renames (a→b while b→c) vacate their destinations before the moves that claim them, whatever order the caller listed them in; a rename cycle (a swap or rotation) has no such order and is rejected here rather than failing mid-transaction
      const { ordered: orderedMoves, cyclic } = orderRelocations(resolvedMoves);
      if (cyclic.length > 0) {
        return {
          success: false,
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
          errors: [
            "These moves form a rename cycle, so no execution order can free every destination:",
            ...cyclic.map((move) => `  ${move.source} → ${move.destination}`),
          ],
          warnings: [],
          changes: [],
        };
      }

      // Parse markdown sources and build a comprehensive dependency graph. Non-markdown assets (e.g. images) have no links of their own to parse or refactor, so they are moved as raw bytes and never added to the dependency graph as nodes; they can still be discovered as dependencies of the markdown files that link to them.
      const allFiles: ParsedMarkdownFile[] = [];
      // Store original file contents
      const fileContents = new Map<string, string>();

      const markdownSources = resolvedMoves
        .map(({ source }) => source)
        .filter((source) => PathUtils.isMarkdownFile(source));
      const parsedSources = await Promise.all(
        markdownSources.map(async (source) => ({
          source,
          sourceFile: await this.linkParser.parseFile(source),
          // The original content, stored before any moves
          content: await FileUtils.readTextFile(source),
        })),
      );
      for (const { source, sourceFile, content } of parsedSources) {
        allFiles.push(sourceFile);
        fileContents.set(source, content);
      }

      // Discover additional project files across the full span of the batch: every source and every destination seeds the scan so bystanders between them are found
      const {
        files: projectFiles,
        parseFailures,
        vaultRoot,
      } = await this.discoverProjectFiles([
        ...resolvedMoves.map((move) => move.source),
        ...resolvedMoves.map((move) => move.destination),
        ...(options.discoverySeeds ?? []),
      ]);
      const allParsedFiles = uniqueByFilePath([...allFiles, ...projectFiles]);
      const obsidianWarnings = this.prepareObsidianMode(
        allParsedFiles,
        vaultRoot,
        options,
      );
      const dependencyGraph = new DependencyGraph(allParsedFiles);

      // Store content for every parsed file, not just the moved sources. Bystander files that link to several moved files are refactored once per move, and the transaction has not executed yet: re-reading a bystander from disk on a later move would see the original bytes and silently discard the link updates planned by earlier moves in the same batch.
      const sourceFilePaths = new Set(
        resolvedMoves
          .filter(({ source }) => PathUtils.isMarkdownFile(source))
          .map((m) => m.source),
      );
      const unreadPaths = [
        ...sourceFilePaths,
        ...projectFiles.map((f) => f.filePath),
      ].filter((filePath) => !fileContents.has(filePath));
      const unreadContents = await Promise.all(
        unreadPaths.map(async (filePath) =>
          (await FileUtils.exists(filePath))
            ? { filePath, content: await FileUtils.readTextFile(filePath) }
            : undefined,
        ),
      );
      for (const entry of unreadContents) {
        if (entry !== undefined && !fileContents.has(entry.filePath)) {
          fileContents.set(entry.filePath, entry.content);
        }
      }

      const transaction = new TransactionManager({
        createBackups: !dryRun,
        continueOnError: false,
      });

      const allChanges: OperationChange[] = [];
      const modifiedFiles = new Set<string>();
      const warnings: string[] = [...obsidianWarnings];

      // First pass: add the file moves to the transaction in vacate-first order. The dependency graph is left keyed on pre-move paths throughout: it is an index of the original link structure, and every second-pass lookup names files by where they were when the batch started. (Re-keying it to destinations instead would collide whenever one move's destination is another move's source, silently merging their graph nodes.)
      if (!dryRun) {
        for (const { source, destination } of orderedMoves) {
          transaction.addFileMove(source, destination);
        }
      }

      // Second pass: process content updates for dependent files and moved files, in the same vacate-first order — a bystander link rewritten to a vacated path would be rewritten again by the move that later claims that path. A moved file's own links must be recomputed against the final location of every target: links between co-moved files keep pointing at their new sibling locations, not the vacated ones
      const movedPathMap = new Map(
        resolvedMoves.map((move) => [
          PathUtils.resolvePath(move.source),
          move.destination,
        ]),
      );

      const plan: BatchPlan = {
        fileContents,
        transaction,
        dryRun,
        modifiedFiles,
        allChanges,
        warnings,
      };

      // Sequential by design: each move's rewrites build on the content the earlier moves already planned, so the order is the semantics.
      for (const { source, destination } of orderedMoves) {
        // Find dependent files (files that depend on the source file being moved). A dependent that is itself being moved in this batch is skipped here: its own self pass rewrites its links against every move in the batch through movedPathMap, so handling it here as well would record the same rewrite twice and stage a redundant partial content write
        const dependentFiles = dependencyGraph
          .getDependents(source)
          .filter((dependentPath) => !batchSources.has(dependentPath));

        for (const dependentFilePath of dependentFiles) {
          const dependentFile =
            dependencyGraph.getNode(dependentFilePath)?.data;
          if (!dependentFile) continue;

          await this.planBatchDependentUpdate(plan, {
            dependentFilePath,
            dependentFile,
            source,
            destination,
          });
        }

        // Update the moved file itself
        const sourceFile = allFiles.find((f) => f.filePath === source);
        if (sourceFile) {
          await this.planBatchSelfUpdate(plan, {
            sourceFile,
            source,
            destination,
            movedPathMap,
          });
        }
      }

      // Execute or return dry-run results
      if (dryRun) {
        return {
          success: true,
          modifiedFiles: Array.from(modifiedFiles),
          createdFiles: resolvedMoves.map((m) => m.destination),
          deletedFiles: resolvedMoves.map((m) => m.source),
          errors: [],
          warnings,
          changes: allChanges,
          parseFailures,
        };
      }

      const executionResult = await transaction.execute();

      return {
        success: executionResult.success,
        modifiedFiles: Array.from(modifiedFiles),
        createdFiles: executionResult.success
          ? resolvedMoves.map((m) => m.destination)
          : [],
        deletedFiles: executionResult.success
          ? resolvedMoves.map((m) => m.source)
          : [],
        errors: executionResult.errors,
        warnings,
        changes: allChanges,
        parseFailures,
      };
    } catch (error) {
      return {
        success: false,
        modifiedFiles: [],
        createdFiles: [],
        deletedFiles: [],
        errors: [`Bulk move operation failed: ${errorMessage(error)}`],
        warnings: [],
        changes: [],
      };
    }
  }

  /**
   * Plan the link rewrite one move requires in a dependent file, from the file's stored content when one is held and from disk otherwise, and stage it on the batch transaction.
   * @param plan - The batch's planning state
   * @param target - The dependent file and the move that affects it
   */
  private async planBatchDependentUpdate(
    plan: BatchPlan,
    target: BatchDependentTarget,
  ): Promise<void> {
    const { dependentFilePath, dependentFile, source, destination } = target;
    const storedContent = plan.fileContents.get(dependentFile.filePath);

    const refactorResult = isNonEmpty(storedContent)
      ? this.linkRefactorer.refactorLinksForFileMoveWithContent(
          dependentFile,
          source,
          destination,
          storedContent,
        )
      : await this.linkRefactorer.refactorLinksForFileMove(
          dependentFile,
          source,
          destination,
        );

    if (refactorResult.changes.length > 0) {
      plan.modifiedFiles.add(dependentFilePath);
      plan.allChanges.push(...refactorResult.changes);

      if (!plan.dryRun) {
        plan.transaction.addContentUpdate(
          dependentFilePath,
          refactorResult.updatedContent,
        );
      }

      // Update stored content so subsequent moves in this batch build on it
      plan.fileContents.set(dependentFilePath, refactorResult.updatedContent);
    }

    plan.warnings.push(...refactorResult.errors);
  }

  /**
   * Plan the rewrite of a moved file's own links against the final location of every target in the batch, from its stored original content when one is held and from disk otherwise, and stage it on the batch transaction.
   *
   * The original content is deliberately not published under the destination key: in a chained rename one move's destination is another move's source, and overwriting that source's stored original would make the later self pass refactor the wrong file's content.
   * @param plan - The batch's planning state
   * @param target - The moved file and the batch's path map
   */
  private async planBatchSelfUpdate(
    plan: BatchPlan,
    target: BatchSelfTarget,
  ): Promise<void> {
    const { sourceFile, source, destination, movedPathMap } = target;
    const originalContent = plan.fileContents.get(source);

    const selfRefactorResult = isNonEmpty(originalContent)
      ? this.linkRefactorer.refactorLinksForCurrentFileMoveWithContent(
          sourceFile,
          destination,
          originalContent,
          movedPathMap,
        )
      : await this.linkRefactorer.refactorLinksForCurrentFileMove(
          sourceFile,
          destination,
          movedPathMap,
        );

    if (selfRefactorResult.changes.length > 0) {
      plan.allChanges.push(...selfRefactorResult.changes);

      if (!plan.dryRun) {
        plan.transaction.addContentUpdate(
          destination,
          selfRefactorResult.updatedContent,
        );
      }
    }

    plan.warnings.push(...selfRefactorResult.errors);
  }

  private validateMoveOperation(
    sourcePath: string,
    destinationPath: string,
  ): {
    valid: boolean;
    error?: string;
  } {
    // Validate source path
    const sourceValidation = PathUtils.validatePath(sourcePath);
    if (!sourceValidation.valid) {
      return {
        valid: false,
        error: `Invalid source path: ${String(sourceValidation.reason)}`,
      };
    }

    // Validate destination path
    const destValidation = PathUtils.validatePath(destinationPath);
    if (!destValidation.valid) {
      return {
        valid: false,
        error: `Invalid destination path: ${String(destValidation.reason)}`,
      };
    }

    // The source must exist before any project discovery is attempted. Without this check, a nonexistent path resolves to a directory (its own dirname) that project discovery then scans, which is unbounded when the path has no real parent directory to anchor to (e.g. a nonexistent file directly under the filesystem root).
    if (!existsSync(sourcePath)) {
      return {
        valid: false,
        error: `Source file does not exist: ${sourcePath}`,
      };
    }

    // A markdown file must move to another markdown file (so its own internal links stay meaningful), and a non-markdown asset must move to another non-markdown path (so it isn't silently reinterpreted as markdown). Moving markdown <-> non-markdown is not supported.
    const sourceIsMarkdown = PathUtils.isMarkdownFile(sourcePath);
    const destinationIsMarkdown = PathUtils.isMarkdownFile(destinationPath);

    if (sourceIsMarkdown && !destinationIsMarkdown) {
      return { valid: false, error: "Destination must be a markdown file" };
    }

    if (!sourceIsMarkdown && destinationIsMarkdown) {
      return {
        valid: false,
        error:
          "Destination must not be a markdown file when the source is not a markdown file",
      };
    }

    // Check for same source and destination
    if (
      PathUtils.resolvePath(sourcePath) ===
      PathUtils.resolvePath(destinationPath)
    ) {
      return { valid: false, error: "Source and destination are the same" };
    }

    return { valid: true };
  }

  private async discoverProjectFiles(seedPaths: readonly string[]): Promise<{
    files: ParsedMarkdownFile[];
    parseFailures: {
      file: string;
      error: string;
      stack?: string | undefined;
    }[];
    vaultRoot: string;
  }> {
    try {
      // Bystanders can live anywhere between where the files came from and where they are going, so discovery is rooted at the common base of every seed path. A base at the filesystem root means the seeds span unrelated trees; scanning from there would walk the disk, so fall back to the first seed's own directory.
      let projectRoot = PathUtils.findCommonBase(seedPaths);
      if (projectRoot === sep || /^[A-Za-z]:$/.test(projectRoot)) {
        projectRoot = dirname(seedPaths[0] || "");
      }

      // Find all markdown files in the project
      const markdownFiles = await FileUtils.findMarkdownFiles(
        projectRoot,
        true,
      );

      // Parse all files; a file that fails to parse is reported rather than silently dropped, because its links cannot be discovered or rewritten
      const parseOutcomes = await Promise.all(
        markdownFiles.map(async (filePath) => {
          try {
            return {
              parsed: await this.linkParser.parseFile(filePath),
            };
          } catch (error) {
            return {
              failure: {
                file: filePath,
                error: errorMessage(error),
                stack: error instanceof Error ? error.stack : undefined,
              },
            };
          }
        }),
      );
      const parsedFiles: ParsedMarkdownFile[] = [];
      const parseFailures: {
        file: string;
        error: string;
        stack?: string | undefined;
      }[] = [];
      for (const outcome of parseOutcomes) {
        if ("parsed" in outcome) {
          parsedFiles.push(outcome.parsed);
        } else {
          parseFailures.push(outcome.failure);
        }
      }

      return { files: parsedFiles, parseFailures, vaultRoot: projectRoot };
    } catch (error) {
      console.warn(`Failed to discover project files: ${errorMessage(error)}`);

      return {
        files: [],
        parseFailures: [],
        vaultRoot: PathUtils.findCommonBase(seedPaths),
      };
    }
  }

  /**
   * Activate Obsidian vault semantics for an operation when requested.
   *
   * Wikilinks in every scanned file are resolved against the whole set so the dependency graph and
   * rewriter see them as real references, the link refactorer gains the vault context that decides
   * between a bare stem and a path-qualified rewrite, and ambiguous or duplicate note names are
   * surfaced as warnings -- a duplicate makes every bare wikilink to it resolve by path proximity,
   * so a move can silently rebind those links without any text changing.
   * @param files - Every parsed markdown file in the scanned tree
   * @param vaultRoot - Root of the scanned tree, the base for vault-relative rewrites
   * @param options - The operation's options; obsidian mode activates when set
   * @returns Warnings about ambiguous wikilinks and duplicate note names
   */
  private prepareObsidianMode(
    files: readonly ParsedMarkdownFile[],
    vaultRoot: string,
    options: MoveOperationOptions,
  ): string[] {
    if (options.obsidian !== true) {
      this.linkRefactorer = new LinkRefactorer();

      return [];
    }

    const warnings: string[] = [];
    for (const ambiguity of resolveWikilinks(files, vaultRoot)) {
      warnings.push(
        `Ambiguous wikilink [[${ambiguity.stem}]] matches ${String(ambiguity.candidates.length)} notes: ${ambiguity.candidates.join(", ")}`,
      );
    }
    for (const duplicate of findDuplicateNoteStems(files)) {
      warnings.push(
        `Duplicate note name '${duplicate.stem}': ${duplicate.paths.join(", ")} -- Obsidian resolves [[${duplicate.stem}]] by path proximity, so a move can silently rebind links to it`,
      );
    }

    this.linkRefactorer = new LinkRefactorer({
      obsidianVault: {
        vaultRoot,
        noteStemCounts: computeNoteStemCounts(files),
      },
    });

    return warnings;
  }

  /**
   * Validates the links in every file an operation modified or created, skipping any that no longer exist on disk. A failure during validation is reported in the result rather than thrown.
   * @param result - Result of the operation to check.
   * @returns Whether the files are free of broken links, with the number of broken links and an error message for each.
   */
  async validateOperation(result: OperationResult): Promise<{
    /** True when no broken links were found in the modified and created files */
    valid: boolean;
    /** Number of broken links found */
    brokenLinks: number;
    /** One message per broken link, or a single message when validation itself failed */
    errors: string[];
  }> {
    try {
      const allFiles = [...result.modifiedFiles, ...result.createdFiles];

      const parsedOrAbsent = await Promise.all(
        allFiles.map(async (filePath) =>
          (await FileUtils.exists(filePath))
            ? this.linkParser.parseFile(filePath)
            : undefined,
        ),
      );
      const parsedFiles = parsedOrAbsent.filter(
        (parsed): parsed is ParsedMarkdownFile => parsed !== undefined,
      );

      const validationResult =
        await this.linkValidator.validateFiles(parsedFiles);

      return {
        valid: validationResult.valid,
        brokenLinks: validationResult.brokenLinks.length,
        errors: validationResult.brokenLinks.map(
          (bl) =>
            `${bl.sourceFile}: ${bl.reason} - ${bl.details ?? bl.link.href}`,
        ),
      };
    } catch (error) {
      return {
        valid: false,
        brokenLinks: 0,
        errors: [`Validation failed: ${errorMessage(error)}`],
      };
    }
  }
}
