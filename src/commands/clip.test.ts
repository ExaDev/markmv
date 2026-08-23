/**
 * Tests for the web clipper command.
 *
 * @file Comprehensive tests for web page to markdown conversion functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { clipCommand } from './clip.js';
import { WebClipper } from '../core/web-clipper.js';
import type { ClipResult } from '../core/web-clipper.js';

const mockClip = vi.hoisted(() => vi.fn<(url: string) => Promise<ClipResult>>());

// Mock the WebClipper class
vi.mock('../core/web-clipper.js', () => ({
  WebClipper: vi.fn().mockImplementation(() => ({ clip: mockClip })),
}));

/** Mock `process.exit` for the duration of a test and capture the code it was called with. */
function mockProcessExit(): { getExitCode: () => number; restore: () => void } {
  let exitCode = 0;
  const spy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
    exitCode = typeof code === 'number' ? code : 0;
    return undefined as never;
  });

  return {
    getExitCode: () => exitCode,
    restore: () => {
      spy.mockRestore();
    },
  };
}

interface ClipCommandJsonOutput {
  clippedUrls: string[];
  generatedFiles: string[];
}

function isClipCommandJsonOutput(value: unknown): value is ClipCommandJsonOutput {
  if (typeof value !== 'object' || value === null) return false;
  if (!('clippedUrls' in value) || !('generatedFiles' in value)) return false;
  return Array.isArray(value.clippedUrls) && Array.isArray(value.generatedFiles);
}

