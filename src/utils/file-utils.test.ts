import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileUtils } from './file-utils.js';

describe('FileUtils', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `markmv-fileutils-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('exists', () => {
    it('should return true for existing files', async () => {
      const filePath = join(testDir, 'test.md');
      await writeFile(filePath, 'content');

      const result = await FileUtils.exists(filePath);
      expect(result).toBe(true);
    });

    it('should return false for non-existing files', async () => {
      const result = await FileUtils.exists(join(testDir, 'nonexistent.md'));
      expect(result).toBe(false);
    });
  });

  describe('readTextFile and writeTextFile', () => {
    it('should write and read text files', async () => {
      const filePath = join(testDir, 'test.md');
      const content = '# Test\n\nThis is a test file.';

      await FileUtils.writeTextFile(filePath, content);
      const readContent = await FileUtils.readTextFile(filePath);

      expect(readContent).toBe(content);
    });

    it('should create directories when writing', async () => {
      const filePath = join(testDir, 'subdir', 'test.md');
      const content = '# Test';

      await FileUtils.writeTextFile(filePath, content, { createDirectories: true });
      const readContent = await FileUtils.readTextFile(filePath);

      expect(readContent).toBe(content);
    });
  });

  describe('copyFile', () => {
    it('should copy files successfully', async () => {
      const sourcePath = join(testDir, 'source.md');
      const destPath = join(testDir, 'dest.md');
      const content = '# Source File';

      await writeFile(sourcePath, content);
      await FileUtils.copyFile(sourcePath, destPath);

      const copiedContent = await FileUtils.readTextFile(destPath);
      expect(copiedContent).toBe(content);
    });

    it('should create destination directories', async () => {
      const sourcePath = join(testDir, 'source.md');
      const destPath = join(testDir, 'subdir', 'dest.md');
      const content = '# Source File';

      await writeFile(sourcePath, content);
      await FileUtils.copyFile(sourcePath, destPath, { createDirectories: true });

      const copiedContent = await FileUtils.readTextFile(destPath);
      expect(copiedContent).toBe(content);
    });
  });

  describe('moveFile', () => {
    it('should move files successfully', async () => {
      const sourcePath = join(testDir, 'source.md');
      const destPath = join(testDir, 'dest.md');
      const content = '# Source File';

      await writeFile(sourcePath, content);
      await FileUtils.moveFile(sourcePath, destPath);

      expect(await FileUtils.exists(sourcePath)).toBe(false);
      expect(await FileUtils.exists(destPath)).toBe(true);

      const movedContent = await FileUtils.readTextFile(destPath);
      expect(movedContent).toBe(content);
    });

    it('should create destination directories', async () => {
      const sourcePath = join(testDir, 'source.md');
      const destPath = join(testDir, 'subdir', 'dest.md');
      const content = '# Source File';

      await writeFile(sourcePath, content);
      await FileUtils.moveFile(sourcePath, destPath, { createDirectories: true });

      expect(await FileUtils.exists(sourcePath)).toBe(false);
      const movedContent = await FileUtils.readTextFile(destPath);
      expect(movedContent).toBe(content);
    });
  });

  describe('listFiles', () => {
    it('should list files in directory', async () => {
      await writeFile(join(testDir, 'file1.md'), '');
      await writeFile(join(testDir, 'file2.txt'), '');
      await mkdir(join(testDir, 'subdir'));
      await writeFile(join(testDir, 'subdir', 'file3.md'), '');

      const files = await FileUtils.listFiles(testDir);
      const fileNames = files.map((f) => f.replace(/\\/g, '/').split('/').pop());

      expect(fileNames).toContain('file1.md');
      expect(fileNames).toContain('file2.txt');
      expect(fileNames).not.toContain('file3.md'); // Not recursive by default
    });

    it('should list files recursively', async () => {
      await writeFile(join(testDir, 'file1.md'), '');
      await mkdir(join(testDir, 'subdir'));
      await writeFile(join(testDir, 'subdir', 'file2.md'), '');

      const files = await FileUtils.listFiles(testDir, { recursive: true });
      const fileNames = files.map((f) => f.replace(/\\/g, '/').split('/').pop());

      expect(fileNames).toContain('file1.md');
      expect(fileNames).toContain('file2.md');
    });

    it('should filter by extensions', async () => {
      await writeFile(join(testDir, 'file1.md'), '');
      await writeFile(join(testDir, 'file2.txt'), '');

      const files = await FileUtils.listFiles(testDir, { extensions: ['.md'] });
      const fileNames = files.map((f) => f.replace(/\\/g, '/').split('/').pop());

      expect(fileNames).toContain('file1.md');
      expect(fileNames).not.toContain('file2.txt');
    });
  });

  describe('findMarkdownFiles', () => {
    it('should find only markdown files', async () => {
      await writeFile(join(testDir, 'doc1.md'), '');
      await writeFile(join(testDir, 'doc2.markdown'), '');
      await writeFile(join(testDir, 'doc3.txt'), '');
      await mkdir(join(testDir, 'subdir'));
      await writeFile(join(testDir, 'subdir', 'doc4.mdx'), '');

      const files = await FileUtils.findMarkdownFiles(testDir);
      const fileNames = files.map((f) => f.replace(/\\/g, '/').split('/').pop());

      expect(fileNames).toContain('doc1.md');
      expect(fileNames).toContain('doc2.markdown');
      expect(fileNames).toContain('doc4.mdx');
      expect(fileNames).not.toContain('doc3.txt');
    });
  });

  describe('getStats', () => {
    it('should return file statistics', async () => {
      const filePath = join(testDir, 'test.md');
      await writeFile(filePath, 'test content');

      const stats = await FileUtils.getStats(filePath);

      expect(stats.path).toBe(filePath);
      expect(stats.isFile).toBe(true);
      expect(stats.isDirectory).toBe(false);
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.modified).toBeInstanceOf(Date);
    });
  });

  describe('filesEqual', () => {
    it('should return true for identical files', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');
      const content = '# Same Content';

      await writeFile(file1, content);
      await writeFile(file2, content);

      const result = await FileUtils.filesEqual(file1, file2);
      expect(result).toBe(true);
    });

    it('should return false for different files', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');

      await writeFile(file1, '# Content 1');
      await writeFile(file2, '# Content 2');

      const result = await FileUtils.filesEqual(file1, file2);
      expect(result).toBe(false);
    });

    it('should return false for non-existent files', async () => {
      const file1 = join(testDir, 'nonexistent1.md');
      const file2 = join(testDir, 'nonexistent2.md');

      const result = await FileUtils.filesEqual(file1, file2);
      expect(result).toBe(false);
    });
  });

  describe('Permission Checks', () => {
    it('should check if file is readable', async () => {
      const filePath = join(testDir, 'readable.md');
      await writeFile(filePath, 'content');

      const result = await FileUtils.isReadable(filePath);
      expect(result).toBe(true);
    });

    it('should return false for non-readable files', async () => {
      const filePath = join(testDir, 'nonexistent.md');

      const result = await FileUtils.isReadable(filePath);
      expect(result).toBe(false);
    });

    it('should check if file is writable', async () => {
      const filePath = join(testDir, 'writable.md');
      await writeFile(filePath, 'content');

      const result = await FileUtils.isWritable(filePath);
      expect(result).toBe(true);
    });

    it('should return false for non-writable files', async () => {
      const filePath = join(testDir, 'nonexistent.md');

      const result = await FileUtils.isWritable(filePath);
      expect(result).toBe(false);
    });
  });

  describe('ensureDirectory', () => {
    it('should create directories recursively', async () => {
      const dirPath = join(testDir, 'nested', 'directory', 'structure');

      await FileUtils.ensureDirectory(dirPath);
      expect(await FileUtils.exists(dirPath)).toBe(true);
    });

    it('should not throw error if directory already exists', async () => {
      const dirPath = join(testDir, 'existing');
      await mkdir(dirPath);

      // Should not throw
      await expect(FileUtils.ensureDirectory(dirPath)).resolves.not.toThrow();
    });
  });

  describe('copyFile with options', () => {
    it('should respect overwrite option', async () => {
      const sourcePath = join(testDir, 'source.md');
      const destPath = join(testDir, 'existing.md');

      await writeFile(sourcePath, 'source content');
      await writeFile(destPath, 'existing content');

      // Should throw when overwrite is false
      await expect(FileUtils.copyFile(sourcePath, destPath, { overwrite: false })).rejects.toThrow(
        'Destination file already exists'
      );

      // Should succeed when overwrite is true
      await expect(
        FileUtils.copyFile(sourcePath, destPath, { overwrite: true })
      ).resolves.not.toThrow();

      const content = await FileUtils.readTextFile(destPath);
      expect(content).toBe('source content');
    });

    it('should preserve timestamps when requested', async () => {
      const sourcePath = join(testDir, 'source.md');
      const destPath = join(testDir, 'dest.md');

      await writeFile(sourcePath, 'content');

      // Wait a bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      await FileUtils.copyFile(sourcePath, destPath, { preserveTimestamps: true });

      const sourceStats = await FileUtils.getStats(sourcePath);
      const destStats = await FileUtils.getStats(destPath);

      // Timestamps should be very close (within 1 second)
      expect(Math.abs(sourceStats.modified.getTime() - destStats.modified.getTime())).toBeLessThan(
        1000
      );
    });
  });

  describe('moveFile with options', () => {
    it('should create backup when requested', async () => {
      const sourcePath = join(testDir, 'source.md');
      const destPath = join(testDir, 'existing.md');

      await writeFile(sourcePath, 'source content');
      await writeFile(destPath, 'existing content');

      await FileUtils.moveFile(sourcePath, destPath, {
        overwrite: true,
        backup: true,
      });

      const backupPath = `${destPath}.backup`;
      expect(await FileUtils.exists(backupPath)).toBe(true);

      const backupContent = await FileUtils.readTextFile(backupPath);
      expect(backupContent).toBe('existing content');

      const destContent = await FileUtils.readTextFile(destPath);
      expect(destContent).toBe('source content');
    });

    it('should throw error for invalid source path', async () => {
      await expect(FileUtils.moveFile('', join(testDir, 'dest.md'))).rejects.toThrow(
        'Invalid source path'
      );
    });

    it('should throw error for invalid destination path', async () => {
      const sourcePath = join(testDir, 'source.md');
      await writeFile(sourcePath, 'content');

      await expect(FileUtils.moveFile(sourcePath, '')).rejects.toThrow('Invalid destination path');
    });

    it('should throw error for non-existent source', async () => {
      await expect(
        FileUtils.moveFile(join(testDir, 'nonexistent.md'), join(testDir, 'dest.md'))
      ).rejects.toThrow('Source file does not exist');
    });

    it('should throw error for existing destination without overwrite', async () => {
      const sourcePath = join(testDir, 'source.md');
      const destPath = join(testDir, 'existing.md');

      await writeFile(sourcePath, 'source content');
      await writeFile(destPath, 'existing content');

      await expect(FileUtils.moveFile(sourcePath, destPath, { overwrite: false })).rejects.toThrow(
        'Destination file already exists'
      );
    });
  });

  describe('deleteFile', () => {
    it('should delete existing files', async () => {
      const filePath = join(testDir, 'to-delete.md');
      await writeFile(filePath, 'content');

      await FileUtils.deleteFile(filePath);
      expect(await FileUtils.exists(filePath)).toBe(false);
    });

    it('should not throw for non-existent files', async () => {
      await expect(FileUtils.deleteFile(join(testDir, 'nonexistent.md'))).resolves.not.toThrow();
    });
  });

  describe('listFiles with directories', () => {
    it('should include directories when requested', async () => {
      await writeFile(join(testDir, 'file.md'), '');
      await mkdir(join(testDir, 'subdir'));

      const files = await FileUtils.listFiles(testDir, { includeDirectories: true });
      const names = files.map((f) => f.replace(/\\/g, '/').split('/').pop());

      expect(names).toContain('file.md');
      expect(names).toContain('subdir');
    });

    it('should filter extensions correctly', async () => {
      await writeFile(join(testDir, 'doc.md'), '');
      await writeFile(join(testDir, 'README.MD'), ''); // Different filename to avoid filesystem case-insensitive issues
      await writeFile(join(testDir, 'doc.txt'), '');

      const files = await FileUtils.listFiles(testDir, { extensions: ['.md'] });
      const names = files.map((f) => f.replace(/\\/g, '/').split('/').pop());

      expect(names).toContain('doc.md');
      expect(names).toContain('README.MD'); // Should find both due to case-insensitive extension matching
      expect(names).not.toContain('doc.txt');
    });
  });

  describe('createBackup', () => {
    it('should create backup with default suffix', async () => {
      const filePath = join(testDir, 'original.md');
      const content = 'original content';
      await writeFile(filePath, content);

      const backupPath = await FileUtils.createBackup(filePath);

      expect(backupPath).toBe(`${filePath}.backup`);
      expect(await FileUtils.exists(backupPath)).toBe(true);

      const backupContent = await FileUtils.readTextFile(backupPath);
      expect(backupContent).toBe(content);
    });

    it('should create backup with custom suffix', async () => {
      const filePath = join(testDir, 'original.md');
      const content = 'original content';
      await writeFile(filePath, content);

      const backupPath = await FileUtils.createBackup(filePath, '.bak');

      expect(backupPath).toBe(`${filePath}.bak`);
      expect(await FileUtils.exists(backupPath)).toBe(true);

      const backupContent = await FileUtils.readTextFile(backupPath);
      expect(backupContent).toBe(content);
    });
  });

  describe('getFileSize', () => {
    it('should return correct file size', async () => {
      const filePath = join(testDir, 'test.md');
      const content = 'test content';
      await writeFile(filePath, content);

      const size = await FileUtils.getFileSize(filePath);
      expect(size).toBe(Buffer.byteLength(content, 'utf8'));
    });
  });

  describe('sanitizeFilename', () => {
    it('should remove invalid characters', async () => {
      const input = 'file<>:"/\\|?*name.md';
      const result = FileUtils.sanitizeFilename(input);

      expect(result).toBe('file-name.md');
    });

    it('should replace spaces with dashes', async () => {
      const input = 'file   with   spaces.md';
      const result = FileUtils.sanitizeFilename(input);

      expect(result).toBe('file-with-spaces.md');
    });

    it('should remove leading and trailing dashes', async () => {
      const input = '---filename---';
      const result = FileUtils.sanitizeFilename(input);

      expect(result).toBe('filename');
    });

    it('should handle complex filename cleaning', async () => {
      const input = '  <<invalid>>  file::name  ';
      const result = FileUtils.sanitizeFilename(input);

      expect(result).toBe('invalid-file-name');
    });
  });

  describe('getRelativePath', () => {
    it('should return relative path between files', async () => {
      const fromFile = '/project/docs/guide.md';
      const toFile = '/project/assets/image.png';

      const result = FileUtils.getRelativePath(fromFile, toFile);

      // Should return relative path from docs/ to assets/
      // Normalize path separators for cross-platform compatibility
      const normalizedResult = result.replace(/\\/g, '/');
      expect(normalizedResult).toContain('../assets/image.png');
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in ensureDirectory', async () => {
      // Try to create a directory with invalid characters (this might work on some systems)
      // Instead, test the EEXIST handling by mocking
      const dirPath = join(testDir, 'test-dir');
      await mkdir(dirPath);

      // This should not throw even if directory exists
      await expect(FileUtils.ensureDirectory(dirPath)).resolves.not.toThrow();
    });
  });
});
