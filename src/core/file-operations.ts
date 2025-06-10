import { LinkParser } from './link-parser.js';
import { DependencyGraph } from './dependency-graph.js';
import { LinkRefactorer } from './link-refactorer.js';
import { LinkValidator } from './link-validator.js';
import { TransactionManager } from '../utils/transaction-manager.js';
import { FileUtils } from '../utils/file-utils.js';
import { PathUtils } from '../utils/path-utils.js';
import type { 
  MoveOperationOptions, 
  OperationResult, 
  OperationChange 
} from '../types/operations.js';
import type { ParsedMarkdownFile } from '../types/links.js';

export class FileOperations {
  private linkParser = new LinkParser();
  private linkRefactorer = new LinkRefactorer();
  private linkValidator = new LinkValidator();

  /**
   * Move a markdown file and update all links that reference it
   */
  async moveFile(
    sourcePath: string,
    destinationPath: string,
    options: MoveOperationOptions = {}
  ): Promise<OperationResult> {
    const {
      dryRun = false,
      verbose = false,
      force = false,
      createDirectories = true,
    } = options;

    try {
      // Validate inputs
      const validation = this.validateMoveOperation(sourcePath, destinationPath);
      if (!validation.valid) {
        return {
          success: false,
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
          errors: [validation.error!],
          warnings: [],
          changes: [],
        };
      }

      // Parse the source file and build dependency graph
      const sourceFile = await this.linkParser.parseFile(sourcePath);
      const projectFiles = await this.discoverProjectFiles(sourcePath);
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
          destinationPath,
          `Move ${sourcePath} to ${destinationPath}`
        );
      }

