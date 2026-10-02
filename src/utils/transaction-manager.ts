import type { OperationChange } from "../types/operations.js";
import { FileUtils } from "./file-utils.js";

/** Format an unknown caught value as a human-readable error message. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Represents a single atomic operation within a transaction.
 *
 * Each step can be executed and rolled back independently, providing the foundation for
 * transactional file operations with full rollback capability.
 *
 * @category Utilities
 */
export interface TransactionStep {
  /** Identifier made of the step kind and its position when added (for example `move-0`). */
  id: string;
  /** The kind of operation the step performs. */
  type:
    | "file-move"
    | "file-copy"
    | "file-delete"
    | "file-create"
    | "content-update";
  /** Human-readable summary, used in error messages and previews. */
  description: string;
  /** Performs the operation. Rejects when it fails. */
  execute: () => Promise<void>;
  /** Undoes the operation. Implementations log a warning rather than rejecting when the undo itself fails. */
  rollback: () => Promise<void>;
  /** True once `execute` has succeeded, and false again after the step is rolled back. */
  completed: boolean;
}

/**
 * Configuration options for transaction management.
 *
 * Controls transaction behavior including backup creation, error handling, and retry logic for
 * robust file operations.
 *
 * @category Utilities
 */
export interface TransactionOptions {
  /** Create backups before destructive operations */
  createBackups?: boolean;
  /** Continue on non-critical errors */
  continueOnError?: boolean;
  /** Maximum number of retry attempts */
  maxRetries?: number;
}

/**
 * Manages atomic file operations with full rollback capability.
 *
 * Provides transactional semantics for file system operations, ensuring that either all operations
 * complete successfully or all changes are rolled back. Supports automatic backups and retry
 * logic.
 *
 * @category Utilities
 *
 * @example
 *   Transactional file operations
 *   ```typescript
 *   const transaction = new TransactionManager({
 *       createBackups: true,
 *       continueOnError: false
 *   });
 *
 *   // Add operations to the transaction
 *   transaction.addFileMove('old.md', 'new.md');
 *   transaction.addContentUpdate('target.md', newContent);
 *
 *   try {
 *     const result = await transaction.execute();
 *     if (result.success) {
 *       console.log('All operations completed successfully');
 *     } else {
 *       console.log('Transaction failed, all changes rolled back');
 *     }
 *   } catch (error) {
 *     console.error('Transaction error:', error);
 *   }
 *   ```
 */
export class TransactionManager {
  private steps: TransactionStep[] = [];
  private executedSteps: TransactionStep[] = [];
  private backups = new Map<string, string>();
  private options: Required<TransactionOptions>;

  /**
   * Creates an empty transaction.
   *
   * @param options - Behaviour settings. `createBackups` defaults to true, `continueOnError` to false and `maxRetries` to 3.
   */
  constructor(options: TransactionOptions = {}) {
    this.options = {
      createBackups: options.createBackups ?? true,
      continueOnError: options.continueOnError ?? false,
      maxRetries: options.maxRetries ?? 3,
    };
  }

  /**
   * Queues a move of a file. Execution backs up the source when backups are enabled, creates the destination's parent directories and refuses to overwrite an existing destination. Rollback removes the destination and restores the source from the backup.
   *
   * @param sourcePath - File to move.
   * @param destinationPath - Where to move it to.
   * @param description - Overrides the generated description.
   */
  addFileMove(
    sourcePath: string,
    destinationPath: string,
    description?: string,
  ): void {
    const stepId = `move-${String(this.steps.length)}`;

    this.steps.push({
      id: stepId,
      type: "file-move",
      description: description ?? `Move ${sourcePath} to ${destinationPath}`,
      completed: false,

      execute: async () => {
        // Create backup if enabled
        if (
          this.options.createBackups &&
          (await FileUtils.exists(sourcePath))
        ) {
          const backupPath = await FileUtils.createBackup(sourcePath);
          this.backups.set(stepId, backupPath);
        }

        await FileUtils.moveFile(sourcePath, destinationPath, {
          createDirectories: true,
          overwrite: false,
        });
      },

      rollback: async () => {
        try {
          // If destination exists, remove it
          if (await FileUtils.exists(destinationPath)) {
            await FileUtils.deleteFile(destinationPath);
          }

          // Restore from backup if available
          const backupPath = this.backups.get(stepId);
          if (backupPath && (await FileUtils.exists(backupPath))) {
            await FileUtils.moveFile(backupPath, sourcePath);
            this.backups.delete(stepId);
          }
        } catch (error) {
          console.warn(`Failed to rollback file move: ${errorMessage(error)}`);
        }
      },
    });
  }

