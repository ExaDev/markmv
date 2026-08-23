import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refactorIndex, refactorIndexCommand } from './refactor-index.js';
import type { RefactorIndexResult } from './refactor-index.js';

function parseJsonPayload<T>(json: string): T {
  return JSON.parse(json) as T;
}

// Mock console methods to capture output
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
vi.spyOn(console, 'warn').mockImplementation(() => undefined);

// Mock process.exit to prevent actual process termination
const mockProcessExit = vi
  .spyOn(process, 'exit')
  .mockImplementation((code?: string | number | null) => {
    throw new Error(`Process exit called with code ${code}`);
  });

describe('refactorIndex', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a unique test directory
    testDir = join(
      tmpdir(),
      `markmv-refactor-index-test-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    );
    mkdirSync(testDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up test files
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Index convention conversion', () => {
    it('renames README.md to index.md by default, rewriting inbound links and preserving content byte-for-byte', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir);
      const readmePath = join(docsDir, 'README.md');
      const indexPath = join(docsDir, 'index.md');
      const bystanderPath = join(docsDir, 'other.md');
      // Internal links that already carry an explicit ./ or ../ prefix keep their exact form through the move machinery's rewrite, so the file's bytes survive untouched
      const readmeContent =
        '# Guide\n\nSee the [website](https://example.com) and the [intro](#guide).\n\n[Home](../home.md)\n';

      writeFileSync(readmePath, readmeContent);
      writeFileSync(bystanderPath, '# Other\n\n[read the guide](./README.md)\n');

      const result = await refactorIndex(readmePath);

      expect(result.success).toBe(true);
      expect(result.sourcePath).toBe(readmePath);
      expect(result.targetPath).toBe(indexPath);
      expect(result.errors).toEqual([]);

      // The file is renamed in place: new name present, old name gone
      expect(existsSync(indexPath)).toBe(true);
      expect(existsSync(readmePath)).toBe(false);

      // Content is preserved byte-for-byte: the command never reformats the file itself
      expect(readFileSync(indexPath, 'utf-8')).toBe(readmeContent);

      // Inbound links are rewritten to the new name
      expect(readFileSync(bystanderPath, 'utf-8')).toBe(
        '# Other\n\n[read the guide](./index.md)\n'
      );

      expect(result.linksUpdated).toBe(1);
      expect(result.filesWithUpdatedLinks).toEqual([bystanderPath]);
    });

    it('converts index.md to README.md when the readme convention is requested explicitly', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir);
      const indexPath = join(docsDir, 'index.md');
      const readmePath = join(docsDir, 'README.md');
      const bystanderPath = join(docsDir, 'guide.md');
      const indexContent = '# Docs\n\nPlain content, no links.\n';

      writeFileSync(indexPath, indexContent);
      writeFileSync(bystanderPath, '[start here](index.md)\n');

      const result = await refactorIndex(indexPath, { to: 'readme' });

      expect(result.success).toBe(true);
      expect(result.targetPath).toBe(readmePath);
      expect(existsSync(readmePath)).toBe(true);
      expect(existsSync(indexPath)).toBe(false);
      expect(readFileSync(readmePath, 'utf-8')).toBe(indexContent);
      expect(readFileSync(bystanderPath, 'utf-8')).toBe('[start here](./README.md)\n');
    });
  });

  describe('Dry run', () => {
    it('leaves the tree untouched while reporting the planned rename and link rewrites', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir);
      const readmePath = join(docsDir, 'README.md');
      const indexPath = join(docsDir, 'index.md');
      const bystanderPath = join(docsDir, 'other.md');

      writeFileSync(readmePath, '# Guide\n');
      writeFileSync(bystanderPath, '[read the guide](./README.md)\n');

      const result = await refactorIndex(readmePath, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.targetPath).toBe(indexPath);
      expect(result.linksUpdated).toBe(1);
      expect(result.filesWithUpdatedLinks).toEqual([bystanderPath]);

      // Nothing changed on disk: the old name survives and no new file appears
      expect(existsSync(readmePath)).toBe(true);
      expect(existsSync(indexPath)).toBe(false);
      expect(readFileSync(bystanderPath, 'utf-8')).toBe('[read the guide](./README.md)\n');
    });
  });

  describe('Refusals', () => {
    it('refuses a file whose basename is neither README.md nor index.md', async () => {
      const guidePath = join(testDir, 'guide.md');
      writeFileSync(guidePath, '# Guide\n');

      const result = await refactorIndex(guidePath);

      expect(result.success).toBe(false);
      expect(result.targetPath).toBeUndefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('guide.md');
      expect(result.errors[0]).toContain('README.md');
      expect(result.errors[0]).toContain('index.md');

      // The file is left untouched
      expect(existsSync(guidePath)).toBe(true);
    });

    it('refuses a file that does not exist', async () => {
      const missingPath = join(testDir, 'docs', 'README.md');

      const result = await refactorIndex(missingPath);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('does not exist');
      expect(result.errors[0]).toContain(missingPath);
    });

    it('refuses a conversion that targets the convention the file already uses', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir);
      const readmePath = join(docsDir, 'README.md');
      writeFileSync(readmePath, '# Guide\n');

      const result = await refactorIndex(readmePath, { to: 'readme' });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('already named README.md');

      // The file is left untouched
      expect(existsSync(readmePath)).toBe(true);
    });

    it('refuses the conversion when the target name already exists in the same directory', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir);
      const readmePath = join(docsDir, 'README.md');
      const indexPath = join(docsDir, 'index.md');
      writeFileSync(readmePath, '# Guide\n');
      writeFileSync(indexPath, '# Existing index\n');

      const result = await refactorIndex(readmePath);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('already exists');
      expect(result.errors[0]).toContain(indexPath);

      // Both files are left untouched
      expect(existsSync(readmePath)).toBe(true);
      expect(existsSync(indexPath)).toBe(true);
      expect(readFileSync(indexPath, 'utf-8')).toBe('# Existing index\n');
    });

    it('refuses a file that links to itself by name, which the move machinery cannot rename safely', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir);
      const readmePath = join(docsDir, 'README.md');
      const indexPath = join(docsDir, 'index.md');
      writeFileSync(readmePath, '# Guide\n\n[see the intro](README.md#guide)\n');

      const result = await refactorIndex(readmePath);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('links to itself');

      // Without the refusal the rename would leave both the old and the new file on disk
      expect(existsSync(readmePath)).toBe(true);
      expect(existsSync(indexPath)).toBe(false);
    });
  });

  describe('Link discovery scope', () => {
    it('rewrites links in bystanders nested deeper inside the scanned tree', async () => {
      const docsDir = join(testDir, 'docs');
      const subDir = join(docsDir, 'sub');
      mkdirSync(subDir, { recursive: true });
      const readmePath = join(docsDir, 'README.md');
      const nestedPath = join(subDir, 'page.md');

      writeFileSync(readmePath, '# Guide\n');
      writeFileSync(nestedPath, '[up to the guide](../README.md)\n');

      const result = await refactorIndex(readmePath);

      expect(result.success).toBe(true);
      expect(readFileSync(nestedPath, 'utf-8')).toBe('[up to the guide](../index.md)\n');
      expect(result.linksUpdated).toBe(1);
      expect(result.filesWithUpdatedLinks).toEqual([nestedPath]);
    });

    it('aggregates rewrites across multiple bystanders in the counts', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir);
      const readmePath = join(docsDir, 'README.md');
      const firstPath = join(docsDir, 'first.md');
      const secondPath = join(docsDir, 'second.md');

      writeFileSync(readmePath, '# Guide\n');
      writeFileSync(firstPath, '[one](./README.md) and [two](README.md)\n');
      writeFileSync(secondPath, '[three](./README.md)\n');

      const result = await refactorIndex(readmePath);

      expect(result.success).toBe(true);
      expect(result.linksUpdated).toBe(3);
      expect(result.filesWithUpdatedLinks.sort()).toEqual([firstPath, secondPath].sort());
    });
  });

  describe('Command output', () => {
    it('prints the rename and the link summary on success', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir);
      const readmePath = join(docsDir, 'README.md');
      const bystanderPath = join(docsDir, 'other.md');

      writeFileSync(readmePath, '# Guide\n');
      writeFileSync(bystanderPath, '[guide](./README.md)\n');

      await refactorIndexCommand(readmePath, {});

      const output = mockConsoleLog.mock.calls.map((args) => args.join(' ')).join('\n');
      expect(output).toContain('✅');
      expect(output).toContain('Renamed');
      expect(output).toContain('README.md');
      expect(output).toContain('index.md');
      expect(output).toContain('Updated 1 link(s) across 1 file(s)');
      expect(mockProcessExit).not.toHaveBeenCalled();
    });

    it('previews the rename and per-link rewrites in dry-run mode', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir);
      const readmePath = join(docsDir, 'README.md');
      const bystanderPath = join(docsDir, 'other.md');

      writeFileSync(readmePath, '# Guide\n');
      writeFileSync(bystanderPath, '[guide](./README.md)\n');

      await refactorIndexCommand(readmePath, { dryRun: true });

      const output = mockConsoleLog.mock.calls.map((args) => args.join(' ')).join('\n');
      expect(output).toContain('🔍 Dry run mode - no changes will be made');
      expect(output).toContain('would be renamed to');
      expect(output).toContain(`${bystanderPath}:1 ./README.md → ./index.md`);
      expect(output).toContain('1 link(s) would be updated across 1 file(s)');
      // A dry run must not claim the rename happened
      expect(output).not.toContain('✅ Renamed');
    });

    it('prints a JSON result when json output is requested', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir);
      const readmePath = join(docsDir, 'README.md');
      const bystanderPath = join(docsDir, 'other.md');

      writeFileSync(readmePath, '# Guide\n');
      writeFileSync(bystanderPath, '[guide](./README.md)\n');

      await refactorIndexCommand(readmePath, { json: true });

      const payload = parseJsonPayload<RefactorIndexResult>(
        mockConsoleLog.mock.calls.map((args) => args.join(' ')).join('')
      );
      expect(payload.success).toBe(true);
      expect(payload.sourcePath).toBe(readmePath);
      expect(payload.targetPath).toBe(join(docsDir, 'index.md'));
      expect(payload.linksUpdated).toBe(1);
      expect(payload.filesWithUpdatedLinks).toEqual([bystanderPath]);
      expect(existsSync(join(docsDir, 'index.md'))).toBe(true);
    });

    it('exits non-zero and prints the refusal reason when the request is refused', async () => {
      const guidePath = join(testDir, 'guide.md');
      writeFileSync(guidePath, '# Guide\n');

      await expect(refactorIndexCommand(guidePath, {})).rejects.toThrow(
        'Process exit called with code 1'
      );

      const errorOutput = mockConsoleError.mock.calls.map((args) => args.join(' ')).join('\n');
      expect(errorOutput).toContain('❌');
      expect(errorOutput).toContain('Only README.md and index.md files');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('surfaces bystander parse failures and exits non-zero without aborting the report', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir);
      const readmePath = join(docsDir, 'README.md');
      const bystanderPath = join(docsDir, 'bystander.md');
      writeFileSync(readmePath, '# Guide\n');
      writeFileSync(bystanderPath, '# Bystander\n\n[guide](./README.md)\n');

      const { LinkParser } = await import('../core/link-parser.js');
      const originalParse = LinkParser.prototype.parseFile;
      const parseSpy = vi.spyOn(LinkParser.prototype, 'parseFile').mockImplementation(function (
        this: InstanceType<typeof LinkParser>,
        filePath: string
      ) {
        if (filePath === bystanderPath) {
          return Promise.reject(new Error('parser exploded'));
        }
        return originalParse.call(this, filePath);
      });

      process.exitCode = 0;
      try {
        await refactorIndexCommand(readmePath, { dryRun: true });
      } finally {
        parseSpy.mockRestore();
      }

      expect(process.exitCode).toBe(1);
      const output = mockConsoleLog.mock.calls.map((args) => args.join(' ')).join('\n');
      expect(output).toContain('Parse Failures (1)');
      expect(output).toContain('Links in these files were NOT checked or rewritten:');
      expect(output).toContain(bystanderPath);
      process.exitCode = 0;
    });

    it('lists the files whose links were updated in verbose mode', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir);
      const readmePath = join(docsDir, 'README.md');
      const bystanderPath = join(docsDir, 'other.md');

      writeFileSync(readmePath, '# Guide\n');
      writeFileSync(bystanderPath, '[guide](./README.md)\n');

      await refactorIndexCommand(readmePath, { verbose: true });

      const output = mockConsoleLog.mock.calls.map((args) => args.join(' ')).join('\n');
      expect(output).toContain('Files with updated links:');
      expect(output).toContain(`~ ${bystanderPath}`);
    });

    it('prints the refusal as JSON and exits non-zero', async () => {
      const guidePath = join(testDir, 'guide.md');
      writeFileSync(guidePath, '# Guide\n');

      await expect(refactorIndexCommand(guidePath, { json: true })).rejects.toThrow(
        'Process exit called with code 1'
      );

      const payload = parseJsonPayload<RefactorIndexResult>(
        mockConsoleLog.mock.calls.map((args) => args.join(' ')).join('')
      );
      expect(payload.success).toBe(false);
      expect(payload.errors).toHaveLength(1);
      expect(payload.errors[0]).toContain('Only README.md and index.md files');
    });

    it('prints warnings reported by the move machinery', async () => {
      const docsDir = join(testDir, 'docs');
      mkdirSync(docsDir);
      const readmePath = join(docsDir, 'README.md');
      writeFileSync(readmePath, '# Guide\n');

      const { FileOperations } = await import('../core/file-operations.js');
      const originalMoveFile = FileOperations.prototype.moveFile;
      const moveSpy = vi
        .spyOn(FileOperations.prototype, 'moveFile')
        .mockImplementation(async function (
          this: InstanceType<typeof FileOperations>,
          sourcePath: string,
          destinationPath: string
        ) {
          return originalMoveFile
            .call(this, sourcePath, destinationPath, {
              dryRun: true,
            })
            .then((moveResult) => ({
              ...moveResult,
              warnings: [...moveResult.warnings, 'A fabricated warning from the machinery'],
            }));
        });

      try {
        await refactorIndexCommand(readmePath, {});
      } finally {
        moveSpy.mockRestore();
      }

      const output = mockConsoleLog.mock.calls.map((args) => args.join(' ')).join('\n');
      expect(output).toContain('⚠️  Warnings:');
      expect(output).toContain('A fabricated warning from the machinery');
    });
  });
});
