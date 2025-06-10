import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LinkValidator } from './link-validator.js';
import type { ParsedMarkdownFile, MarkdownLink } from '../types/links.js';

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
  });
});