describe('Clip Command', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'markmv-clip-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('Basic functionality', () => {
    it('should require at least one URL', async () => {
      const { getExitCode, restore } = mockProcessExit();

      const originalError = console.error;
      const errors: string[] = [];
      console.error = vi.fn((message: string) => {
        errors.push(message);
      });

      try {
        await clipCommand([], {});
      } finally {
        restore();
        console.error = originalError;
      }

      expect(getExitCode()).toBe(1);
      expect(errors.some((error) => error.includes('At least one URL must be specified'))).toBe(
        true
      );
    });

    it('should process a single URL successfully', async () => {
      mockClip.mockResolvedValue({
        markdown: '# Test Article\n\nThis is test content.',
        title: 'Test Article',
        author: 'Test Author',
        publishedDate: '2024-01-01',
        description: 'Test description',
        sourceUrl: 'https://example.com/article',
        strategy: 'readability',
        images: [],
        links: [],
      });

      const { getExitCode, restore } = mockProcessExit();

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = vi.fn((message: string) => {
        logs.push(message);
      });

      try {
        await clipCommand(['https://example.com/article'], {
          output: join(testDir, 'article.md'),
          verbose: true,
        });
      } finally {
        restore();
        console.log = originalLog;
      }

      expect(getExitCode()).toBe(0);
      expect(mockClip).toHaveBeenCalledWith('https://example.com/article');

      // Check that file was created
      const content = await readFile(join(testDir, 'article.md'), 'utf-8');
      expect(content).toBe('# Test Article\n\nThis is test content.');

      expect(logs.some((log) => log.includes('Successfully clipped: 1'))).toBe(true);
    });

    it('should handle dry run mode', async () => {
      mockClip.mockResolvedValue({
        markdown: '# Test Article\n\nContent',
        title: 'Test Article',
        sourceUrl: 'https://example.com/article',
        strategy: 'readability',
        images: [],
        links: [],
      });

      const { getExitCode, restore } = mockProcessExit();

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = vi.fn((message: string) => {
        logs.push(message);
      });

      try {
        await clipCommand(['https://example.com/article'], {
          output: join(testDir, 'article.md'),
          dryRun: true,
          verbose: true,
        });
      } finally {
        restore();
        console.log = originalLog;
      }

      expect(getExitCode()).toBe(0);
      expect(logs.some((log) => log.includes('Dry run - no files were actually created'))).toBe(
        true
      );

      // File should not exist in dry run
      try {
        await readFile(join(testDir, 'article.md'), 'utf-8');
        expect.fail('File should not exist in dry run mode');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should output JSON when requested', async () => {
      mockClip.mockResolvedValue({
        markdown: '# Test',
        title: 'Test',
        sourceUrl: 'https://example.com/test',
        strategy: 'readability',
        images: [],
        links: [],
      });

      const { getExitCode, restore } = mockProcessExit();

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = vi.fn((message: string) => {
        logs.push(message);
      });

      try {
        await clipCommand(['https://example.com/test'], {
          output: join(testDir, 'test.md'),
          json: true,
        });
      } finally {
        restore();
        console.log = originalLog;
      }

      expect(getExitCode()).toBe(0);

      // Should output valid JSON
      const jsonOutput = logs.join('\n');
      expect(() => {
        JSON.parse(jsonOutput);
      }).not.toThrow();

      const result: unknown = JSON.parse(jsonOutput);
      if (!isClipCommandJsonOutput(result)) {
        throw new Error('Unexpected JSON output shape');
      }
      expect(result.clippedUrls).toContain('https://example.com/test');
      expect(result.generatedFiles).toContain(join(testDir, 'test.md'));
    });
  });

  describe('Batch processing', () => {
    it('should process multiple URLs from a file', async () => {
      const urlsFile = join(testDir, 'urls.txt');
      await writeFile(
        urlsFile,
        'https://example.com/page1\nhttps://example.com/page2\n# Comment line\n\nhttps://example.com/page3'
      );

      mockClip
        .mockResolvedValueOnce({
          markdown: '# Page 1',
          title: 'Page 1',
          sourceUrl: 'https://example.com/page1',
          strategy: 'readability',
          images: [],
          links: [],
        })
        .mockResolvedValueOnce({
          markdown: '# Page 2',
          title: 'Page 2',
          sourceUrl: 'https://example.com/page2',
          strategy: 'readability',
          images: [],
          links: [],
        })
        .mockResolvedValueOnce({
          markdown: '# Page 3',
          title: 'Page 3',
          sourceUrl: 'https://example.com/page3',
          strategy: 'readability',
          images: [],
          links: [],
        });

      const { getExitCode, restore } = mockProcessExit();

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = vi.fn((message: string) => {
        logs.push(message);
      });

      try {
        await clipCommand([urlsFile], {
          batch: true,
          outputDir: testDir,
          verbose: true,
        });
      } finally {
        restore();
        console.log = originalLog;
      }

      expect(getExitCode()).toBe(0);
      expect(mockClip).toHaveBeenCalledTimes(3);
      expect(mockClip).toHaveBeenCalledWith('https://example.com/page1');
      expect(mockClip).toHaveBeenCalledWith('https://example.com/page2');
      expect(mockClip).toHaveBeenCalledWith('https://example.com/page3');

      expect(logs.some((log) => log.includes('Successfully clipped: 3'))).toBe(true);
    });

    it('should handle mixed valid and invalid URLs in batch mode', async () => {
      const urlsFile = join(testDir, 'mixed-urls.txt');
      await writeFile(
        urlsFile,
        'https://example.com/valid\ninvalid-url\nhttps://example.com/another-valid'
      );

      mockClip
        .mockResolvedValueOnce({
          markdown: '# Valid Page',
          title: 'Valid Page',
          sourceUrl: 'https://example.com/valid',
          strategy: 'readability',
          images: [],
          links: [],
        })
        .mockResolvedValueOnce({
          markdown: '# Another Valid Page',
          title: 'Another Valid Page',
          sourceUrl: 'https://example.com/another-valid',
          strategy: 'readability',
          images: [],
          links: [],
        });

      const { getExitCode, restore } = mockProcessExit();

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = vi.fn((message: string) => {
        logs.push(message);
      });

      try {
        await clipCommand([urlsFile], {
          batch: true,
          outputDir: testDir,
          verbose: true,
        });
      } finally {
        restore();
        console.log = originalLog;
      }

      expect(getExitCode()).toBe(0);
      expect(mockClip).toHaveBeenCalledTimes(2);
      expect(mockClip).toHaveBeenCalledWith('https://example.com/valid');
      expect(mockClip).toHaveBeenCalledWith('https://example.com/another-valid');

      expect(logs.some((log) => log.includes('Successfully clipped: 2'))).toBe(true);
    });
  });

  describe('Option parsing', () => {
    it('should parse and pass WebClipper options correctly', async () => {
      const mockConstructor = vi.mocked(WebClipper);

      mockClip.mockResolvedValue({
        markdown: '# Test',
        sourceUrl: 'https://example.com/test',
        strategy: 'manual',
        images: [],
        links: [],
      });

      const { getExitCode, restore } = mockProcessExit();

      try {
        await clipCommand(['https://example.com/test'], {
          output: join(testDir, 'test.md'),
          strategy: 'manual',
          imageStrategy: 'download',
          imageDir: './custom-images',
          selectors: 'article,.content,main',
          headers: '{"Authorization": "Bearer token"}',
          timeout: 60000,
          userAgent: 'Custom Bot 1.0',
          maxRedirects: 10,
          verbose: true,
          dryRun: false,
        });
      } finally {
        restore();
      }

      expect(getExitCode()).toBe(0);
      expect(mockConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          strategy: 'manual',
          imageStrategy: 'download',
          imageDir: './custom-images',
          selectors: ['article', '.content', 'main'],
          headers: { Authorization: 'Bearer token' },
          timeout: 60000,
          userAgent: 'Custom Bot 1.0',
          maxRedirects: 10,
          verbose: true,
        })
      );
    });

    it('should handle invalid JSON headers gracefully', async () => {
      const { getExitCode, restore } = mockProcessExit();

      const originalError = console.error;
      const errors: string[] = [];
      console.error = vi.fn((message: string) => {
        errors.push(message);
      });

      try {
        await clipCommand(['https://example.com/test'], {
          headers: 'invalid json',
        });
      } finally {
        restore();
        console.error = originalError;
      }

      expect(getExitCode()).toBe(1);
      expect(errors.some((error) => error.includes('Invalid JSON format for headers'))).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle clipping failures gracefully', async () => {
      mockClip.mockRejectedValue(new Error('Failed to fetch URL'));

      const { getExitCode, restore } = mockProcessExit();

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = vi.fn((message: string) => {
        logs.push(message);
      });

      try {
        await clipCommand(['https://invalid-url.example'], {
          output: join(testDir, 'failed.md'),
          verbose: true,
        });
      } finally {
        restore();
        console.log = originalLog;
      }

      expect(getExitCode()).toBe(1);
      expect(logs.some((log) => log.includes('Failed: 1'))).toBe(true);
      expect(logs.some((log) => log.includes('Failed to fetch URL'))).toBe(true);
    });

    it('should continue processing other URLs when one fails', async () => {
      mockClip.mockRejectedValueOnce(new Error('First URL failed')).mockResolvedValueOnce({
        markdown: '# Success',
        sourceUrl: 'https://example.com/success',
        strategy: 'readability',
        images: [],
        links: [],
      });

      const { getExitCode, restore } = mockProcessExit();

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = vi.fn((message: string) => {
        logs.push(message);
      });

      try {
        await clipCommand(['https://fail.example', 'https://example.com/success'], {
          outputDir: testDir,
          verbose: true,
        });
      } finally {
        restore();
        console.log = originalLog;
      }

      expect(getExitCode()).toBe(1); // Should exit with error because one failed
      expect(mockClip).toHaveBeenCalledTimes(2);
      expect(logs.some((log) => log.includes('Successfully clipped: 1'))).toBe(true);
      expect(logs.some((log) => log.includes('Failed: 1'))).toBe(true);
    });
  });

  describe('File output', () => {
    it('should generate appropriate filenames from URLs', async () => {
      mockClip.mockResolvedValue({
        markdown: '# Article',
        sourceUrl: 'https://example.com/path/to/article',
        strategy: 'readability',
        images: [],
        links: [],
      });

      const { getExitCode, restore } = mockProcessExit();

      try {
        await clipCommand(['https://example.com/path/to/article'], {
          outputDir: testDir,
        });
      } finally {
        restore();
      }

      expect(getExitCode()).toBe(0);

      // Should create a file based on the URL path
      const content = await readFile(join(testDir, 'article.md'), 'utf-8');
      expect(content).toBe('# Article');
    });

    it('should use title for filename when available', async () => {
      mockClip.mockResolvedValue({
        markdown: '# My Great Article',
        title: 'My Great Article with Special Characters!',
        sourceUrl: 'https://example.com/article',
        strategy: 'readability',
        images: [],
        links: [],
      });

      const { getExitCode, restore } = mockProcessExit();

      try {
        await clipCommand(['https://example.com/article'], {
          outputDir: testDir,
        });
      } finally {
        restore();
      }

      expect(getExitCode()).toBe(0);

      // Check what file was actually created
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(testDir);
      expect(files.length).toBe(1);

      const content = await readFile(join(testDir, files[0]), 'utf-8');
      expect(content).toBe('# My Great Article');
    });

    it('should create output directories as needed', async () => {
      mockClip.mockResolvedValue({
        markdown: '# Test',
        sourceUrl: 'https://example.com/test',
        strategy: 'readability',
        images: [],
        links: [],
      });

      const nestedDir = join(testDir, 'nested', 'directory');

      const { getExitCode, restore } = mockProcessExit();

      try {
        await clipCommand(['https://example.com/test'], {
          outputDir: nestedDir,
        });
      } finally {
        restore();
      }

      expect(getExitCode()).toBe(0);

      // Should create nested directories and file
      const content = await readFile(join(nestedDir, 'test.md'), 'utf-8');
      expect(content).toBe('# Test');
    });
  });

  describe('Output formatting', () => {
    it('should format results with comprehensive summary', async () => {
      mockClip
        .mockResolvedValueOnce({
          markdown: '# Success 1',
          title: 'Success Article 1',
          author: 'Author 1',
          publishedDate: '2024-01-01',
          sourceUrl: 'https://example.com/success1',
          strategy: 'readability',
          images: [],
          links: [],
        })
        .mockRejectedValueOnce(new Error('Network error'));

      const { getExitCode, restore } = mockProcessExit();

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = vi.fn((message: string) => {
        logs.push(message);
      });

      try {
        await clipCommand(['https://example.com/success1', 'https://example.com/fail'], {
          outputDir: testDir,
          verbose: true,
        });
      } finally {
        restore();
        console.log = originalLog;
      }

      expect(getExitCode()).toBe(1);

      const output = logs.join('\n');
      expect(output).toContain('🕷️  Web Clipper Results');
      expect(output).toContain('Successfully clipped: 1');
      expect(output).toContain('Failed: 1');
      expect(output).toContain('Files generated: 1');
      expect(output).toContain('✅ Successfully Clipped:');
      expect(output).toContain('❌ Failed to Clip:');
      expect(output).toContain('📄 Title: Success Article 1');
      expect(output).toContain('✍️  Author: Author 1');
      expect(output).toContain('📅 Published: 2024-01-01');
      expect(output).toContain('🔧 Strategy: readability');
      expect(output).toContain('Network error');
    });
  });
});
