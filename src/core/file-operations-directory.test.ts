import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { FileOperations } from './file-operations.js';
import { PathUtils } from '../utils/path-utils.js';

describe('FileOperations - Directory Move Support', () => {
  let testDir: string;
  let fileOps: FileOperations;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'markmv-dir-test-'));
    fileOps = new FileOperations();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('PathUtils.resolveDestination', () => {
    it('should resolve directory with trailing slash', async () => {
      const destDir = join(testDir, 'target');
      await mkdir(destDir);
      
      const result = PathUtils.resolveDestination('test.md', `${destDir}/`);
      expect(result).toBe(join(destDir, 'test.md'));
    });

    it('should resolve existing directory', async () => {
      const destDir = join(testDir, 'target');
      await mkdir(destDir);
      
      const result = PathUtils.resolveDestination('test.md', destDir);
      expect(result).toBe(join(destDir, 'test.md'));
    });

    it('should preserve filename when moving to directory', () => {
      const result = PathUtils.resolveDestination('docs/readme.md', './target/');
      expect(result.endsWith('readme.md')).toBe(true);
    });

    it('should handle file-to-file moves unchanged', () => {
      const result = PathUtils.resolveDestination('old.md', 'new.md');
      expect(result).toBe(PathUtils.resolvePath('new.md'));
    });
  });

  describe('PathUtils directory detection', () => {
    it('should detect existing directories', async () => {
      const dir = join(testDir, 'test-dir');
      await mkdir(dir);
      
      expect(PathUtils.isDirectory(dir)).toBe(true);
      expect(PathUtils.isDirectory(join(testDir, 'nonexistent'))).toBe(false);
    });

    it('should detect directory-like paths', () => {
      expect(PathUtils.looksLikeDirectory('./path/')).toBe(true);
      expect(PathUtils.looksLikeDirectory('./path\\')).toBe(true);
      expect(PathUtils.looksLikeDirectory('./file.md')).toBe(false);
    });
  });

  describe('moveFile to directory', () => {
    it('should move file to existing directory', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetDir = join(testDir, 'target');
      
      await writeFile(sourceFile, '# Source\n\nContent here.');
      await mkdir(targetDir);
      
      const result = await fileOps.moveFile(sourceFile, targetDir, { dryRun: true });
      
      expect(result.success).toBe(true);
      expect(result.createdFiles).toHaveLength(1);
      expect(result.createdFiles[0]).toBe(join(targetDir, 'source.md'));
      expect(result.deletedFiles).toContain(sourceFile);
    });

    it('should move file to directory with trailing slash', async () => {
      const sourceFile = join(testDir, 'test.md');
      const targetDir = join(testDir, 'docs');
      
      await writeFile(sourceFile, '# Test\n\nContent.');
      await mkdir(targetDir);
      
      const result = await fileOps.moveFile(sourceFile, `${targetDir}/`, { dryRun: true });
      
      expect(result.success).toBe(true);
      expect(result.createdFiles[0]).toBe(join(targetDir, 'test.md'));
    });

    it('should handle relative directory paths', async () => {
      const sourceFile = join(testDir, 'file.md');
      const targetDir = join(testDir, 'subdir');
      
      await writeFile(sourceFile, '# File\n\nContent.');
      await mkdir(targetDir);
      
      // Use relative paths from testDir
      const relativeSource = join(testDir, 'file.md');
      const relativeTarget = './subdir/';
      
      const result = await fileOps.moveFile(relativeSource, relativeTarget, { dryRun: true });
      
      expect(result.success).toBe(true);
      // The result should resolve to the correct absolute path
      expect(result.createdFiles[0]).toContain('file.md');
    });

    it('should preserve filename when moving to directory', async () => {
      const sourceFile = join(testDir, 'important-document.md');
      const targetDir = join(testDir, 'archive');
      
      await writeFile(sourceFile, '# Important Document\n\nVery important content.');
      await mkdir(targetDir);
      
      const result = await fileOps.moveFile(sourceFile, targetDir, { dryRun: true });
      
      expect(result.success).toBe(true);
      expect(result.createdFiles[0]).toBe(join(targetDir, 'important-document.md'));
    });

    it('should handle links when moving to directory', async () => {
      const sourceFile = join(testDir, 'linked.md');
      const referencingFile = join(testDir, 'main.md');
      const targetDir = join(testDir, 'moved');
      
      await writeFile(sourceFile, '# Linked Document\n\nContent here.');
      await writeFile(referencingFile, '# Main\n\nSee [linked document](./linked.md) for details.');
      await mkdir(targetDir);
      
      const result = await fileOps.moveFile(sourceFile, targetDir, { dryRun: true });
      
      expect(result.success).toBe(true);
      expect(result.modifiedFiles).toContain(referencingFile);
      
      // Check that link gets updated correctly
      const linkChanges = result.changes.filter(c => c.type === 'link-updated');
      expect(linkChanges.length).toBeGreaterThan(0);
    });
  });

  describe('moveFiles with directories', () => {
    it('should handle batch moves to directories', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');
      const targetDir = join(testDir, 'batch-target');
      
      await writeFile(file1, '# File 1\n\nContent 1.');
      await writeFile(file2, '# File 2\n\nContent 2.');
      await mkdir(targetDir);
      
      const moves = [
        { source: file1, destination: `${targetDir}/` },
        { source: file2, destination: targetDir }
      ];
      
      const result = await fileOps.moveFiles(moves, { dryRun: true });
      
      expect(result.success).toBe(true);
      expect(result.createdFiles).toHaveLength(2);
      expect(result.createdFiles).toContain(join(targetDir, 'file1.md'));
      expect(result.createdFiles).toContain(join(targetDir, 'file2.md'));
    });

    it('should handle mixed file and directory destinations', async () => {
      const file1 = join(testDir, 'source1.md');
      const file2 = join(testDir, 'source2.md');
      const targetDir = join(testDir, 'dir-dest');
      const targetFile = join(testDir, 'renamed.md');
      
      await writeFile(file1, '# Source 1');
      await writeFile(file2, '# Source 2');
      await mkdir(targetDir);
      
      const moves = [
        { source: file1, destination: targetDir },      // directory destination
        { source: file2, destination: targetFile }      // file destination
      ];
      
      const result = await fileOps.moveFiles(moves, { dryRun: true });
      
      expect(result.success).toBe(true);
      expect(result.createdFiles).toContain(join(targetDir, 'source1.md'));
      expect(result.createdFiles).toContain(targetFile);
    });
  });

  describe('error handling', () => {
    it('should fail gracefully when directory does not exist', async () => {
      const sourceFile = join(testDir, 'source.md');
      const nonexistentDir = join(testDir, 'nonexistent');
      
      await writeFile(sourceFile, '# Source');
      
      // This should treat nonexistent as a file destination (which will fail validation)
      const result = await fileOps.moveFile(sourceFile, nonexistentDir, { dryRun: true });
      
      // Since nonexistent doesn't exist and doesn't end with /, it's treated as a file
      // The validation should fail because it's not a .md file
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Destination must be a markdown file'))).toBe(true);
    });

    it('should validate resolved destination is markdown file', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetDir = join(testDir, 'target');
      
      await writeFile(sourceFile, '# Source');
      await mkdir(targetDir);
      
      // Manually test what happens when we try to move to a directory
      // The resolveDestination should create target/source.md which is valid
      const result = await fileOps.moveFile(sourceFile, targetDir, { dryRun: true });
      
      expect(result.success).toBe(true);
    });
  });

  describe('CLI integration scenarios', () => {
    it('should support common CLI patterns', async () => {
      const sourceFile = join(testDir, 'document.md');
      const docsDir = join(testDir, 'docs');
      
      await writeFile(sourceFile, '# Document\n\nContent.');
      await mkdir(docsDir);
      
      // Test patterns like: markmv move document.md docs/
      const result1 = await fileOps.moveFile(sourceFile, `${docsDir}/`, { dryRun: true });
      expect(result1.success).toBe(true);
      
      // Recreate for next test
      await writeFile(sourceFile, '# Document\n\nContent.');
      
      // Test patterns like: markmv move document.md docs
      const result2 = await fileOps.moveFile(sourceFile, docsDir, { dryRun: true });
      expect(result2.success).toBe(true);
      
      // Both should resolve to the same destination
      expect(result1.createdFiles[0]).toBe(result2.createdFiles[0]);
    });
  });
});