  /**
   * Queues replacing the content of a file, creating parent directories as needed. Execution remembers the previous content if the file exists. Rollback restores it, or deletes the file when it did not exist before.
   *
   * @param filePath - File to write.
   * @param newContent - The full new content.
   * @param description - Overrides the generated description.
   */
  addContentUpdate(
    filePath: string,
    newContent: string,
    description?: string,
  ): void {
    const stepId = `update-${String(this.steps.length)}`;
    let originalContent: string | null = null;

    this.steps.push({
      id: stepId,
      type: "content-update",
      description: description ?? `Update content of ${filePath}`,
      completed: false,

      execute: async () => {
        // Save original content for rollback
        if (await FileUtils.exists(filePath)) {
          originalContent = await FileUtils.readTextFile(filePath);
        }

        await FileUtils.writeTextFile(filePath, newContent, {
          createDirectories: true,
        });
      },

      rollback: async () => {
        try {
          if (originalContent !== null) {
            await FileUtils.writeTextFile(filePath, originalContent);
          } else {
            // File didn't exist originally, so delete it
            await FileUtils.deleteFile(filePath);
          }
        } catch (error) {
          console.warn(
            `Failed to rollback content update: ${errorMessage(error)}`,
          );
        }
      },
    });
  }

  /**
   * Queues creating a new file, with parent directories created as needed. Execution fails if the file already exists. Rollback deletes the file.
   *
   * @param filePath - File to create.
   * @param content - Content to write.
   * @param description - Overrides the generated description.
   */
  addFileCreate(filePath: string, content: string, description?: string): void {
    const stepId = `create-${String(this.steps.length)}`;

    this.steps.push({
      id: stepId,
      type: "file-create",
      description: description ?? `Create file ${filePath}`,
      completed: false,

      execute: async () => {
        if (await FileUtils.exists(filePath)) {
          throw new Error(`File already exists: ${filePath}`);
        }

        await FileUtils.writeTextFile(filePath, content, {
          createDirectories: true,
        });
      },

      rollback: async () => {
        try {
          await FileUtils.deleteFile(filePath);
        } catch (error) {
          console.warn(
            `Failed to rollback file creation: ${errorMessage(error)}`,
          );
        }
      },
    });
  }

  /**
   * Queues deleting a file. Execution does nothing when the file is already absent, and otherwise remembers its content. Rollback writes that content back, recreating parent directories, if the file had existed.
   *
   * @param filePath - File to delete.
   * @param description - Overrides the generated description.
   */
  addFileDelete(filePath: string, description?: string): void {
    const stepId = `delete-${String(this.steps.length)}`;
    let originalContent: string | null = null;

    this.steps.push({
      id: stepId,
      type: "file-delete",
      description: description ?? `Delete file ${filePath}`,
      completed: false,

      execute: async () => {
        if (await FileUtils.exists(filePath)) {
          // Save content for potential rollback
          originalContent = await FileUtils.readTextFile(filePath);
          await FileUtils.deleteFile(filePath);
        }
      },

      rollback: async () => {
        try {
          if (originalContent !== null) {
            await FileUtils.writeTextFile(filePath, originalContent, {
              createDirectories: true,
            });
          }
        } catch (error) {
          console.warn(
            `Failed to rollback file deletion: ${errorMessage(error)}`,
          );
        }
      },
    });
  }

