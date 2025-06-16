import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TransactionManager } from './transaction-manager.js';

describe('TransactionManager', () => {
  const testDir = join(process.cwd(), 'test-temp-transaction');
  let manager: TransactionManager;

  beforeEach(async () => {
    manager = new TransactionManager();
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  const createTestFile = async (filename: string, content: string): Promise<string> => {
    const filePath = join(testDir, filename);
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  };

  describe('file creation operations', () => {
    it('should add and execute file creation', async () => {
      const filePath = join(testDir, 'new-file.txt');
      const content = 'test content';

      manager.addFileCreate(filePath, content);
      const result = await manager.execute();

      expect(result.success).toBe(true);
      expect(result.completedSteps).toBe(1);
      expect(result.errors).toHaveLength(0);

      const savedContent = await fs.readFile(filePath, 'utf8');
      expect(savedContent).toBe(content);
    });

    it('should handle multiple file creations', async () => {
      const file1 = join(testDir, 'file1.txt');
      const file2 = join(testDir, 'file2.txt');
      const content1 = 'content 1';
      const content2 = 'content 2';

      manager.addFileCreate(file1, content1);
      manager.addFileCreate(file2, content2);
      const result = await manager.execute();

      expect(result.success).toBe(true);
      expect(result.completedSteps).toBe(2);

      const savedContent1 = await fs.readFile(file1, 'utf8');
      const savedContent2 = await fs.readFile(file2, 'utf8');
      expect(savedContent1).toBe(content1);
      expect(savedContent2).toBe(content2);
    });

    it('should rollback file creation on error', async () => {
      const manager = new TransactionManager({ maxRetries: 0 });
      const validFile = join(testDir, 'valid.txt');
      const existingFile = await createTestFile('existing.txt', 'existing');

      manager.addFileCreate(validFile, 'valid content');
      manager.addFileCreate(existingFile, 'duplicate content'); // This will fail

      const result = await manager.execute();

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      // Valid file should not exist due to rollback
      let fileExists = true;
      try {
        await fs.access(validFile);
      } catch {
        fileExists = false;
      }
      expect(fileExists).toBe(false);
    });

    it('should fail when creating file that already exists', async () => {
      const manager = new TransactionManager({ maxRetries: 0 });
      const filePath = await createTestFile('existing.txt', 'existing content');

      manager.addFileCreate(filePath, 'new content');
      const result = await manager.execute();

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      // Original content should remain
      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toBe('existing content');
    });
  });

  describe('content update operations', () => {
    it('should update file content', async () => {
      const filePath = await createTestFile('update-test.txt', 'original content');
      const newContent = 'updated content';

      manager.addContentUpdate(filePath, newContent);
      const result = await manager.execute();

      expect(result.success).toBe(true);
      const savedContent = await fs.readFile(filePath, 'utf8');
      expect(savedContent).toBe(newContent);
    });

    it('should rollback content update', async () => {
      const originalContent = 'original content';
      const filePath = await createTestFile('rollback-update.txt', originalContent);
      const newContent = 'updated content';

      manager.addContentUpdate(filePath, newContent);
      await manager.rollback();

      const restoredContent = await fs.readFile(filePath, 'utf8');
      expect(restoredContent).toBe(originalContent);
    });

    it('should create file when updating non-existent file', async () => {
      const filePath = join(testDir, 'non-existent.txt');
      const content = 'new content';

      manager.addContentUpdate(filePath, content);
      const result = await manager.execute();

      expect(result.success).toBe(true);
      const savedContent = await fs.readFile(filePath, 'utf8');
      expect(savedContent).toBe(content);
    });
  });

  describe('file deletion operations', () => {
    it('should delete file', async () => {
      const filePath = await createTestFile('delete-test.txt', 'content to delete');

      manager.addFileDelete(filePath);
      const result = await manager.execute();

      expect(result.success).toBe(true);

      let fileExists = true;
      try {
        await fs.access(filePath);
      } catch {
        fileExists = false;
      }
      expect(fileExists).toBe(false);
    });

    it('should rollback file deletion', async () => {
      const originalContent = 'content to restore';
      const filePath = await createTestFile('rollback-delete.txt', originalContent);

      manager.addFileDelete(filePath);
      await manager.rollback();

      const restoredContent = await fs.readFile(filePath, 'utf8');
      expect(restoredContent).toBe(originalContent);
    });

    it('should handle deletion of non-existent file gracefully', async () => {
      const filePath = join(testDir, 'non-existent.txt');

      manager.addFileDelete(filePath);
      const result = await manager.execute();

      expect(result.success).toBe(true);
    });
  });

  describe('file move operations', () => {
    it('should move file', async () => {
      const originalContent = 'content to move';
      const sourcePath = await createTestFile('source.txt', originalContent);
      const targetPath = join(testDir, 'target.txt');

      manager.addFileMove(sourcePath, targetPath);
      const result = await manager.execute();

      expect(result.success).toBe(true);

      // Source should not exist
      let sourceExists = true;
      try {
        await fs.access(sourcePath);
      } catch {
        sourceExists = false;
      }
      expect(sourceExists).toBe(false);

      // Target should exist with same content
      const targetContent = await fs.readFile(targetPath, 'utf8');
      expect(targetContent).toBe(originalContent);
    });

    it('should rollback file move', async () => {
      const originalContent = 'content to move';
      const sourcePath = await createTestFile('source-rollback.txt', originalContent);
      const targetPath = join(testDir, 'target-rollback.txt');

      manager.addFileMove(sourcePath, targetPath);
      await manager.rollback();

      // Source should still exist
      const sourceContent = await fs.readFile(sourcePath, 'utf8');
      expect(sourceContent).toBe(originalContent);

      // Target should not exist
      let targetExists = true;
      try {
        await fs.access(targetPath);
      } catch {
        targetExists = false;
      }
      expect(targetExists).toBe(false);
    });

    it('should handle move of non-existent file', async () => {
      const manager = new TransactionManager({ maxRetries: 0 });
      const sourcePath = join(testDir, 'non-existent.txt');
      const targetPath = join(testDir, 'target.txt');

      manager.addFileMove(sourcePath, targetPath);
      const result = await manager.execute();

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      // Target should not exist since source didn't exist
      let targetExists = true;
      try {
        await fs.access(targetPath);
      } catch {
        targetExists = false;
      }
      expect(targetExists).toBe(false);
    });
  });

  describe('complex transaction scenarios', () => {
    it('should handle mixed operations in one transaction', async () => {
      const modifyFile = await createTestFile('modify.txt', 'original');
      const deleteFile = await createTestFile('delete.txt', 'delete me');
      const newFile = join(testDir, 'new.txt');
      const moveSource = await createTestFile('move-source.txt', 'move me');
      const moveTarget = join(testDir, 'move-target.txt');

      // Add multiple operations
      manager.addFileCreate(newFile, 'new content');
      manager.addContentUpdate(modifyFile, 'modified content');
      manager.addFileDelete(deleteFile);
      manager.addFileMove(moveSource, moveTarget);

      const result = await manager.execute();

      expect(result.success).toBe(true);
      expect(result.completedSteps).toBe(4);

      // Verify all operations
      const newContent = await fs.readFile(newFile, 'utf8');
      expect(newContent).toBe('new content');

      const modifiedContent = await fs.readFile(modifyFile, 'utf8');
      expect(modifiedContent).toBe('modified content');

      let deleteExists = true;
      try {
        await fs.access(deleteFile);
      } catch {
        deleteExists = false;
      }
      expect(deleteExists).toBe(false);

      const movedContent = await fs.readFile(moveTarget, 'utf8');
      expect(movedContent).toBe('move me');
    });

    it('should get preview of planned operations', async () => {
      const file1 = join(testDir, 'file1.txt');
      const file2 = join(testDir, 'file2.txt');

      manager.addFileCreate(file1, 'content');
      manager.addContentUpdate(file2, 'updated content');

      const preview = manager.getPreview();

      expect(preview).toHaveLength(2);
      expect(preview[0].type).toBe('file-create');
      expect(preview[1].type).toBe('content-update');
    });

    it('should get step count', async () => {
      expect(manager.getStepCount()).toBe(0);

      manager.addFileCreate(join(testDir, 'file.txt'), 'content');
      expect(manager.getStepCount()).toBe(1);

      manager.addFileDelete(join(testDir, 'other.txt'));
      expect(manager.getStepCount()).toBe(2);
    });

    it('should clear all operations', async () => {
      manager.addFileCreate(join(testDir, 'file.txt'), 'content');
      expect(manager.getStepCount()).toBe(1);

      manager.clear();
      expect(manager.getStepCount()).toBe(0);
    });
  });

  describe('transaction options', () => {
    it('should continue on error when configured', async () => {
      const manager = new TransactionManager({ continueOnError: true, maxRetries: 0 });

      const validFile = join(testDir, 'valid.txt');
      const existingFile = await createTestFile('existing.txt', 'existing');

      manager.addFileCreate(validFile, 'valid content');
      manager.addFileCreate(existingFile, 'duplicate content'); // This will fail

      const result = await manager.execute();

      expect(result.success).toBe(false); // Overall failure due to one error
      expect(result.completedSteps).toBe(1); // But one step completed
      expect(result.errors.length).toBeGreaterThan(0);

      // Valid file should exist since we continued on error
      const content = await fs.readFile(validFile, 'utf8');
      expect(content).toBe('valid content');
    });

    it('should create backups when enabled', async () => {
      const manager = new TransactionManager({ createBackups: true });

      const filePath = await createTestFile('backup-test.txt', 'original');
      const newContent = 'updated content';

      manager.addContentUpdate(filePath, newContent);
      const result = await manager.execute();

      expect(result.success).toBe(true);
      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toBe(newContent);
    });

    it('should respect max retries', async () => {
      const manager = new TransactionManager({ maxRetries: 0 });

      // Use a path that should fail on all platforms - invalid characters
      const invalidFile = process.platform === 'win32' 
        ? 'C:\\invalid\\path\\with\\<>:"|?*\\file.txt'  // Invalid Windows characters
        : '/invalid/non/existent/deeply/nested/path/file.txt';  // Non-existent deep path
      
      manager.addFileCreate(invalidFile, 'content');

      const result = await manager.execute();

      expect(result.success).toBe(false);
      expect(result.completedSteps).toBe(0);
    });
  });

  describe('error scenarios', () => {
    it('should handle permission errors gracefully', async () => {
      const manager = new TransactionManager({ maxRetries: 0 });
      const existingFile = await createTestFile('existing.txt', 'existing');

      manager.addFileCreate(existingFile, 'content'); // Try to create existing file
      const result = await manager.execute();

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should generate operation changes', async () => {
      const filePath = join(testDir, 'changes-test.txt');

      manager.addFileCreate(filePath, 'content');
      const result = await manager.execute();

      expect(result.success).toBe(true);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].type).toBe('file-created');
    });

    it('should handle nested directory creation', async () => {
      const nestedPath = join(testDir, 'deep', 'nested', 'file.txt');

      manager.addFileCreate(nestedPath, 'nested content');
      const result = await manager.execute();

      expect(result.success).toBe(true);
      const content = await fs.readFile(nestedPath, 'utf8');
      expect(content).toBe('nested content');
    });
  });
});
