import { existsSync } from 'node:fs';
import type { ParsedMarkdownFile } from '../types/links.js';
import type {
  MoveOperationOptions,
  OperationChange,
  OperationResult,
} from '../types/operations.js';
import { FileUtils } from '../utils/file-utils.js';
import { PathUtils } from '../utils/path-utils.js';
import { TransactionManager } from '../utils/transaction-manager.js';
import { DependencyGraph } from './dependency-graph.js';
import { LinkParser } from './link-parser.js';
import type { LinkRefactorResult } from './link-refactorer.js';
import { LinkRefactorer } from './link-refactorer.js';
import { LinkValidator } from './link-validator.js';

/**
 * Core class for performing markdown file operations with intelligent link refactoring.
 *
 * This class provides the main functionality for moving, splitting, joining, and merging markdown
 * files while maintaining the integrity of cross-references and links.
 *
 * @category Core
 *
 * @example
 *   Basic file move
 *   ```typescript
 *   const fileOps = new FileOperations();
 *   const result = await fileOps.moveFile('old.md', 'new.md');
 *
 *   if (result.success) {
 *   console.log(`Successfully moved file and updated ${result.modifiedFiles.length} references`);
 *   } else {
 *   console.error('Move failed:', result.errors);
 *   }
 *   ```
 *
 * @example
 *   Dry run with verbose output
 *   ```typescript
 *   const fileOps = new FileOperations();
 *   const result = await fileOps.moveFile('docs/guide.md', 'tutorials/guide.md', {
 *   dryRun: true,
 *   verbose: true
 *   });
 *
 *   // Preview changes without actually modifying files
 *   result.changes.forEach(change => {
 *   console.log(`${change.type}: ${change.filePath} - ${change.description}`);
 *   });
 *   ```
 */
