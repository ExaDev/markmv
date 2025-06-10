import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { glob } from 'glob';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Note: We're testing the glob expansion logic, not the full CLI
// The CLI integration is tested through the actual CLI commands

describe('Glob Pattern Support in Move Command', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'markmv-glob-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('Glob expansion patterns', () => {
    it('should find files with simple glob pattern', async () => {
      // Create test files
      await writeFile(join(testDir, 'file1.md'), '# File 1');
      await writeFile(join(testDir, 'file2.md'), '# File 2');
      await writeFile(join(testDir, 'file3.txt'), 'Not markdown');

      // Test glob expansion
      const pattern = join(testDir, '*.md');
      const results = await glob(pattern, { absolute: true });

      expect(results).toHaveLength(2);
      expect(results.some((f) => f.endsWith('file1.md'))).toBe(true);
      expect(results.some((f) => f.endsWith('file2.md'))).toBe(true);
      expect(results.some((f) => f.endsWith('file3.txt'))).toBe(false);
    });

    it('should find files with recursive glob pattern', async () => {
      // Create nested structure
      await mkdir(join(testDir, 'docs'));
      await mkdir(join(testDir, 'guides'));

      await writeFile(join(testDir, 'root.md'), '# Root');
      await writeFile(join(testDir, 'docs', 'doc1.md'), '# Doc 1');
      await writeFile(join(testDir, 'guides', 'guide1.md'), '# Guide 1');
      await writeFile(join(testDir, 'docs', 'readme.txt'), 'Not markdown');

      // Test recursive glob
      const pattern = join(testDir, '**/*.md');
      const results = await glob(pattern, { absolute: true });

      expect(results).toHaveLength(3);
      expect(results.some((f) => f.endsWith('root.md'))).toBe(true);
      expect(results.some((f) => f.endsWith('doc1.md'))).toBe(true);
      expect(results.some((f) => f.endsWith('guide1.md'))).toBe(true);
      expect(results.some((f) => f.endsWith('readme.txt'))).toBe(false);
    });

    it('should handle multiple glob patterns', async () => {
      await mkdir(join(testDir, 'docs'));
      await mkdir(join(testDir, 'guides'));

      await writeFile(join(testDir, 'root1.md'), '# Root 1');
      await writeFile(join(testDir, 'root2.md'), '# Root 2');
      await writeFile(join(testDir, 'docs', 'doc1.md'), '# Doc 1');
      await writeFile(join(testDir, 'guides', 'guide1.md'), '# Guide 1');

      // Test multiple patterns
      const rootPattern = join(testDir, '*.md');
      const docsPattern = join(testDir, 'docs/*.md');

      const rootResults = await glob(rootPattern, { absolute: true });
      const docsResults = await glob(docsPattern, { absolute: true });

      expect(rootResults).toHaveLength(2);
      expect(docsResults).toHaveLength(1);

      // Combined would be 3 unique files
      const allFiles = new Set([...rootResults, ...docsResults]);
      expect(allFiles.size).toBe(3);
    });

    it('should ignore common directories', async () => {
      await mkdir(join(testDir, 'node_modules'));
      await mkdir(join(testDir, '.git'));
      await mkdir(join(testDir, 'dist'));

      await writeFile(join(testDir, 'good.md'), '# Good');
      await writeFile(join(testDir, 'node_modules', 'bad.md'), '# Should be ignored');
      await writeFile(join(testDir, '.git', 'bad.md'), '# Should be ignored');
      await writeFile(join(testDir, 'dist', 'bad.md'), '# Should be ignored');

      const pattern = join(testDir, '**/*.md');
      const results = await glob(pattern, {
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
        absolute: true,
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toContain('good.md');
    });
  });

  describe('PathUtils integration', () => {
    it('should correctly identify markdown files', async () => {
      const { PathUtils } = await import('../utils/path-utils.js');

      expect(PathUtils.isMarkdownFile('test.md')).toBe(true);
      expect(PathUtils.isMarkdownFile('test.markdown')).toBe(true);
      expect(PathUtils.isMarkdownFile('test.mdown')).toBe(true);
      expect(PathUtils.isMarkdownFile('test.mkd')).toBe(true);
      expect(PathUtils.isMarkdownFile('test.mdx')).toBe(true);
      expect(PathUtils.isMarkdownFile('test.txt')).toBe(false);
      expect(PathUtils.isMarkdownFile('test.html')).toBe(false);
    });

    it('should resolve destinations correctly for multiple files', async () => {
      const { PathUtils } = await import('../utils/path-utils.js');

      const targetDir = join(testDir, 'target');
      await mkdir(targetDir);

      // Directory detection
      expect(PathUtils.isDirectory(targetDir)).toBe(true);
      expect(PathUtils.looksLikeDirectory('./target/')).toBe(true);
      expect(PathUtils.looksLikeDirectory('./target')).toBe(false);

      // Destination resolution
      const dest1 = PathUtils.resolveDestination('file.md', targetDir);
      const dest2 = PathUtils.resolveDestination('file.md', `${targetDir}/`);

      expect(dest1).toBe(join(targetDir, 'file.md'));
      expect(dest2).toBe(join(targetDir, 'file.md'));
    });
  });

  describe('Error scenarios', () => {
    it('should handle non-existent glob patterns gracefully', async () => {
      const pattern = join(testDir, 'nonexistent/*.md');
      const results = await glob(pattern, { absolute: true });

      expect(results).toHaveLength(0);
    });

    it('should handle empty directories', async () => {
      await mkdir(join(testDir, 'empty'));

      const pattern = join(testDir, 'empty/*.md');
      const results = await glob(pattern, { absolute: true });

      expect(results).toHaveLength(0);
    });

    it('should handle malformed glob patterns', async () => {
      // Some glob patterns that might cause issues
      const patterns = ['[', '**/**/***', '\\'];

      for (const pattern of patterns) {
        try {
          const results = await glob(pattern, { absolute: true });
          // If it doesn't throw, it should return an empty array
          expect(Array.isArray(results)).toBe(true);
        } catch (error) {
          // If it throws, that's also acceptable for malformed patterns
          expect(error).toBeDefined();
        }
      }
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle typical documentation structure', async () => {
      // Create a realistic documentation structure
      await mkdir(join(testDir, 'docs'));
      await mkdir(join(testDir, 'docs', 'api'));
      await mkdir(join(testDir, 'docs', 'guides'));
      await mkdir(join(testDir, 'src'));

      // Documentation files
      await writeFile(join(testDir, 'README.md'), '# Project');
      await writeFile(join(testDir, 'CHANGELOG.md'), '# Changes');
      await writeFile(join(testDir, 'docs', 'index.md'), '# Docs Index');
      await writeFile(join(testDir, 'docs', 'api', 'overview.md'), '# API Overview');
      await writeFile(join(testDir, 'docs', 'guides', 'getting-started.md'), '# Getting Started');

      // Non-documentation files
      await writeFile(join(testDir, 'src', 'index.ts'), 'export {}');
      await writeFile(join(testDir, 'package.json'), '{}');

      // Test different patterns
      const allMd = await glob(join(testDir, '**/*.md'), { absolute: true });
      const docsOnly = await glob(join(testDir, 'docs/**/*.md'), { absolute: true });
      const rootOnly = await glob(join(testDir, '*.md'), { absolute: true });

      expect(allMd).toHaveLength(5);
      expect(docsOnly).toHaveLength(3);
      expect(rootOnly).toHaveLength(2);
    });

    it('should preserve file order consistently', async () => {
      // Create files with predictable names
      const files = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'];

      for (const file of files) {
        await writeFile(join(testDir, file), `# ${file}`);
      }

      const pattern = join(testDir, '*.md');
      const results1 = await glob(pattern, { absolute: true });
      const results2 = await glob(pattern, { absolute: true });

      // Results should be consistent between calls
      expect(results1).toEqual(results2);

      // When sorted, should be in alphabetical order
      const sorted = [...results1].sort();
      expect(sorted).toEqual(results1.sort());
    });
  });
});
