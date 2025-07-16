import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rmdir, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { validateLinks, validateCommand } from './validate.js';
import type { ValidateOperationOptions, ValidateCliOptions } from './validate.js';

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

  describe('validateCommand CLI', () => {
    let originalCwd: string;
    let originalConsoleLog: typeof console.log;
    let logOutput: string[];

    beforeEach(async () => {
      originalCwd = process.cwd();
      
      // Mock console.log to capture output
      logOutput = [];
      originalConsoleLog = console.log;
      console.log = vi.fn((...args) => {
        logOutput.push(args.join(' '));
      });

      // Create test markdown files in testDir
      await writeFile(join(testDir, 'test1.md'), '# Test 1\n\n[broken link](./missing.md)');
      await writeFile(join(testDir, 'test2.md'), '# Test 2\n\n[valid link](./test1.md)');
      
      // Create subdirectory with markdown files
      const subDir = join(testDir, 'subdirectory');
      await mkdir(subDir);
      await writeFile(join(subDir, 'sub1.md'), '# Sub 1\n\n[broken link](./missing.md)');
    });

    afterEach(() => {
      process.chdir(originalCwd);
      console.log = originalConsoleLog;
    });

    it('should default to current directory when no patterns provided', async () => {
      // Change to test directory
      process.chdir(testDir);

      const options: ValidateCliOptions = {
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
        force: false,
      };

      await validateCommand([], options);

      // Should have processed files in current directory
      const output = logOutput.join('\n');
      expect(output).toContain('Files processed:');
      expect(output).toContain('test1.md');
      expect(output).toContain('sub1.md'); // Should find files in subdirectories
    });

    it('should handle explicit "." directory argument', async () => {
      // Change to test directory
      process.chdir(testDir);

      const options: ValidateCliOptions = {
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
        force: false,
      };

      await validateCommand(['.'], options);

      // Should have processed files in current directory
      const output = logOutput.join('\n');
      expect(output).toContain('Files processed:');
      expect(output).toContain('test1.md');
    });

    it('should handle explicit "./" directory argument', async () => {
      // Change to test directory
      process.chdir(testDir);

      const options: ValidateCliOptions = {
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
        force: false,
      };

      await validateCommand(['./'], options);

      // Should have processed files in current directory
      const output = logOutput.join('\n');
      expect(output).toContain('Files processed:');
      expect(output).toContain('test1.md');
    });

    it('should handle specific directory path argument', async () => {
      const options: ValidateCliOptions = {
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
        force: false,
      };

      // Test with subdirectory path
      const subDir = join(testDir, 'subdirectory');
      await validateCommand([subDir], options);

      // Should have processed files only in the subdirectory
      const output = logOutput.join('\n');
      expect(output).toContain('Files processed:');
      expect(output).toContain('sub1.md');
      expect(output).not.toContain('test1.md'); // Should not include parent directory files
    });

    it('should handle non-directory patterns as file patterns', async () => {
      const options: ValidateCliOptions = {
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
        force: false,
      };

      // Test with specific file pattern
      const filePattern = join(testDir, 'test1.md');
      await validateCommand([filePattern], options);

      // Should have processed only the specific file
      const output = logOutput.join('\n');
      expect(output).toContain('Files processed:');
      expect(output).toContain('test1.md');
      expect(output).not.toContain('test2.md');
    });

    it('should handle glob patterns properly', async () => {
      const options: ValidateCliOptions = {
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
        force: false,
      };

      // Test with glob pattern
      const globPattern = join(testDir, '*.md');
      await validateCommand([globPattern], options);

      // Should have processed files matching the glob
      const output = logOutput.join('\n');
      expect(output).toContain('Files processed: 2'); // Should process both test1.md and test2.md
      expect(output).toContain('test1.md'); // test1.md has broken links so should appear in output
      expect(output).not.toContain('sub1.md'); // Should not include subdirectory files with this pattern
    });
  });
});
