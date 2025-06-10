import { FileUtils } from './file-utils.js';
import { PathUtils } from './path-utils.js';
import type { OperationChange } from '../types/operations.js';

export interface TransactionStep {
  id: string;
  type: 'file-move' | 'file-copy' | 'file-delete' | 'file-create' | 'content-update';
  description: string;
  execute: () => Promise<void>;
  rollback: () => Promise<void>;
  completed: boolean;
}

export interface TransactionOptions {
  /** Create backups before destructive operations */
  createBackups?: boolean;
  /** Continue on non-critical errors */
  continueOnError?: boolean;
  /** Maximum number of retry attempts */
  maxRetries?: number;
}

export class TransactionManager {
  private steps: TransactionStep[] = [];
  private executedSteps: TransactionStep[] = [];
  private backups = new Map<string, string>();
  private options: Required<TransactionOptions>;

  constructor(options: TransactionOptions = {}) {
    this.options = {
      createBackups: options.createBackups ?? true,
      continueOnError: options.continueOnError ?? false,
      maxRetries: options.maxRetries ?? 3,
    };
  }

  /**
   * Add a file move operation to the transaction
   */
  addFileMove(
    sourcePath: string, 
    destinationPath: string, 
    description?: string
  ): void {
    const stepId = `move-${this.steps.length}`;
    
    this.steps.push({
      id: stepId,
      type: 'file-move',
      description: description || `Move ${sourcePath} to ${destinationPath}`,
      completed: false,
      
      execute: async () => {
        // Create backup if enabled
        if (this.options.createBackups && await FileUtils.exists(sourcePath)) {
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
          if (backupPath && await FileUtils.exists(backupPath)) {
            await FileUtils.moveFile(backupPath, sourcePath);
            this.backups.delete(stepId);
          }
        } catch (error) {
          console.warn(`Failed to rollback file move: ${error}`);
        }
      },
    });
  }

  /**
   * Add a content update operation to the transaction
   */
  addContentUpdate(
    filePath: string, 
    newContent: string, 
    description?: string
  ): void {
    const stepId = `update-${this.steps.length}`;
    let originalContent: string | null = null;

    this.steps.push({
      id: stepId,
      type: 'content-update',
      description: description || `Update content of ${filePath}`,
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
          console.warn(`Failed to rollback content update: ${error}`);
        }
      },
    });
  }

  /**
   * Add a file creation operation to the transaction
   */
  addFileCreate(
    filePath: string, 
    content: string, 
    description?: string
  ): void {
    const stepId = `create-${this.steps.length}`;

    this.steps.push({
      id: stepId,
      type: 'file-create',
      description: description || `Create file ${filePath}`,
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
          console.warn(`Failed to rollback file creation: ${error}`);
        }
      },
    });
  }

  /**
   * Add a file deletion operation to the transaction
   */
  addFileDelete(filePath: string, description?: string): void {
    const stepId = `delete-${this.steps.length}`;
    let originalContent: string | null = null;

    this.steps.push({
      id: stepId,
      type: 'file-delete',
      description: description || `Delete file ${filePath}`,
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
          console.warn(`Failed to rollback file deletion: ${error}`);
        }
      },
    });
  }

  /**
   * Execute all steps in the transaction
   */
  async execute(): Promise<{
    success: boolean;
    completedSteps: number;
    errors: string[];
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
              oldValue: undefined, // Could be enhanced to track old values
              newValue: undefined,
            });

          } catch (error) {
            retries++;
            const errorMessage = `Step "${step.description}" failed (attempt ${retries}): ${error}`;
            
            if (retries > this.options.maxRetries) {
              errors.push(errorMessage);
              
              if (!this.options.continueOnError) {
                // Rollback all executed steps
                await this.rollback();
                return {
                  success: false,
                  completedSteps,
                  errors,
                  changes: [],
                };
              }
            } else {
              // Wait before retry (exponential backoff)
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries - 1) * 1000));
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
      errors.push(`Transaction execution failed: ${error}`);
      await this.rollback();
      
      return {
        success: false,
        completedSteps,
        errors,
        changes: [],
      };
    }
  }

  /**
   * Rollback all executed steps
   */
  async rollback(): Promise<void> {
    const rollbackErrors: string[] = [];

    // Rollback in reverse order
    for (let i = this.executedSteps.length - 1; i >= 0; i--) {
      const step = this.executedSteps[i];
      try {
        await step.rollback();
        step.completed = false;
      } catch (error) {
        rollbackErrors.push(`Failed to rollback step "${step.description}": ${error}`);
      }
    }

    this.executedSteps = [];

    if (rollbackErrors.length > 0) {
      console.warn('Rollback completed with warnings:', rollbackErrors);
    }
  }

  /**
   * Get a preview of all planned operations
   */
  getPreview(): Array<{ description: string; type: string }> {
    return this.steps.map(step => ({
      description: step.description,
      type: step.type,
    }));
  }

  /**
   * Clear all planned operations
   */
  clear(): void {
    this.steps = [];
    this.executedSteps = [];
    this.backups.clear();
  }

  /**
   * Get the number of planned operations
   */
  getStepCount(): number {
    return this.steps.length;
  }

  private async cleanupBackups(): Promise<void> {
    for (const backupPath of this.backups.values()) {
      try {
        await FileUtils.deleteFile(backupPath);
      } catch (error) {
        console.warn(`Failed to cleanup backup ${backupPath}: ${error}`);
      }
    }
    this.backups.clear();
  }

  private mapStepTypeToChangeType(stepType: string): OperationChange['type'] {
    switch (stepType) {
      case 'file-move':
        return 'file-moved';
      case 'file-create':
        return 'file-created';
      case 'file-delete':
        return 'file-deleted';
      case 'content-update':
        return 'content-modified';
      default:
        return 'content-modified';
    }
  }

  private extractFilePathFromDescription(description: string): string {
    // Simple extraction - could be enhanced with more sophisticated parsing
    const match = description.match(/(?:Move|Update|Create|Delete)\s+(?:content of\s+)?([^\s]+)/);
    return match?.[1] || '';
  }
}