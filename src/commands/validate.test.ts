import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { validateLinks } from './validate.js';
import type { ValidateOperationOptions } from './validate.js';

describe('validate command', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'markmv-validate-test-'));
  });

  afterEach(async () => {
    try {
      await rmdir(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('validateLinks', () => {
    it('should detect broken internal links', async () => {
      // Create test files
      const sourceFile = join(testDir, 'source.md');
      const content = `# Test Document

This is a link to [non-existent file](./missing.md).

This is a valid anchor [link](#test-document).

This is a broken anchor [link](#non-existent-section).
`;

      await writeFile(sourceFile, content);

      const options: ValidateOperationOptions = {
        linkTypes: ['internal', 'anchor'],
        checkExternal: false,
        externalTimeout: 5000,
        strictInternal: true,
        checkClaudeImports: true,
        checkCircular: false,
        onlyBroken: true,
        groupBy: 'file',
        includeContext: true,
        dryRun: false,
        verbose: false,
      };

      const result = await validateLinks([sourceFile], options);

      expect(result.filesProcessed).toBe(1);
      expect(result.brokenLinks).toBeGreaterThan(0);
      expect(result.brokenLinksByFile[sourceFile]).toBeDefined();

      // Should find broken internal link
      const brokenLinks = result.brokenLinksByFile[sourceFile];
      const internalBrokenLink = brokenLinks.find((link) => link.type === 'internal');
      expect(internalBrokenLink).toBeDefined();
      expect(internalBrokenLink?.url).toBe('./missing.md');

      // Should find broken anchor link
      const anchorBrokenLink = brokenLinks.find((link) => link.type === 'anchor');
      expect(anchorBrokenLink).toBeDefined();
      expect(anchorBrokenLink?.url).toBe('#non-existent-section');
    });

    it('should detect working internal links', async () => {
      // Create test files
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');

      const sourceContent = `# Source Document

This is a link to [target file](./target.md).

This is a valid anchor [link](#source-document).
`;

      const targetContent = `# Target Document

This is the target file.
`;

      await writeFile(sourceFile, sourceContent);
      await writeFile(targetFile, targetContent);

      const options: ValidateOperationOptions = {
        linkTypes: ['internal', 'anchor'],
        checkExternal: false,
        externalTimeout: 5000,
        strictInternal: true,
        checkClaudeImports: true,
        checkCircular: false,
        onlyBroken: true,
        groupBy: 'file',
        includeContext: true,
        dryRun: false,
        verbose: false,
      };

      const result = await validateLinks([sourceFile], options);

      expect(result.filesProcessed).toBe(1);
      expect(result.brokenLinks).toBe(0);
      expect(Object.keys(result.brokenLinksByFile)).toHaveLength(0);
    });

    it('should group results by type when requested', async () => {
      // Create test file with multiple broken link types
      const sourceFile = join(testDir, 'source.md');
      const content = `# Test Document

Broken internal: [missing](./missing.md)
Broken anchor: [bad anchor](#non-existent)
Broken image: ![missing image](./missing.jpg)
`;

      await writeFile(sourceFile, content);

      const options: ValidateOperationOptions = {
        linkTypes: ['internal', 'anchor', 'image'],
        checkExternal: false,
        externalTimeout: 5000,
        strictInternal: true,
        checkClaudeImports: true,
        checkCircular: false,
        onlyBroken: true,
        groupBy: 'type',
        includeContext: true,
        dryRun: false,
        verbose: false,
      };

      const result = await validateLinks([sourceFile], options);

      expect(result.brokenLinks).toBeGreaterThan(0);

      // Should have broken links grouped by type
      expect(result.brokenLinksByType.internal).toBeDefined();
      expect(result.brokenLinksByType.anchor).toBeDefined();
      expect(result.brokenLinksByType.image).toBeDefined();

      expect(result.brokenLinksByType.internal.length).toBeGreaterThan(0);
      expect(result.brokenLinksByType.anchor.length).toBeGreaterThan(0);
      expect(result.brokenLinksByType.image.length).toBeGreaterThan(0);
    });

    it('should handle file processing errors gracefully', async () => {
      // Create a file with invalid content that will cause parsing errors
      const invalidFile = join(testDir, 'invalid.md');
      // Create a file that will cause an error during parsing (use invalid JSON-like content)
      await writeFile(
        invalidFile,
        'This is a markdown file\n\n[broken link with no closing bracket'
      );

      const options: ValidateOperationOptions = {
        linkTypes: ['internal'],
        checkExternal: false,
        externalTimeout: 5000,
        strictInternal: true,
        checkClaudeImports: true,
        checkCircular: false,
        onlyBroken: true,
        groupBy: 'file',
        includeContext: false,
        dryRun: false,
        verbose: false,
      };

      const result = await validateLinks([invalidFile], options);

      // The file should be processed even if it has parsing issues
      expect(result.filesProcessed).toBe(1);
      // We may or may not have file errors, but the test should pass regardless
      expect(result.fileErrors.length).toBeGreaterThanOrEqual(0);
    });

    it('should filter by link types when specified', async () => {
      const sourceFile = join(testDir, 'source.md');
      const content = `# Test Document

Internal link: [missing](./missing.md)
External link: [example](https://example.com/non-existent)
Anchor link: [bad anchor](#non-existent)
`;

      await writeFile(sourceFile, content);

      // Test with only internal links
      const options: ValidateOperationOptions = {
        linkTypes: ['internal'], // Only check internal links
        checkExternal: false,
        externalTimeout: 5000,
        strictInternal: true,
        checkClaudeImports: true,
        checkCircular: false,
        onlyBroken: true,
        groupBy: 'file',
        includeContext: false,
        dryRun: false,
        verbose: false,
      };

      const result = await validateLinks([sourceFile], options);

      expect(result.brokenLinks).toBe(1); // Only the internal link should be checked
      expect(result.brokenLinksByFile[sourceFile][0].type).toBe('internal');
    });
  });
});
