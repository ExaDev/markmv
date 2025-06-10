import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { indexCommand } from './index';
import { FileUtils } from '../utils/file-utils';

// Mock FileUtils
vi.mock('../utils/file-utils');
const mockFileUtils = vi.mocked(FileUtils);

// Mock glob
vi.mock('glob', () => ({
  glob: vi.fn(),
}));

import { glob } from 'glob';
const mockGlob = vi.mocked(glob);

// Mock fs functions
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
}));

import { existsSync, statSync } from 'node:fs';
const mockExistsSync = vi.mocked(existsSync);
const mockStatSync = vi.mocked(statSync);

describe('Index Command', () => {
  const testDir = '/test/directory';
  const mockStats = { isDirectory: () => true };

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue(mockStats as any);
  });

  describe('CLI Options Processing', () => {
    it('should process default CLI options correctly', async () => {
      mockGlob.mockResolvedValue([]);
      mockFileUtils.writeTextFile = vi.fn().mockResolvedValue(undefined);

      const cliOptions = {
        type: 'links',
        strategy: 'directory',
        location: 'root',
        name: 'index.md',
        dryRun: true,
      };

      await expect(indexCommand(testDir, cliOptions)).resolves.not.toThrow();
    });

    it('should handle embed style options', async () => {
      mockGlob.mockResolvedValue([]);
      mockFileUtils.writeTextFile = vi.fn().mockResolvedValue(undefined);

      const cliOptions = {
        type: 'embed',
        embedStyle: 'obsidian',
        dryRun: true,
      };

      await expect(indexCommand(testDir, cliOptions)).resolves.not.toThrow();
    });
  });

  describe('Index Generation Types', () => {
    const sampleFiles = ['/test/directory/file1.md', '/test/directory/file2.md'];

    const sampleContent1 = `---
title: "First Document"
description: "This is the first document"
category: "guides"
order: 1
---

# First Document Content`;

    const sampleContent2 = `---
title: "Second Document"
description: "This is the second document"
category: "guides"
order: 2
---

# Second Document Content`;

    beforeEach(() => {
      mockGlob.mockResolvedValue(sampleFiles);
      mockFileUtils.readTextFile = vi
        .fn()
        .mockResolvedValueOnce(sampleContent1)
        .mockResolvedValueOnce(sampleContent2);
      mockFileUtils.writeTextFile = vi.fn().mockResolvedValue(undefined);
    });

    it('should generate links type index correctly', async () => {
      const cliOptions = {
        type: 'links',
        strategy: 'directory',
        location: 'root',
        dryRun: true,
        verbose: true,
      };

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await indexCommand(testDir, cliOptions);

      const logCalls = consoleSpy.mock.calls;
      const contentCall = logCalls.find((call) => call[0] === 'Content:');
      expect(contentCall).toBeDefined();

      // Check the next call after "Content:" for the actual content
      const contentIndex = logCalls.findIndex((call) => call[0] === 'Content:');
      const actualContent = logCalls[contentIndex + 1][0];

      expect(actualContent).toContain('- [First Document](file1.md) - This is the first document');
      expect(actualContent).toContain(
        '- [Second Document](file2.md) - This is the second document'
      );

      consoleSpy.mockRestore();
    });

    it('should generate import type index correctly', async () => {
      const cliOptions = {
        type: 'import',
        strategy: 'directory',
        location: 'root',
        dryRun: true,
        verbose: true,
      };

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await indexCommand(testDir, cliOptions);

      const logCalls = consoleSpy.mock.calls;
      const contentIndex = logCalls.findIndex((call) => call[0] === 'Content:');
      const actualContent = logCalls[contentIndex + 1][0];

      expect(actualContent).toContain('@file1.md');
      expect(actualContent).toContain('@file2.md');
      expect(actualContent).toContain('### First Document');
      expect(actualContent).toContain('### Second Document');

      consoleSpy.mockRestore();
    });

    it('should generate Obsidian embed type index correctly', async () => {
      const cliOptions = {
        type: 'embed',
        embedStyle: 'obsidian',
        strategy: 'directory',
        location: 'root',
        dryRun: true,
        verbose: true,
      };

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await indexCommand(testDir, cliOptions);

      const logCalls = consoleSpy.mock.calls;
      const contentIndex = logCalls.findIndex((call) => call[0] === 'Content:');
      const actualContent = logCalls[contentIndex + 1][0];

      expect(actualContent).toContain('![[file1.md]]');
      expect(actualContent).toContain('![[file2.md]]');
      expect(actualContent).toContain('### First Document');
      expect(actualContent).toContain('### Second Document');

      consoleSpy.mockRestore();
    });

    it('should generate markdown embed type index correctly', async () => {
      const cliOptions = {
        type: 'embed',
        embedStyle: 'markdown',
        strategy: 'directory',
        location: 'root',
        dryRun: true,
        verbose: true,
      };

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await indexCommand(testDir, cliOptions);

      const logCalls = consoleSpy.mock.calls;
      const contentIndex = logCalls.findIndex((call) => call[0] === 'Content:');
      const actualContent = logCalls[contentIndex + 1][0];

      expect(actualContent).toContain('![First Document](file1.md)');
      expect(actualContent).toContain('![Second Document](file2.md)');

      consoleSpy.mockRestore();
    });

    it('should generate hybrid type index correctly', async () => {
      const cliOptions = {
        type: 'hybrid',
        strategy: 'directory',
        location: 'root',
        dryRun: true,
        verbose: true,
      };

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await indexCommand(testDir, cliOptions);

      const logCalls = consoleSpy.mock.calls;
      const contentIndex = logCalls.findIndex((call) => call[0] === 'Content:');
      const actualContent = logCalls[contentIndex + 1][0];

      expect(actualContent).toContain('### [First Document](file1.md)');
      expect(actualContent).toContain('> This is the first document');
      expect(actualContent).toContain('### [Second Document](file2.md)');
      expect(actualContent).toContain('> This is the second document');

      consoleSpy.mockRestore();
    });
  });

  describe('Organization Strategies', () => {
    const sampleFiles = [
      '/test/directory/guides/setup.md',
      '/test/directory/guides/usage.md',
      '/test/directory/api/reference.md',
    ];

    beforeEach(() => {
      mockGlob.mockResolvedValue(sampleFiles);
      mockFileUtils.readTextFile = vi.fn().mockResolvedValue('# Test Content');
      mockFileUtils.writeTextFile = vi.fn().mockResolvedValue(undefined);
    });

    it('should organize by directory structure', async () => {
      const cliOptions = {
        type: 'links',
        strategy: 'directory',
        location: 'root',
        dryRun: true,
        verbose: true,
      };

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await indexCommand(testDir, cliOptions);

      const logCalls = consoleSpy.mock.calls;
      const contentIndex = logCalls.findIndex((call) => call[0] === 'Content:');
      const actualContent = logCalls[contentIndex + 1][0];

      expect(actualContent).toContain('## Guides');
      expect(actualContent).toContain('## Api');

      consoleSpy.mockRestore();
    });

    it('should organize by metadata category', async () => {
      const contentWithCategory = `---
title: "API Guide"
category: "API Documentation"
---

# Content`;

      mockFileUtils.readTextFile = vi.fn().mockResolvedValue(contentWithCategory);

      const cliOptions = {
        type: 'links',
        strategy: 'metadata',
        location: 'root',
        dryRun: true,
        verbose: true,
      };

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await indexCommand(testDir, cliOptions);

      const logCalls = consoleSpy.mock.calls;
      const contentIndex = logCalls.findIndex((call) => call[0] === 'Content:');
      const actualContent = logCalls[contentIndex + 1][0];

      expect(actualContent).toContain('## API Documentation');

      consoleSpy.mockRestore();
    });
  });

  describe('Frontmatter Extraction', () => {
    it('should extract metadata from frontmatter correctly', async () => {
      const contentWithFullFrontmatter = `---
title: "Complete Guide"
description: "A comprehensive guide"
category: "documentation"
order: 5
tags: [guide, documentation, help]
---

# Guide Content`;

      mockGlob.mockResolvedValue(['/test/directory/guide.md']);
      mockFileUtils.readTextFile = vi.fn().mockResolvedValue(contentWithFullFrontmatter);
      mockFileUtils.writeTextFile = vi.fn().mockResolvedValue(undefined);

      const cliOptions = {
        type: 'links',
        strategy: 'metadata',
        location: 'root',
        dryRun: true,
        verbose: true,
      };

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await indexCommand(testDir, cliOptions);

      const logCalls = consoleSpy.mock.calls;
      const contentIndex = logCalls.findIndex((call) => call[0] === 'Content:');
      const actualContent = logCalls[contentIndex + 1][0];

      expect(actualContent).toContain('- [Complete Guide](guide.md) - A comprehensive guide');
      expect(actualContent).toContain('## Documentation');

      consoleSpy.mockRestore();
    });

    it('should handle files without frontmatter', async () => {
      const contentWithoutFrontmatter = `# Simple Document

Just plain content.`;

      mockGlob.mockResolvedValue(['/test/directory/simple.md']);
      mockFileUtils.readTextFile = vi.fn().mockResolvedValue(contentWithoutFrontmatter);
      mockFileUtils.writeTextFile = vi.fn().mockResolvedValue(undefined);

      const cliOptions = {
        type: 'links',
        strategy: 'metadata',
        location: 'root',
        dryRun: true,
        verbose: true,
      };

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await indexCommand(testDir, cliOptions);

      const logCalls = consoleSpy.mock.calls;
      const contentIndex = logCalls.findIndex((call) => call[0] === 'Content:');
      const actualContent = logCalls[contentIndex + 1][0];

      expect(actualContent).toContain('## Uncategorized');
      expect(actualContent).toContain('- [simple](simple.md)');

      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should throw error for non-existent directory', async () => {
      mockExistsSync.mockReturnValue(false);

      const cliOptions = { type: 'links', dryRun: true };

      await expect(indexCommand('/nonexistent', cliOptions)).rejects.toThrow('Directory not found');
    });

    it('should throw error for non-directory path', async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ isDirectory: () => false } as any);

      const cliOptions = { type: 'links', dryRun: true };

      await expect(indexCommand('/test/file.md', cliOptions)).rejects.toThrow(
        'Path is not a directory'
      );
    });

    it('should handle file read errors gracefully', async () => {
      mockGlob.mockResolvedValue(['/test/directory/error.md']);
      mockFileUtils.readTextFile = vi.fn().mockRejectedValue(new Error('Read failed'));
      mockFileUtils.writeTextFile = vi.fn().mockResolvedValue(undefined);

      const cliOptions = {
        type: 'links',
        location: 'root',
        dryRun: true,
        verbose: true,
      };

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(indexCommand(testDir, cliOptions)).resolves.not.toThrow();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Could not read file'),
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });

  describe('File Writing', () => {
    beforeEach(() => {
      mockGlob.mockResolvedValue([]);
      mockFileUtils.writeTextFile = vi.fn().mockResolvedValue(undefined);
    });

    it('should write index file when not in dry-run mode', async () => {
      const cliOptions = {
        type: 'links',
        location: 'root',
        dryRun: false,
      };

      await indexCommand(testDir, cliOptions);

      expect(mockFileUtils.writeTextFile).toHaveBeenCalledWith(
        join(testDir, 'index.md'),
        expect.stringContaining('# Documentation Index'),
        { createDirectories: true }
      );
    });

    it('should not write files in dry-run mode', async () => {
      const cliOptions = {
        type: 'links',
        location: 'root',
        dryRun: true,
      };

      await indexCommand(testDir, cliOptions);

      expect(mockFileUtils.writeTextFile).not.toHaveBeenCalled();
    });
  });
});
