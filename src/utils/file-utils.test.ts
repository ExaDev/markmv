import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
      const fileNames = files.map(f => f.split('/').pop());

      expect(fileNames).toContain('file1.md');
      expect(fileNames).toContain('file2.txt');
      expect(fileNames).not.toContain('file3.md'); // Not recursive by default
    });

    it('should list files recursively', async () => {
      await writeFile(join(testDir, 'file1.md'), '');
      await mkdir(join(testDir, 'subdir'));
      await writeFile(join(testDir, 'subdir', 'file2.md'), '');

      const files = await FileUtils.listFiles(testDir, { recursive: true });
      const fileNames = files.map(f => f.split('/').pop());

      expect(fileNames).toContain('file1.md');
      expect(fileNames).toContain('file2.md');
    });

    it('should filter by extensions', async () => {
      await writeFile(join(testDir, 'file1.md'), '');
      await writeFile(join(testDir, 'file2.txt'), '');

      const files = await FileUtils.listFiles(testDir, { extensions: ['.md'] });
      const fileNames = files.map(f => f.split('/').pop());

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
      const fileNames = files.map(f => f.split('/').pop());

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
  });
});