import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileUtils } from '../utils/file-utils.js';
import { FileOperations } from './file-operations.js';

describe('FileOperations', () => {
  let fileOps: FileOperations;
  let testDir: string;

  beforeEach(async () => {
    fileOps = new FileOperations();
    testDir = join(tmpdir(), `markmv-ops-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('moveFile', () => {
    it('should move a single markdown file', async () => {
      const sourcePath = join(testDir, 'source.md');
      const destPath = join(testDir, 'dest.md');

      await writeFile(sourcePath, '# Source File\n\nThis is content.');

      const result = await fileOps.moveFile(sourcePath, destPath);

      expect(result.success).toBe(true);
      expect(result.createdFiles).toContain(destPath);
      expect(result.deletedFiles).toContain(sourcePath);
      expect(await FileUtils.exists(destPath)).toBe(true);
      expect(await FileUtils.exists(sourcePath)).toBe(false);
    });

    it('should update links in dependent files', async () => {
      const sourcePath = join(testDir, 'target.md');
      const destPath = join(testDir, 'moved-target.md');
      const dependentPath = join(testDir, 'dependent.md');

      await writeFile(sourcePath, '# Target File');
      await writeFile(
        dependentPath,
        `# Dependent File\n\n[Link to target](./target.md)\n@./target.md`
      );

      const result = await fileOps.moveFile(sourcePath, destPath);

      expect(result.success).toBe(true);
      expect(result.modifiedFiles).toContain(dependentPath);
      expect(result.changes.length).toBeGreaterThan(0);

      const updatedContent = await FileUtils.readTextFile(dependentPath);
      expect(updatedContent).toContain('./moved-target.md');
      expect(updatedContent).toContain('@./moved-target.md');
    });

    it('should handle dry-run mode', async () => {
      const sourcePath = join(testDir, 'source.md');
      const destPath = join(testDir, 'dest.md');

      await writeFile(sourcePath, '# Source File');

      const result = await fileOps.moveFile(sourcePath, destPath, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.createdFiles).toContain(destPath);
      expect(result.deletedFiles).toContain(sourcePath);

      // Files should not actually be moved in dry-run
      expect(await FileUtils.exists(sourcePath)).toBe(true);
      expect(await FileUtils.exists(destPath)).toBe(false);
    });

    it('should handle relative links when moving files', async () => {
      await mkdir(join(testDir, 'docs'));

      const sourcePath = join(testDir, 'source.md');
      const destPath = join(testDir, 'docs', 'source.md');

      await writeFile(sourcePath, '# Source\n\n[Link](./other.md)\n@./config.md');

      const result = await fileOps.moveFile(sourcePath, destPath);

      expect(result.success).toBe(true);

      const updatedContent = await FileUtils.readTextFile(destPath);
      expect(updatedContent).toContain('../other.md');
      expect(updatedContent).toContain('@../config.md');
    });

    it('should validate invalid moves', async () => {
      const result = await fileOps.moveFile('/nonexistent.txt', '/dest.txt');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle complex dependency graphs', async () => {
      // Create a network of interdependent files
      const fileA = join(testDir, 'a.md');
      const fileB = join(testDir, 'b.md');
      const fileC = join(testDir, 'c.md');
      const moved = join(testDir, 'moved-a.md');

      await writeFile(fileA, '# File A\n\n[Link to B](./b.md)');
      await writeFile(fileB, '# File B\n\n[Link to A](./a.md)\n[Link to C](./c.md)');
      await writeFile(fileC, '# File C\n\n[Link to A](./a.md)\n@./a.md');

      const result = await fileOps.moveFile(fileA, moved);

      expect(result.success).toBe(true);
      expect(result.modifiedFiles).toContain(fileB);
      expect(result.modifiedFiles).toContain(fileC);

      const contentB = await FileUtils.readTextFile(fileB);
      const contentC = await FileUtils.readTextFile(fileC);

      expect(contentB).toContain('./moved-a.md');
      expect(contentC).toContain('./moved-a.md');
      expect(contentC).toContain('@./moved-a.md');
    });
  });

  describe('moveFiles', () => {
    it('should move multiple files in one operation', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');
      const dest1 = join(testDir, 'moved1.md');
      const dest2 = join(testDir, 'moved2.md');

      await writeFile(file1, '# File 1\n\n[Link](./file2.md)');
      await writeFile(file2, '# File 2\n\n[Link](./file1.md)');

      const moves = [
        { source: file1, destination: dest1 },
        { source: file2, destination: dest2 },
      ];

      const result = await fileOps.moveFiles(moves);

      expect(result.success).toBe(true);
      expect(result.createdFiles).toEqual([dest1, dest2]);
      expect(result.deletedFiles).toEqual([file1, file2]);

      const content1 = await FileUtils.readTextFile(dest1);
      const content2 = await FileUtils.readTextFile(dest2);

      expect(content1).toContain('./moved2.md');
      expect(content2).toContain('./moved1.md');
    });

    it('should handle dry-run for multiple files', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');
      const dest1 = join(testDir, 'moved1.md');
      const dest2 = join(testDir, 'moved2.md');

      await writeFile(file1, '# File 1');
      await writeFile(file2, '# File 2');

      const moves = [
        { source: file1, destination: dest1 },
        { source: file2, destination: dest2 },
      ];

      const result = await fileOps.moveFiles(moves, { dryRun: true });

      expect(result.success).toBe(true);
      expect(await FileUtils.exists(file1)).toBe(true);
      expect(await FileUtils.exists(file2)).toBe(true);
      expect(await FileUtils.exists(dest1)).toBe(false);
      expect(await FileUtils.exists(dest2)).toBe(false);
    });
  });

  describe('validateOperation', () => {
    it('should validate successful operations', async () => {
      const sourcePath = join(testDir, 'source.md');
      const destPath = join(testDir, 'dest.md');

      await writeFile(sourcePath, '# Source File');

      const result = await fileOps.moveFile(sourcePath, destPath);
      const validation = await fileOps.validateOperation(result);

      expect(validation.valid).toBe(true);
      expect(validation.brokenLinks).toBe(0);
    });
  });
});