export class FileOperations {
  private linkParser = new LinkParser();
  private linkRefactorer = new LinkRefactorer();
  private linkValidator = new LinkValidator();

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
   *
   * @example
   *   ```typescript
   *   const fileOps = new FileOperations();
   *
   *   // Simple move
   *   await fileOps.moveFile('docs/old.md', 'docs/new.md');
   *
   *   // Move to directory (filename preserved)
   *   await fileOps.moveFile('guide.md', './docs/');
   *
   *   // Move a linked image, updating any markdown files that reference it
   *   await fileOps.moveFile('image.png', 'assets/image.png');
   *
   *   // Dry run with verbose output
   *   const result = await fileOps.moveFile('api.md', 'reference/api.md', {
   *     dryRun: true,
   *     verbose: true
   *   });
   *   ```;
   *
   * @param sourcePath - The current path of the file to move
   * @param destinationPath - The target path (can be a directory)
   * @param options - Configuration options for the move operation
   *
   * @returns Promise resolving to detailed operation results
   */
  async moveFile(
    sourcePath: string,
    destinationPath: string,
    options: MoveOperationOptions = {}
  ): Promise<OperationResult> {
    const { dryRun = false, verbose = false } = options;

    try {
      // Resolve destination in case it's a directory
      const resolvedDestination = PathUtils.resolveDestination(sourcePath, destinationPath);

      // Validate inputs
      const validation = this.validateMoveOperation(sourcePath, resolvedDestination);
      if (!validation.valid) {
        return {
          success: false,
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
          errors: [validation.error || 'Validation failed'],
          warnings: [],
          changes: [],
        };
      }

      // Parse the source file (only meaningful for markdown, which may itself contain links to update) and build a dependency graph from the surrounding project's markdown files.
      const sourceIsMarkdown = PathUtils.isMarkdownFile(sourcePath);
      const sourceFile = sourceIsMarkdown ? await this.linkParser.parseFile(sourcePath) : null;
      const { files: projectFiles, parseFailures } = await this.discoverProjectFiles(sourcePath);
      const dependencyGraph = new DependencyGraph(projectFiles);

      // Find all files that link to the source file
      const dependentFiles = dependencyGraph.getDependents(sourcePath);

      if (verbose) {
        console.log(`Found ${dependentFiles.length} files that reference ${sourcePath}`);
      }

      // Prepare transaction
      const transaction = new TransactionManager({
        createBackups: !dryRun,
        continueOnError: false,
      });

      const changes: OperationChange[] = [];
      const modifiedFiles: string[] = [];
      const warnings: string[] = [];

      // Plan file move
      if (!dryRun) {
        transaction.addFileMove(
          sourcePath,
          resolvedDestination,
          `Move ${sourcePath} to ${resolvedDestination}`
        );
      }

      // Plan link updates in all dependent files
      for (const dependentFilePath of dependentFiles) {
        const dependentFile = dependencyGraph.getNode(dependentFilePath)?.data;
        if (!dependentFile) continue;

        try {
          const refactorResult: LinkRefactorResult =
            await this.linkRefactorer.refactorLinksForFileMove(
              dependentFile,
              sourcePath,
              resolvedDestination
            );

          if (refactorResult.changes.length > 0) {
            modifiedFiles.push(dependentFilePath);
            changes.push(...refactorResult.changes);

            if (!dryRun) {
              transaction.addContentUpdate(
                dependentFilePath,
                refactorResult.updatedContent,
                `Update links in ${dependentFilePath}`
              );
            }
          }

          if (refactorResult.errors.length > 0) {
            warnings.push(...refactorResult.errors);
          }
        } catch (error) {
          warnings.push(`Failed to process ${dependentFilePath}: ${error}`);
        }
      }

      // Update links within the moved file itself (a non-markdown asset has no internal links to refactor and is moved as raw bytes, so this step only applies to markdown sources).
      if (sourceFile) {
        try {
          const selfRefactorResult = await this.linkRefactorer.refactorLinksForCurrentFileMove(
            sourceFile,
            resolvedDestination
          );

          if (selfRefactorResult.changes.length > 0) {
            changes.push(...selfRefactorResult.changes);

            if (!dryRun) {
              transaction.addContentUpdate(
                resolvedDestination,
                selfRefactorResult.updatedContent,
                'Update internal links in moved file'
              );
            }
          }

          if (selfRefactorResult.errors.length > 0) {
            warnings.push(...selfRefactorResult.errors);
          }
        } catch (error) {
          warnings.push(`Failed to update links in source file: ${error}`);
        }
      }

      // Execute transaction or return dry-run results
      if (dryRun) {
        if (verbose) {
          console.log('Dry run - changes that would be made:');
          for (const change of changes) {
            console.log(`  ${change.type}: ${change.filePath}`);
            if (change.oldValue && change.newValue) {
              console.log(`    ${change.oldValue} → ${change.newValue}`);
            }
          }
        }

        return {
          success: true,
          modifiedFiles,
          createdFiles: resolvedDestination !== sourcePath ? [resolvedDestination] : [],
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
        errors: [`Move operation failed: ${error}`],
        warnings: [],
        changes: [],
      };
    }
  }

  /** Move multiple files in a single operation */
  async moveFiles(
    moves: Array<{ source: string; destination: string }>,
    options: MoveOperationOptions = {}
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

      // Resolve destinations and validate all moves first
      const resolvedMoves = moves.map(({ source, destination }) => ({
        source,
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
            errors: [`Invalid move ${source} → ${destination}: ${validation.error}`],
            warnings: [],
            changes: [],
          };
        }
      }

      // Parse markdown sources and build a comprehensive dependency graph. Non-markdown assets (e.g. images) have no links of their own to parse or refactor, so they are moved as raw bytes and never added to the dependency graph as nodes; they can still be discovered as dependencies of the markdown files that link to them.
      const allFiles: ParsedMarkdownFile[] = [];
      const fileContents = new Map<string, string>(); // Store original file contents

      for (const { source } of resolvedMoves) {
        if (!PathUtils.isMarkdownFile(source)) continue;

        const sourceFile = await this.linkParser.parseFile(source);
        allFiles.push(sourceFile);

        // Store the original content before any moves
        const content = await FileUtils.readTextFile(source);
        fileContents.set(source, content);
      }

      // Discover additional project files
      const { files: projectFiles, parseFailures } = await this.discoverProjectFiles(
        resolvedMoves[0].source
      );
      const dependencyGraph = new DependencyGraph([...allFiles, ...projectFiles]);

      // Store content for every parsed file, not just the moved sources. Bystander files that link to several moved files are refactored once per move, and the transaction has not executed yet: re-reading a bystander from disk on a later move would see the original bytes and silently discard the link updates planned by earlier moves in the same batch.
      const sourceFilePaths = new Set(
        resolvedMoves.filter(({ source }) => PathUtils.isMarkdownFile(source)).map((m) => m.source)
      );
      for (const filePath of [...sourceFilePaths, ...projectFiles.map((f) => f.filePath)]) {
        if (!fileContents.has(filePath) && (await FileUtils.exists(filePath))) {
          const content = await FileUtils.readTextFile(filePath);
          fileContents.set(filePath, content);
        }
      }

      const transaction = new TransactionManager({
        createBackups: !dryRun,
        continueOnError: false,
      });

      const allChanges: OperationChange[] = [];
      const modifiedFiles = new Set<string>();
      const warnings: string[] = [];

      // First pass: Add all file moves to the transaction
      for (const { source, destination } of resolvedMoves) {
        if (!dryRun) {
          transaction.addFileMove(source, destination);
        }
        // Update dependency graph immediately
        dependencyGraph.updateFilePath(source, destination);
      }

      // Second pass: Process content updates for dependent files and moved files
      for (const { source, destination } of resolvedMoves) {
        // Find dependent files (files that depend on the source file being moved)
        // Note: use destination since we've already updated the dependency graph
        const dependentFiles = dependencyGraph.getDependents(destination);

        // Process dependent files
        for (const dependentFilePath of dependentFiles) {
          const dependentFile = dependencyGraph.getNode(dependentFilePath)?.data;
          if (!dependentFile) continue;

          // For files being moved in this batch, use stored content and update the destination
          const moveInfo = resolvedMoves.find((move) => move.destination === dependentFilePath);
          const actualDependentFile = dependentFile;
          let actualDependentPath = dependentFilePath;
          let contentToUse = fileContents.get(dependentFile.filePath);

          if (moveInfo) {
            // This dependent file is also being moved
            actualDependentPath = moveInfo.destination;
            contentToUse = fileContents.get(moveInfo.source);
          }

          if (!contentToUse) {
            // Fallback to reading from file system
            const refactorResult = await this.linkRefactorer.refactorLinksForFileMove(
              actualDependentFile,
              source,
              destination
            );

            if (refactorResult.changes.length > 0) {
              modifiedFiles.add(actualDependentPath);
              allChanges.push(...refactorResult.changes);

              if (!dryRun) {
                transaction.addContentUpdate(actualDependentPath, refactorResult.updatedContent);
              }

              // Update stored content so subsequent moves in this batch build on it
              fileContents.set(actualDependentPath, refactorResult.updatedContent);
            }

            warnings.push(...refactorResult.errors);
          } else {
            // Use stored content
            const refactorResult = await this.linkRefactorer.refactorLinksForFileMoveWithContent(
              actualDependentFile,
              source,
              destination,
              contentToUse
            );

            if (refactorResult.changes.length > 0) {
              modifiedFiles.add(actualDependentPath);
              allChanges.push(...refactorResult.changes);

              if (!dryRun) {
                transaction.addContentUpdate(actualDependentPath, refactorResult.updatedContent);
              }

              // Update stored content for subsequent processing
              fileContents.set(actualDependentPath, refactorResult.updatedContent);
            }

            warnings.push(...refactorResult.errors);
          }
        }

        // Update the moved file itself
        const sourceFile = allFiles.find((f) => f.filePath === source);
        if (sourceFile) {
          // Use stored content instead of reading from file system
          const originalContent = fileContents.get(source);
          if (originalContent) {
            const selfRefactorResult =
              await this.linkRefactorer.refactorLinksForCurrentFileMoveWithContent(
                sourceFile,
                destination,
                originalContent
              );

            if (selfRefactorResult.changes.length > 0) {
              allChanges.push(...selfRefactorResult.changes);

              if (!dryRun) {
                transaction.addContentUpdate(destination, selfRefactorResult.updatedContent);
              }
            }

            warnings.push(...selfRefactorResult.errors);
          }
        } else if (sourceFile) {
          // Fallback to the original method if content not found
          const selfRefactorResult = await this.linkRefactorer.refactorLinksForCurrentFileMove(
            sourceFile,
            destination
          );

          if (selfRefactorResult.changes.length > 0) {
            allChanges.push(...selfRefactorResult.changes);

            if (!dryRun) {
              transaction.addContentUpdate(destination, selfRefactorResult.updatedContent);
            }
          }

          warnings.push(...selfRefactorResult.errors);
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
        createdFiles: executionResult.success ? resolvedMoves.map((m) => m.destination) : [],
        deletedFiles: executionResult.success ? resolvedMoves.map((m) => m.source) : [],
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
        errors: [`Bulk move operation failed: ${error}`],
        warnings: [],
        changes: [],
      };
    }
  }

  private validateMoveOperation(
    sourcePath: string,
    destinationPath: string
  ): {
    valid: boolean;
    error?: string;
  } {
    // Validate source path
    const sourceValidation = PathUtils.validatePath(sourcePath);
    if (!sourceValidation.valid) {
      return { valid: false, error: `Invalid source path: ${sourceValidation.reason}` };
    }

    // Validate destination path
    const destValidation = PathUtils.validatePath(destinationPath);
    if (!destValidation.valid) {
      return { valid: false, error: `Invalid destination path: ${destValidation.reason}` };
    }

    // The source must exist before any project discovery is attempted. Without this check, a nonexistent path resolves to a directory (its own dirname) that project discovery then scans, which is unbounded when the path has no real parent directory to anchor to (e.g. a nonexistent file directly under the filesystem root).
    if (!existsSync(sourcePath)) {
      return { valid: false, error: `Source file does not exist: ${sourcePath}` };
    }

    // A markdown file must move to another markdown file (so its own internal links stay meaningful), and a non-markdown asset must move to another non-markdown path (so it isn't silently reinterpreted as markdown). Moving markdown <-> non-markdown is not supported.
    const sourceIsMarkdown = PathUtils.isMarkdownFile(sourcePath);
    const destinationIsMarkdown = PathUtils.isMarkdownFile(destinationPath);

    if (sourceIsMarkdown && !destinationIsMarkdown) {
      return { valid: false, error: 'Destination must be a markdown file' };
    }

    if (!sourceIsMarkdown && destinationIsMarkdown) {
      return {
        valid: false,
        error: 'Destination must not be a markdown file when the source is not a markdown file',
      };
    }

    // Check for same source and destination
    if (PathUtils.resolvePath(sourcePath) === PathUtils.resolvePath(destinationPath)) {
      return { valid: false, error: 'Source and destination are the same' };
    }

    return { valid: true };
  }

  private async discoverProjectFiles(seedPath: string): Promise<{
    files: ParsedMarkdownFile[];
    parseFailures: Array<{ file: string; error: string; stack?: string | undefined }>;
  }> {
    try {
      // Find the project root (directory containing the seed file)
      const projectRoot = PathUtils.findCommonBase([seedPath]);

      // Find all markdown files in the project
      const markdownFiles = await FileUtils.findMarkdownFiles(projectRoot, true);

      // Parse all files; a file that fails to parse is reported rather than silently dropped, because its links cannot be discovered or rewritten
      const parsedFiles: ParsedMarkdownFile[] = [];
      const parseFailures: Array<{ file: string; error: string; stack?: string | undefined }> = [];
      for (const filePath of markdownFiles) {
        try {
          const parsed = await this.linkParser.parseFile(filePath);
          parsedFiles.push(parsed);
        } catch (error) {
          parseFailures.push({
            file: filePath,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
      }

      return { files: parsedFiles, parseFailures };
    } catch (error) {
      console.warn(`Failed to discover project files: ${error}`);
      return { files: [], parseFailures: [] };
    }
  }

  /** Validate the integrity of links after an operation */
  async validateOperation(result: OperationResult): Promise<{
    valid: boolean;
    brokenLinks: number;
    errors: string[];
  }> {
    try {
      const allFiles = [...result.modifiedFiles, ...result.createdFiles];

      const parsedFiles: ParsedMarkdownFile[] = [];
      for (const filePath of allFiles) {
        if (await FileUtils.exists(filePath)) {
          const parsed = await this.linkParser.parseFile(filePath);
          parsedFiles.push(parsed);
        }
      }

      const validationResult = await this.linkValidator.validateFiles(parsedFiles);

      return {
        valid: validationResult.valid,
        brokenLinks: validationResult.brokenLinks.length,
        errors: validationResult.brokenLinks.map(
          (bl) => `${bl.sourceFile}: ${bl.reason} - ${bl.details || bl.link.href}`
        ),
      };
    } catch (error) {
      return {
        valid: false,
        brokenLinks: 0,
        errors: [`Validation failed: ${error}`],
      };
    }
  }
}