      // Plan link updates in all dependent files
      for (const dependentFilePath of dependentFiles) {
        const dependentFile = dependencyGraph.getNode(dependentFilePath)?.data;
        if (!dependentFile) continue;

        try {
          const refactorResult = await this.linkRefactorer.refactorLinksForFileMove(
            dependentFile,
            sourcePath,
            destinationPath
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

      // Update links within the moved file itself
      try {
        const selfRefactorResult = await this.linkRefactorer.refactorLinksForCurrentFileMove(
          sourceFile,
          destinationPath
        );

        if (selfRefactorResult.changes.length > 0) {
          changes.push(...selfRefactorResult.changes);

          if (!dryRun) {
            transaction.addContentUpdate(
              destinationPath,
              selfRefactorResult.updatedContent,
              `Update internal links in moved file`
            );
          }
        }

        if (selfRefactorResult.errors.length > 0) {
          warnings.push(...selfRefactorResult.errors);
        }
      } catch (error) {
        warnings.push(`Failed to update links in source file: ${error}`);
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
          createdFiles: destinationPath !== sourcePath ? [destinationPath] : [],
          deletedFiles: destinationPath !== sourcePath ? [sourcePath] : [],
          errors: [],
          warnings,
          changes,
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
        createdFiles: [destinationPath],
        deletedFiles: [sourcePath],
        errors: [],
        warnings,
        changes,
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

  /**
   * Move multiple files in a single operation
   */
  async moveFiles(
    moves: Array<{ source: string; destination: string }>,
    options: MoveOperationOptions = {}
  ): Promise<OperationResult> {
    const { dryRun = false, verbose = false } = options;

    try {
      // Validate all moves first
      for (const { source, destination } of moves) {
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

      // Parse all files and build comprehensive dependency graph
      const allFiles: ParsedMarkdownFile[] = [];
      for (const { source } of moves) {
        const sourceFile = await this.linkParser.parseFile(source);
        allFiles.push(sourceFile);
      }

      // Discover additional project files
      const projectFiles = await this.discoverProjectFiles(moves[0].source);
      const dependencyGraph = new DependencyGraph([...allFiles, ...projectFiles]);

      const transaction = new TransactionManager({
        createBackups: !dryRun,
        continueOnError: false,
      });

      const allChanges: OperationChange[] = [];
      const modifiedFiles = new Set<string>();
      const warnings: string[] = [];

      // Process each move
      for (const { source, destination } of moves) {
        // Plan file move
        if (!dryRun) {
          transaction.addFileMove(source, destination);
        }

        // Update dependency graph for this move
        dependencyGraph.updateFilePath(source, destination);

        // Find dependent files
        const dependentFiles = dependencyGraph.getDependents(destination);

        // Process dependent files
        for (const dependentFilePath of dependentFiles) {
          const dependentFile = dependencyGraph.getNode(dependentFilePath)?.data;
          if (!dependentFile) continue;

          const refactorResult = await this.linkRefactorer.refactorLinksForFileMove(
            dependentFile,
            source,
            destination
          );

          if (refactorResult.changes.length > 0) {
            modifiedFiles.add(dependentFilePath);
            allChanges.push(...refactorResult.changes);

            if (!dryRun) {
              transaction.addContentUpdate(
                dependentFilePath,
                refactorResult.updatedContent
              );
            }
          }

          warnings.push(...refactorResult.errors);
        }

        // Update the moved file itself
        const sourceFile = allFiles.find(f => f.filePath === source);
        if (sourceFile) {
          const selfRefactorResult = await this.linkRefactorer.refactorLinksForCurrentFileMove(
            sourceFile,
            destination
          );

          if (selfRefactorResult.changes.length > 0) {
            allChanges.push(...selfRefactorResult.changes);

            if (!dryRun) {
              transaction.addContentUpdate(
                destination,
                selfRefactorResult.updatedContent
              );
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
          createdFiles: moves.map(m => m.destination),
          deletedFiles: moves.map(m => m.source),
          errors: [],
          warnings,
          changes: allChanges,
        };
      }

      const executionResult = await transaction.execute();

      return {
        success: executionResult.success,
        modifiedFiles: Array.from(modifiedFiles),
        createdFiles: executionResult.success ? moves.map(m => m.destination) : [],
        deletedFiles: executionResult.success ? moves.map(m => m.source) : [],
        errors: executionResult.errors,
        warnings,
        changes: allChanges,
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

  private validateMoveOperation(sourcePath: string, destinationPath: string): {
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

    // Check if source is a markdown file
    if (!PathUtils.isMarkdownFile(sourcePath)) {
      return { valid: false, error: 'Source must be a markdown file' };
    }

    // Check if destination is a markdown file
    if (!PathUtils.isMarkdownFile(destinationPath)) {
      return { valid: false, error: 'Destination must be a markdown file' };
    }

    // Check for same source and destination
    if (PathUtils.resolvePath(sourcePath) === PathUtils.resolvePath(destinationPath)) {
      return { valid: false, error: 'Source and destination are the same' };
    }

    return { valid: true };
  }

  private async discoverProjectFiles(seedPath: string): Promise<ParsedMarkdownFile[]> {
    try {
      // Find the project root (directory containing the seed file)
      const projectRoot = PathUtils.findCommonBase([seedPath]);
      
      // Find all markdown files in the project
      const markdownFiles = await FileUtils.findMarkdownFiles(projectRoot, true);
      
      // Parse all files
      const parsedFiles: ParsedMarkdownFile[] = [];
      for (const filePath of markdownFiles) {
        try {
          const parsed = await this.linkParser.parseFile(filePath);
          parsedFiles.push(parsed);
        } catch (error) {
          console.warn(`Failed to parse ${filePath}: ${error}`);
        }
      }

      return parsedFiles;
    } catch (error) {
      console.warn(`Failed to discover project files: ${error}`);
      return [];
    }
  }

  /**
   * Validate the integrity of links after an operation
   */
  async validateOperation(result: OperationResult): Promise<{
    valid: boolean;
    brokenLinks: number;
    errors: string[];
  }> {
    try {
      const allFiles = [
        ...result.modifiedFiles,
        ...result.createdFiles,
      ];

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
        errors: validationResult.brokenLinks.map(bl => 
          `${bl.sourceFile}: ${bl.reason} - ${bl.details || bl.link.href}`
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