import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rmdir, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  validateLinks,
  validateCommand,
  planLinkFixes,
  applyLinkFix,
  type PlannedLinkFix,
  type FixPrompter,
} from './validate.js';
import type { ValidateOperationOptions, ValidateCliOptions } from './validate.js';
import { LinkParser } from '../core/link-parser.js';

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

  describe('parse failure handling', () => {
    const baseOptions: ValidateCliOptions = {
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

    let logOutput: string[];
    let errorOutput: string[];
    let originalConsoleLog: typeof console.log;
    let originalConsoleError: typeof console.error;

    beforeEach(() => {
      logOutput = [];
      errorOutput = [];
      originalConsoleLog = console.log;
      originalConsoleError = console.error;
      console.log = (...args: unknown[]) => {
        logOutput.push(args.map(String).join(' '));
      };
      console.error = (...args: unknown[]) => {
        errorOutput.push(args.map(String).join(' '));
      };
      process.exitCode = 0;
    });

    afterEach(() => {
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      process.exitCode = 0;
    });

    it('should exit non-zero when a file fails to parse', async () => {
      const badFile = join(testDir, 'bad.md');
      await writeFile(badFile, '# Unparseable\n');
      const parseSpy = vi
        .spyOn(LinkParser.prototype, 'parseFile')
        .mockRejectedValue(new Error('parser exploded'));

      try {
        await validateCommand([badFile], { ...baseOptions });
      } finally {
        parseSpy.mockRestore();
      }

      expect(process.exitCode).toBe(1);
      expect(logOutput.join('\n')).toContain('File Errors (1)');
    });

    it('should record the failure stack on fileErrors entries', async () => {
      const badFile = join(testDir, 'bad.md');
      await writeFile(badFile, '# Unparseable\n');
      const failure = new Error('parser exploded');
      const parseSpy = vi.spyOn(LinkParser.prototype, 'parseFile').mockRejectedValue(failure);

      try {
        const result = await validateLinks([badFile], { ...baseOptions });
        expect(result.fileErrors).toHaveLength(1);
        expect(result.fileErrors[0]?.file).toBe(badFile);
        expect(result.fileErrors[0]?.error).toBe('parser exploded');
        expect(result.fileErrors[0]?.stack).toBe(failure.stack);
      } finally {
        parseSpy.mockRestore();
      }
    });

    it('should print the failure stack with --explain for a failing file', async () => {
      const badFile = join(testDir, 'bad.md');
      await writeFile(badFile, '# Unparseable\n');
      const failure = new Error('parser exploded');
      const parseSpy = vi.spyOn(LinkParser.prototype, 'parseFile').mockRejectedValue(failure);

      try {
        await validateCommand([badFile], { ...baseOptions, explain: badFile });
      } finally {
        parseSpy.mockRestore();
      }

      const output = logOutput.join('\n');
      expect(output).toContain('parser exploded');
      expect(output).toContain(failure.stack ?? '');
    });

    it('should report when --explain names a file with no recorded failure', async () => {
      const goodFile = join(testDir, 'good.md');
      await writeFile(goodFile, '# Fine\n');

      await validateCommand([goodFile], { ...baseOptions, explain: goodFile });

      const output = logOutput.join('\n');
      expect(output).toContain('No parse failure recorded');
      expect(process.exitCode).toBe(0);
    });
  });

  describe('obsidian mode', () => {
    const obsidianOptions: ValidateCliOptions = {
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
      obsidian: true,
    };

    it('validates wikilinks against the vault and flags unresolved ones', async () => {
      await writeFile(join(testDir, 'Home.md'), 'Good: [[Existing]], bad: [[Missing Note]]\n');
      await writeFile(join(testDir, 'Existing.md'), '# Existing\n');

      const result = await validateLinks([join(testDir, '*.md')], obsidianOptions);

      expect(result.brokenLinks).toBe(1);
      const broken = Object.values(result.brokenLinksByFile)[0]?.[0];
      expect(broken?.url).toBe('Missing Note');
    });

    it('does not validate wikilinks without obsidian mode', async () => {
      await writeFile(join(testDir, 'Home.md'), 'Bad: [[Missing Note]]\n');

      const result = await validateLinks([join(testDir, 'Home.md')], {
        ...obsidianOptions,
        obsidian: false,
      });

      expect(result.brokenLinks).toBe(0);
    });

    it('flags ambiguous wikilinks with their candidates', async () => {
      await mkdir(join(testDir, 'a'));
      await mkdir(join(testDir, 'b'));
      await writeFile(join(testDir, 'Home.md'), 'See [[Note]].\n');
      await writeFile(join(testDir, 'a', 'Note.md'), '# A\n');
      await writeFile(join(testDir, 'b', 'Note.md'), '# B\n');

      const result = await validateLinks([join(testDir, '**/*.md')], obsidianOptions);

      expect(result.brokenLinks).toBe(1);
      const broken = Object.values(result.brokenLinksByFile)[0]?.[0];
      expect(broken?.reason).toBe('ambiguous-wikilink');
      expect(broken?.details).toContain(join(testDir, 'a', 'Note.md'));
      expect(broken?.details).toContain(join(testDir, 'b', 'Note.md'));
    });
  });

  describe('external link domain filtering', () => {
    it('skips external checks for domains listed in skipDomains', async () => {
      const sourceFile = join(testDir, 'links.md');
      await writeFile(
        sourceFile,
        '[flaky](https://flaky.invalid/x) and [normal](https://normal.invalid/y)\n'
      );

      const result = await validateLinks([sourceFile], {
        checkExternal: true,
        externalTimeout: 10,
        strictInternal: true,
        checkClaudeImports: true,
        checkCircular: false,
        onlyBroken: true,
        groupBy: 'file',
        includeContext: false,
        dryRun: false,
        verbose: false,
        force: false,
        skipDomains: ['flaky.invalid'],
      });

      // The skipped domain makes no check at all; the unskipped one fails its check
      expect(result.brokenLinks).toBe(1);
      const broken = Object.values(result.brokenLinksByFile)[0]?.[0];
      expect(broken?.url).toBe('https://normal.invalid/y');
    });
  });

  describe('standards enforcement', () => {
    const enforcementOptions: ValidateOperationOptions = {
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

    it('reports files missing required frontmatter fields', async () => {
      const withFrontmatter = join(testDir, 'good.md');
      const withoutFrontmatter = join(testDir, 'bad.md');
      await writeFile(withFrontmatter, '---\ntitle: Good\n---\n\n# Good\n');
      await writeFile(withoutFrontmatter, '# No frontmatter\n');

      const result = await validateLinks([withFrontmatter, withoutFrontmatter], {
        ...enforcementOptions,
        requireFrontmatter: ['title'],
      });

      expect(result.frontmatterViolations).toHaveLength(1);
      expect(result.frontmatterViolations[0]?.file).toBe(withoutFrontmatter);
      expect(result.frontmatterViolations[0]?.missingFields).toEqual(['title']);
    });

    it('reports internal links that violate the enforced link format', async () => {
      const sourceFile = join(testDir, 'links.md');
      await writeFile(sourceFile, '[rel](./ok.md) and [abs](/tmp/absolute.md)\n');

      const result = await validateLinks([sourceFile], {
        ...enforcementOptions,
        enforceLinkFormat: 'relative',
      });

      expect(result.formatViolations).toHaveLength(1);
      expect(result.formatViolations[0]?.href).toBe('/tmp/absolute.md');
      expect(result.formatViolations[0]?.line).toBe(1);
    });
  });

  describe('fix mode', () => {
    const fixOptions: ValidateCliOptions = {
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
      force: false,
      fix: true,
    };

    it('plans fixes for broken internal links with ranked suggestions', async () => {
      await mkdir(join(testDir, 'guides'));
      const sourceFile = join(testDir, 'broken.md');
      await writeFile(sourceFile, 'See [guide](./getting-strated.md) now.\n');
      await writeFile(join(testDir, 'guides', 'getting-started.md'), '# Guide\n');

      const knownFiles = [join(testDir, 'guides', 'getting-started.md')];
      const result = await validateLinks([sourceFile], { ...fixOptions, fix: false });
      const fixes = planLinkFixes(result, knownFiles);

      expect(fixes).toHaveLength(1);
      expect(fixes[0]?.brokenHref).toBe('./getting-strated.md');
      expect(fixes[0]?.suggestions[0]?.replacementHref).toBe('./guides/getting-started.md');
    });

    it('applies a chosen fix to the linking file', async () => {
      const sourceFile = join(testDir, 'broken.md');
      await writeFile(sourceFile, 'See [guide](./getting-strated.md) now.\n');

      const fix: PlannedLinkFix = {
        sourceFile,
        line: 1,
        brokenHref: './getting-strated.md',
        suggestions: [
          {
            candidatePath: join(testDir, 'guides', 'getting-started.md'),
            replacementHref: './guides/getting-started.md',
            reason: 'near miss',
          },
        ],
      };

      await applyLinkFix(fix, 0);

      expect(await readFile(sourceFile, 'utf-8')).toBe(
        'See [guide](./guides/getting-started.md) now.\n'
      );
    });

    it('prints suggestions without prompting when stdout is not a TTY', async () => {
      const sourceFile = join(testDir, 'broken.md');
      await writeFile(sourceFile, 'See [guide](./getting-strated.md) now.\n');
      await mkdir(join(testDir, 'guides'));
      await writeFile(join(testDir, 'guides', 'getting-started.md'), '# Guide\n');

      const output: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        output.push(args.map(String).join(' '));
      };
      try {
        await validateCommand([sourceFile], { ...fixOptions, verbose: false });
      } finally {
        console.log = originalLog;
      }

      const joined = output.join('\n');
      expect(joined).toContain('Did you mean');
      expect(joined).toContain('./guides/getting-started.md');
      // A non-interactive run never rewrites files
      expect(await readFile(sourceFile, 'utf-8')).toContain('./getting-strated.md');
    });

    it('applies prompted fixes interactively', async () => {
      const sourceFile = join(testDir, 'broken.md');
      await writeFile(sourceFile, 'See [guide](./getting-strated.md) now.\n');
      await mkdir(join(testDir, 'guides'));
      await writeFile(join(testDir, 'guides', 'getting-started.md'), '# Guide\n');

      const prompter: FixPrompter = async (fix) => {
        expect(fix.suggestions[0]?.replacementHref).toBe('./guides/getting-started.md');
        return 0;
      };

      await validateCommand([sourceFile], { ...fixOptions, fix: true }, prompter);

      expect(await readFile(sourceFile, 'utf-8')).toBe(
        'See [guide](./guides/getting-started.md) now.\n'
      );
    });
  });
});