  /**
   * Runs the queued steps in order, retrying a failing step up to `maxRetries` times with exponential backoff starting at one second. Unless `continueOnError` is set, a step that exhausts its retries rolls back every executed step and removes leftover backups. Backups are removed after a successful run.
   *
   * @returns The outcome. On a rolled-back failure `changes` is empty.
   */
  async execute(): Promise<{
    /** True when no step finally failed. */
    success: boolean;
    /** Number of steps that executed successfully, including any later rolled back. */
    completedSteps: number;
    /** One message per failed step, or for a failure of the transaction as a whole. */
    errors: string[];
    /** The changes made by the executed steps, derived from each step's type and description. */
    changes: OperationChange[];
  }> {
    const errors: string[] = [];
    const changes: OperationChange[] = [];
    let completedSteps = 0;

    try {
      for (const step of this.steps) {
        let retries = 0;
        let stepSuccess = false;

        while (retries <= this.options.maxRetries && !stepSuccess) {
          try {
            await step.execute();
            step.completed = true;
            this.executedSteps.push(step);
            stepSuccess = true;
            completedSteps++;

            // Record the change
            changes.push({
              type: this.mapStepTypeToChangeType(step.type),
              filePath: this.extractFilePathFromDescription(step.description),
            });
          } catch (error) {
            retries++;
            const stepErrorMessage = `Step "${step.description}" failed (attempt ${String(retries)}): ${errorMessage(error)}`;

            if (retries > this.options.maxRetries) {
              errors.push(stepErrorMessage);

              if (!this.options.continueOnError) {
                // Rollback all executed steps
                await this.rollback();
                // The failed step never completed, so no rollback consumes the backup its attempt created; deleting it here keeps a stray copy from failing every later run on the same source
                await this.cleanupBackups();
                return {
                  success: false,
                  completedSteps,
                  errors,
                  changes: [],
                };
              }
            } else {
              // Wait before retry (exponential backoff)
              await new Promise((resolve) =>
                setTimeout(resolve, 2 ** (retries - 1) * 1000),
              );
            }
          }
        }
      }

      // Clean up backups on success
      await this.cleanupBackups();

      return {
        success: errors.length === 0,
        completedSteps,
        errors,
        changes,
      };
    } catch (error) {
      errors.push(`Transaction execution failed: ${errorMessage(error)}`);
      await this.rollback();
      await this.cleanupBackups();

      return {
        success: false,
        completedSteps,
        errors,
        changes: [],
      };
    }
  }

  /** Rolls back every executed step in reverse order and forgets them. A step whose rollback throws is reported in a single warning and does not stop the others. */
  async rollback(): Promise<void> {
    const rollbackErrors: string[] = [];

    // Rollback in reverse order
    for (let i = this.executedSteps.length - 1; i >= 0; i--) {
      const step = this.executedSteps[i];
      try {
        await step.rollback();
        step.completed = false;
      } catch (error) {
        rollbackErrors.push(
          `Failed to rollback step "${step.description}": ${errorMessage(error)}`,
        );
      }
    }

    this.executedSteps = [];

    if (rollbackErrors.length > 0) {
      console.warn("Rollback completed with warnings:", rollbackErrors);
    }
  }

  /**
   * Lists the queued steps, in order, without executing anything.
   *
   * @returns One entry per step.
   */
  getPreview(): {
    /** The step's description. */
    description: string;
    /** The step's kind, such as `file-move`. */
    type: string;
  }[] {
    return this.steps.map((step) => ({
      description: step.description,
      type: step.type,
    }));
  }

  /** Clear all planned operations */
  clear(): void {
    this.steps = [];
    this.executedSteps = [];
    this.backups.clear();
  }

  /** Get the number of planned operations */
  getStepCount(): number {
    return this.steps.length;
  }

  private async cleanupBackups(): Promise<void> {
    for (const backupPath of this.backups.values()) {
      try {
        await FileUtils.deleteFile(backupPath);
      } catch (error) {
        console.warn(
          `Failed to cleanup backup ${backupPath}: ${errorMessage(error)}`,
        );
      }
    }
    this.backups.clear();
  }

  private mapStepTypeToChangeType(stepType: string): OperationChange["type"] {
    switch (stepType) {
      case "file-move":
        return "file-moved";
      case "file-create":
        return "file-created";
      case "file-delete":
        return "file-deleted";
      case "content-update":
        return "content-modified";
      default:
        return "content-modified";
    }
  }

  private extractFilePathFromDescription(description: string): string {
    // Simple extraction - could be enhanced with more sophisticated parsing
    const match =
      /(?:Move|Update|Create|Delete)\s+(?:content of\s+)?([^\s]+)/.exec(
        description,
      );
    return match?.[1] ?? "";
  }
}
