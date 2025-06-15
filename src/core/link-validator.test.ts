import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarkdownLink, ParsedMarkdownFile } from '../types/links.js';
import { LinkValidator } from './link-validator.js';

describe('LinkValidator', () => {
  let validator: LinkValidator;
  let testDir: string;

  beforeEach(async () => {
    validator = new LinkValidator();
    testDir = join(tmpdir(), `markmv-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('validateInternalLink', () => {
    it('should validate existing internal links', async () => {
      const targetFile = join(testDir, 'target.md');
      await writeFile(targetFile, '# Target');

      const link: MarkdownLink = {
        type: 'internal',
        href: './target.md',
        line: 1,
        column: 1,
        absolute: false,
        resolvedPath: targetFile,
      };

      const result = await validator.validateLink(link, join(testDir, 'source.md'));
      expect(result).toBeNull();
    });

    it('should detect missing internal links', async () => {
      const link: MarkdownLink = {
        type: 'internal',
        href: './missing.md',
        line: 1,
        column: 1,
        absolute: false,
        resolvedPath: join(testDir, 'missing.md'),
      };

      const result = await validator.validateLink(link, join(testDir, 'source.md'));
      expect(result).toEqual({
        sourceFile: join(testDir, 'source.md'),
        link,
        reason: 'file-not-found',
        details: `File does not exist: ${join(testDir, 'missing.md')}`,
      });
    });
  });

  describe('validateClaudeImportLink', () => {
    it('should validate existing Claude import links', async () => {
      const targetFile = join(testDir, 'target.md');
      await writeFile(targetFile, '# Target');

      const link: MarkdownLink = {
        type: 'claude-import',
        href: './target.md',
        text: '@./target.md',
        line: 1,
        column: 1,
        absolute: false,
        resolvedPath: targetFile,
      };

      const result = await validator.validateLink(link, join(testDir, 'source.md'));
      expect(result).toBeNull();
    });

    it('should detect missing Claude import files', async () => {
      const link: MarkdownLink = {
        type: 'claude-import',
        href: './missing.md',
        text: '@./missing.md',
        line: 1,
        column: 1,
        absolute: false,
        resolvedPath: join(testDir, 'missing.md'),
      };

      const result = await validator.validateLink(link, join(testDir, 'source.md'));
      expect(result).toEqual({
        sourceFile: join(testDir, 'source.md'),
        link,
        reason: 'file-not-found',
        details: `Claude import file does not exist: ${join(testDir, 'missing.md')}`,
      });
    });
  });

  describe('validateFile', () => {
    it('should validate all links in a file', async () => {
      const targetFile = join(testDir, 'target.md');
      await writeFile(targetFile, '# Target');

      const file: ParsedMarkdownFile = {
        filePath: join(testDir, 'source.md'),
        links: [
          {
            type: 'internal',
            href: './target.md',
            line: 1,
            column: 1,
            absolute: false,
            resolvedPath: targetFile,
          },
          {
            type: 'internal',
            href: './missing.md',
            line: 2,
            column: 1,
            absolute: false,
            resolvedPath: join(testDir, 'missing.md'),
          },
        ],
        references: [],
        dependencies: [targetFile],
        dependents: [],
      };

      const result = await validator.validateFile(file);
      expect(result).toHaveLength(1);
      expect(result[0].reason).toBe('file-not-found');
    });
  });

  describe('checkCircularReferences', () => {
    it('should detect circular references', async () => {
      const files: ParsedMarkdownFile[] = [
        {
          filePath: '/project/a.md',
          links: [],
          references: [],
          dependencies: ['/project/b.md'],
          dependents: [],
        },
        {
          filePath: '/project/b.md',
          links: [],
          references: [],
          dependencies: ['/project/a.md'], // Creates cycle
          dependents: [],
        },
      ];

      const cycles = await validator.checkCircularReferences(files);
      expect(cycles).toHaveLength(1);
      expect(cycles[0]).toContain('/project/a.md');
      expect(cycles[0]).toContain('/project/b.md');
    });

    it('should return empty array for acyclic references', async () => {
      const files: ParsedMarkdownFile[] = [
        {
          filePath: '/project/a.md',
          links: [],
          references: [],
          dependencies: ['/project/b.md'],
          dependents: [],
        },
        {
          filePath: '/project/b.md',
          links: [],
          references: [],
          dependencies: [],
          dependents: [],
        },
      ];

      const cycles = await validator.checkCircularReferences(files);
      expect(cycles).toHaveLength(0);
    });
  });

  describe('validateLinkIntegrity', () => {
    it('should provide comprehensive validation results', async () => {
      const targetFile = join(testDir, 'target.md');
      await writeFile(targetFile, '# Target');

      const files: ParsedMarkdownFile[] = [
        {
          filePath: join(testDir, 'source.md'),
          links: [
            {
              type: 'internal',
              href: './target.md',
              line: 1,
              column: 1,
              absolute: false,
              resolvedPath: targetFile,
            },
          ],
          references: [],
          dependencies: [targetFile],
          dependents: [],
        },
      ];

      const result = await validator.validateLinkIntegrity(files);
      expect(result.valid).toBe(true);
      expect(result.circularReferences).toHaveLength(0);
      expect(result.brokenLinks).toHaveLength(0);
    });

    it('should report invalid when circular references are found', async () => {
      const files: ParsedMarkdownFile[] = [
        {
          filePath: '/project/a.md',
          links: [],
          references: [],
          dependencies: ['/project/b.md'],
          dependents: [],
        },
        {
          filePath: '/project/b.md',
          links: [],
          references: [],
          dependencies: ['/project/a.md'],
          dependents: [],
        },
      ];

      const result = await validator.validateLinkIntegrity(files);
      expect(result.valid).toBe(false);
      expect(result.circularReferences).toHaveLength(1);
      expect(result.warnings).toContain('Found 1 circular reference(s)');
    });
  });

  describe('Configuration Options', () => {
    it('should respect strictInternal option when false', async () => {
      const nonStrictValidator = new LinkValidator({ strictInternal: false });
      
      const link: MarkdownLink = {
        type: 'internal',
        href: './missing.md',
        line: 1,
        column: 1,
        absolute: false,
        resolvedPath: join(testDir, 'missing.md'),
      };

      const result = await nonStrictValidator.validateLink(link, join(testDir, 'source.md'));
      expect(result).toBeNull(); // Should not report missing files when strictInternal is false
    });

    it('should skip Claude imports when checkClaudeImports is false', async () => {
      const validator = new LinkValidator({ checkClaudeImports: false });
      
      const link: MarkdownLink = {
        type: 'claude-import',
        href: './missing.md',
        text: '@./missing.md',
        line: 1,
        column: 1,
        absolute: false,
        resolvedPath: join(testDir, 'missing.md'),
      };

      const result = await validator.validateLink(link, join(testDir, 'source.md'));
      expect(result).toBeNull(); // Should skip validation when checkClaudeImports is false
    });

    it('should configure default options correctly', () => {
      const defaultValidator = new LinkValidator();
      expect(defaultValidator).toBeDefined();

      const customValidator = new LinkValidator({
        checkExternal: true,
        externalTimeout: 10000,
        strictInternal: false,
        checkClaudeImports: false
      });
      expect(customValidator).toBeDefined();
    });
  });

  describe('Image Link Validation', () => {
    it('should validate existing internal image links', async () => {
      const imageFile = join(testDir, 'image.png');
      await writeFile(imageFile, 'fake image content');

      const link: MarkdownLink = {
        type: 'image',
        href: './image.png',
        line: 1,
        column: 1,
        absolute: false,
        resolvedPath: imageFile,
      };

      const result = await validator.validateLink(link, join(testDir, 'source.md'));
      expect(result).toBeNull();
    });

    it('should detect missing internal image files', async () => {
      const link: MarkdownLink = {
        type: 'image',
        href: './missing-image.png',
        line: 1,
        column: 1,
        absolute: false,
        resolvedPath: join(testDir, 'missing-image.png'),
      };

      const result = await validator.validateLink(link, join(testDir, 'source.md'));
      expect(result).toEqual({
        sourceFile: join(testDir, 'source.md'),
        link,
        reason: 'file-not-found',
        details: `Image file does not exist: ${join(testDir, 'missing-image.png')}`,
      });
    });

    it('should handle external image links when checkExternal is enabled', async () => {
      // Mock fetch to avoid actual network calls
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      });
      global.fetch = mockFetch;

      const externalValidator = new LinkValidator({ checkExternal: true });
      
      const link: MarkdownLink = {
        type: 'image',
        href: 'https://example.com/image.png',
        line: 1,
        column: 1,
        absolute: false,
      };

      const result = await externalValidator.validateLink(link, join(testDir, 'source.md'));
      expect(result).toBeNull();
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/image.png', {
        method: 'HEAD',
        signal: expect.any(AbortSignal)
      });
    });

    it('should skip external image links when checkExternal is disabled', async () => {
      const link: MarkdownLink = {
        type: 'image',
        href: 'https://example.com/image.png',
        line: 1,
        column: 1,
        absolute: false,
      };

      const result = await validator.validateLink(link, join(testDir, 'source.md'));
      expect(result).toBeNull(); // Should skip external images when checkExternal is false
    });

    it('should handle images with invalid format', async () => {
      const link: MarkdownLink = {
        type: 'image',
        href: './invalid-image.png',
        line: 1,
        column: 1,
        absolute: false,
        resolvedPath: undefined, // Missing resolved path
      };

      const result = await validator.validateLink(link, join(testDir, 'source.md'));
      expect(result).toEqual({
        sourceFile: join(testDir, 'source.md'),
        link,
        reason: 'invalid-format',
        details: 'Could not resolve image path',
      });
    });
  });

  describe('External Link Validation', () => {
    beforeEach(() => {
      // Reset fetch mock before each test
      vi.resetAllMocks();
    });

    it('should validate successful external links', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      });
      global.fetch = mockFetch;

      const externalValidator = new LinkValidator({ checkExternal: true });
      
      const link: MarkdownLink = {
        type: 'external',
        href: 'https://example.com',
        line: 1,
        column: 1,
        absolute: false,
      };

      const result = await externalValidator.validateLink(link, join(testDir, 'source.md'));
      expect(result).toBeNull();
    });

    it('should detect external links with HTTP errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });
      global.fetch = mockFetch;

      const externalValidator = new LinkValidator({ checkExternal: true });
      
      const link: MarkdownLink = {
        type: 'external',
        href: 'https://example.com/not-found',
        line: 1,
        column: 1,
        absolute: false,
      };

      const result = await externalValidator.validateLink(link, join(testDir, 'source.md'));
      expect(result).toEqual({
        sourceFile: join(testDir, 'source.md'),
        link,
        reason: 'external-error',
        details: 'HTTP 404: Not Found',
      });
    });

    it('should handle external link timeouts', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Request timeout'));
      global.fetch = mockFetch;

      const externalValidator = new LinkValidator({ 
        checkExternal: true,
        externalTimeout: 100 // Short timeout for testing
      });
      
      const link: MarkdownLink = {
        type: 'external',
        href: 'https://slow-example.com',
        line: 1,
        column: 1,
        absolute: false,
      };

      const result = await externalValidator.validateLink(link, join(testDir, 'source.md'));
      expect(result).toEqual({
        sourceFile: join(testDir, 'source.md'),
        link,
        reason: 'external-error',
        details: 'Request timeout',
      });
    });

    it('should skip external links when checkExternal is disabled', async () => {
      const link: MarkdownLink = {
        type: 'external',
        href: 'https://example.com',
        line: 1,
        column: 1,
        absolute: false,
      };

      const result = await validator.validateLink(link, join(testDir, 'source.md'));
      expect(result).toBeNull(); // Should skip external links when checkExternal is false
    });
  });

  describe('Special Link Types', () => {
    it('should always validate anchor links as valid', async () => {
      const link: MarkdownLink = {
        type: 'anchor',
        href: '#section-1',
        line: 1,
        column: 1,
        absolute: false,
      };

      const result = await validator.validateLink(link, join(testDir, 'source.md'));
      expect(result).toBeNull(); // Anchor links should always be valid
    });

    it('should always validate reference links as valid', async () => {
      const link: MarkdownLink = {
        type: 'reference',
        href: '[1]',
        line: 1,
        column: 1,
        absolute: false,
      };

      const result = await validator.validateLink(link, join(testDir, 'source.md'));
      expect(result).toBeNull(); // Reference links should always be valid
    });

    it('should handle unknown link types', async () => {
      const link: MarkdownLink = {
        type: 'unknown' as any,
        href: 'unknown://link',
        line: 1,
        column: 1,
        absolute: false,
      };

      const result = await validator.validateLink(link, join(testDir, 'source.md'));
      expect(result).toBeNull(); // Unknown types should return null
    });
  });

  describe('Error Handling', () => {
    it('should handle internal link validation errors', async () => {
      const link: MarkdownLink = {
        type: 'internal',
        href: './missing.md',
        line: 1,
        column: 1,
        absolute: false,
        resolvedPath: undefined, // Missing resolved path
      };

      const result = await validator.validateLink(link, join(testDir, 'source.md'));
      expect(result).toEqual({
        sourceFile: join(testDir, 'source.md'),
        link,
        reason: 'invalid-format',
        details: 'Could not resolve internal link path',
      });
    });

    it('should handle Claude import validation errors', async () => {
      const link: MarkdownLink = {
        type: 'claude-import',
        href: './missing.md',
        text: '@./missing.md',
        line: 1,
        column: 1,
        absolute: false,
        resolvedPath: undefined, // Missing resolved path
      };

      const result = await validator.validateLink(link, join(testDir, 'source.md'));
      expect(result).toEqual({
        sourceFile: join(testDir, 'source.md'),
        link,
        reason: 'invalid-format',
        details: 'Could not resolve Claude import path',
      });
    });
  });

  describe('validateFiles', () => {
    it('should validate multiple files and aggregate results', async () => {
      const targetFile = join(testDir, 'target.md');
      await writeFile(targetFile, '# Target');

      const files: ParsedMarkdownFile[] = [
        {
          filePath: join(testDir, 'source1.md'),
          links: [
            {
              type: 'internal',
              href: './target.md',
              line: 1,
              column: 1,
              absolute: false,
              resolvedPath: targetFile,
            },
          ],
          references: [],
          dependencies: [],
          dependents: [],
        },
        {
          filePath: join(testDir, 'source2.md'),
          links: [
            {
              type: 'internal',
              href: './missing.md',
              line: 1,
              column: 1,
              absolute: false,
              resolvedPath: join(testDir, 'missing.md'),
            },
          ],
          references: [],
          dependencies: [],
          dependents: [],
        },
      ];

      const result = await validator.validateFiles(files);
      expect(result.valid).toBe(false);
      expect(result.filesChecked).toBe(2);
      expect(result.linksChecked).toBe(2);
      expect(result.brokenLinks).toHaveLength(1);
      expect(result.warnings).toEqual([]);
    });
  });
});
