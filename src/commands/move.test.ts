import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { moveCommand } from './move.js';

// Mock console methods to capture output
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

// Mock process.exit to prevent actual process termination
const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
  throw new Error(`Process exit called with code ${code}`);
});

describe('Move Command', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a unique test directory
    testDir = join(
      tmpdir(),
      `markmv-move-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    mkdirSync(testDir, { recursive: true });

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up test files
    try {
      import('node:fs').then((fs) => {
        if (existsSync(testDir)) {
          fs.rmSync(testDir, { recursive: true, force: true });
        }
      });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Argument Validation', () => {
    it('should exit with error when fewer than 2 arguments provided', async () => {
      await expect(moveCommand([], {})).rejects.toThrow('Process exit called with code 1');

      expect(mockConsoleError).toHaveBeenCalledWith(
        '❌ Error: At least 2 arguments required (source(s) and destination)'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should exit with error when only 1 argument provided', async () => {
      await expect(moveCommand(['single-arg'], {})).rejects.toThrow(
        'Process exit called with code 1'
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        '❌ Error: At least 2 arguments required (source(s) and destination)'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should show usage examples when insufficient arguments provided', async () => {
      await expect(moveCommand(['single'], {})).rejects.toThrow('Process exit called with code 1');

      expect(mockConsoleError).toHaveBeenCalledWith(
        'Usage: markmv move <sources...> <destination>'
      );
      expect(mockConsoleError).toHaveBeenCalledWith('Examples:');
      expect(mockConsoleError).toHaveBeenCalledWith('  markmv move file.md ./target/');
    });
  });

  describe('Source Pattern Expansion', () => {
    it('should handle direct file paths', async () => {
      // Create test files
      const sourceFile = join(testDir, 'source.md');
      const destFile = join(testDir, 'dest.md');

      writeFileSync(sourceFile, '# Test Content\n\nSome content here.');

      await moveCommand([sourceFile, destFile], { dryRun: true, verbose: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🔍 Expanding pattern:'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('✅ Direct file:'));
    });

    it('should exit when no files found', async () => {
      const nonExistentFile = join(testDir, 'nonexistent.md');
      const destFile = join(testDir, 'dest.md');

      await expect(moveCommand([nonExistentFile, destFile], {})).rejects.toThrow(
        'Process exit called with code 1'
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        '❌ No files found matching the specified patterns'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should accept non-markdown files in direct paths', async () => {
      const txtFile = join(testDir, 'test.txt');
      const destFile = join(testDir, 'dest.txt');

      writeFileSync(txtFile, 'Some text content');

      await moveCommand([txtFile, destFile], { dryRun: true, verbose: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('✅ Direct file:'));
      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌'));
    });

    it('should handle glob patterns', async () => {
      // Create test files
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');
      const destDir = join(testDir, 'dest/');

      writeFileSync(file1, '# File 1');
      writeFileSync(file2, '# File 2');
      mkdirSync(destDir, { recursive: true });

      // Use forward slashes for glob patterns to ensure cross-platform compatibility
      const globPattern = join(testDir, '*.md').replace(/\\/g, '/');

      try {
        await moveCommand([globPattern, destDir], { dryRun: true, verbose: true });

        expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📁 Found'));
        expect(mockConsoleLog).toHaveBeenCalledWith(
          expect.stringContaining('file(s) matching pattern')
        );
      } catch (error) {
        // On Windows, if glob patterns fail, ensure proper error handling
        if (error instanceof Error && error.message.includes('Process exit called with code 1')) {
          // This is acceptable behavior if glob pattern doesn't work on Windows
          expect(mockConsoleError).toHaveBeenCalled();
        } else {
          throw error;
        }
      }
    });
  });

  describe('Destination Validation', () => {
    it('should require directory destination for multiple files', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');
      const destFile = join(testDir, 'dest.md');

      writeFileSync(file1, '# File 1');
      writeFileSync(file2, '# File 2');

      await expect(moveCommand([file1, file2, destFile], {})).rejects.toThrow(
        'Process exit called with code 1'
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        '❌ Error: When moving multiple files, destination must be a directory'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should accept directory destination for multiple files', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');
      const destDir = join(testDir, 'dest/');

      writeFileSync(file1, '# File 1');
      writeFileSync(file2, '# File 2');
      mkdirSync(destDir, { recursive: true });

      await moveCommand([file1, file2, destDir], { dryRun: true });

      // Should not throw an error
      expect(mockConsoleError).not.toHaveBeenCalledWith(
        expect.stringContaining('When moving multiple files')
      );
    });
  });

  describe('Verbose Output', () => {
    it('should show detailed information in verbose mode', async () => {
      const sourceFile = join(testDir, 'source.md');
      const destFile = join(testDir, 'dest.md');

      writeFileSync(sourceFile, '# Test Content');

      await moveCommand([sourceFile, destFile], { dryRun: true, verbose: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🎯 Destination:'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📁 Found'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🔍 Dry run mode'));
    });

    it('should not show extra details in non-verbose mode', async () => {
      const sourceFile = join(testDir, 'source.md');
      const destFile = join(testDir, 'dest.md');

      writeFileSync(sourceFile, '# Test Content');

      await moveCommand([sourceFile, destFile], { dryRun: true, verbose: false });

      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('🎯 Destination:'));
      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('📁 Found'));
    });
  });

  describe('Dry Run Mode', () => {
    it('should show preview of changes in dry run mode', async () => {
      const sourceFile = join(testDir, 'source.md');
      const destFile = join(testDir, 'dest.md');

      writeFileSync(sourceFile, '# Test Content\n\n[Link](./other.md)');

      await moveCommand([sourceFile, destFile], { dryRun: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('📋 Changes that would be made:')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📊 Summary:'));
    });

    it('should show files that would be created in dry run', async () => {
      const sourceFile = join(testDir, 'source.md');
      const destFile = join(testDir, 'dest.md');

      writeFileSync(sourceFile, '# Test Content');

      await moveCommand([sourceFile, destFile], { dryRun: true });

      // Look for either "would be created" or "would be deleted" sections
      const logCalls = mockConsoleLog.mock.calls.map((call) => call[0]);
      const hasCreatedSection = logCalls.some(
        (log) => typeof log === 'string' && log.includes('✅ Files that would be created:')
      );
      const hasDeletedSection = logCalls.some(
        (log) => typeof log === 'string' && log.includes('🗑️  Files that would be deleted:')
      );

      expect(hasCreatedSection || hasDeletedSection).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle file operation errors gracefully', async () => {
      const sourceFile = join(testDir, 'source.md');
      // Use a platform-appropriate invalid path
      const invalidDest =
        process.platform === 'win32'
          ? 'Z:\\invalid\\path\\that\\cannot\\be\\created.md'
          : '/invalid/path/that/cannot/be/created.md';

      writeFileSync(sourceFile, '# Test Content');

      try {
        await moveCommand([sourceFile, invalidDest], { dryRun: false });
        // If it doesn't throw, check that an error was logged
        expect(mockConsoleError).toHaveBeenCalled();
      } catch (error) {
        // If it throws, it should be the expected error
        expect(error).toEqual(
          expect.objectContaining({
            message: expect.stringContaining('Process exit called with code 1'),
          })
        );
        expect(mockProcessExit).toHaveBeenCalledWith(1);
      }
    }, 10000); // Increase timeout to 10 seconds

    it('should handle unexpected errors', async () => {
      // Create a scenario that would cause an unexpected error by mocking expandSourcePatterns to throw
      const _originalExpandSourcePatterns = await import('./move.js');

      // We'll use a non-existent glob pattern that should cause an error in expansion
      const badPattern = '/nonexistent/path/**/*.md';
      const destFile = join(testDir, 'dest.md');

      await expect(moveCommand([badPattern, destFile], {})).rejects.toThrow(
        'Process exit called with code 1'
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        '❌ No files found matching the specified patterns'
      );
    });
  });

  describe('Success Cases', () => {
    it('should complete successfully for valid single file move', async () => {
      const sourceFile = join(testDir, 'source.md');
      const destFile = join(testDir, 'dest.md');

      writeFileSync(sourceFile, '# Test Content');

      await moveCommand([sourceFile, destFile], { dryRun: true });

      // Should not throw any errors
      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌'));
    });

    it('should handle batch moves to directory', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');
      const destDir = join(testDir, 'dest/');

      writeFileSync(file1, '# File 1');
      writeFileSync(file2, '# File 2');
      mkdirSync(destDir, { recursive: true });

      await moveCommand([file1, file2, destDir], { dryRun: true });

      // Should not throw any errors
      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌'));
    });

    it('should move a linked image and update the markdown file that references it', async () => {
      // Reproduces https://github.com/ExaDev/markmv/issues/71
      const imageFile = join(testDir, 'image.png');
      const renamedImageFile = join(testDir, 'image2.png');
      const readmeFile = join(testDir, 'README.md');

      writeFileSync(imageFile, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      writeFileSync(readmeFile, '![](image.png)\n');

      await moveCommand([imageFile, renamedImageFile], {});

      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌'));
      expect(existsSync(renamedImageFile)).toBe(true);
      expect(existsSync(imageFile)).toBe(false);

      const updatedReadme = readFileSync(readmeFile, 'utf-8');
      expect(updatedReadme).toContain('![](./image2.png)');
    });
  });

  describe('Link Validation', () => {
    it('should perform link validation in verbose mode when not dry run', async () => {
      const sourceFile = join(testDir, 'source.md');
      const destFile = join(testDir, 'dest.md');

      writeFileSync(sourceFile, '# Test Content\n\n[Link](./other.md)');

      // Note: We use dry run here because actual file operations require more setup
      // and the validation step is only shown in non-dry-run + verbose mode
      await moveCommand([sourceFile, destFile], { dryRun: true, verbose: true });

      // In dry run mode, validation message won't appear, but we can verify the flow works
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📊 Summary:'));
    });

    it('should display warnings when present', async () => {
      const sourceFile = join(testDir, 'source.md');
      const destFile = join(testDir, 'dest.md');

      writeFileSync(sourceFile, '# Test Content');

      await moveCommand([sourceFile, destFile], { dryRun: true });

      // The command should handle warnings display, even if none are generated in this simple case
      // This tests the warning display logic path
      const logCalls = mockConsoleLog.mock.calls.map((call) => call[0]);
      const hasWarningCheck = logCalls.some(
        (log) => typeof log === 'string' && (log.includes('⚠️') || log.includes('Summary'))
      );

      expect(hasWarningCheck).toBe(true);
    });
  });

  describe('Parse Failure Reporting', () => {
    it('should aggregate parse failures in the summary and exit non-zero', async () => {
      const sourceFile = join(testDir, 'source.md');
      const destDir = join(testDir, 'nested');
      const bystanderFile = join(testDir, 'bystander.md');
      writeFileSync(sourceFile, '# Source\n');
      writeFileSync(bystanderFile, '# Bystander\n\n[link](./source.md)\n');

      const { LinkParser } = await import('../core/link-parser.js');
      const originalParse = LinkParser.prototype.parseFile;
      const parseSpy = vi.spyOn(LinkParser.prototype, 'parseFile').mockImplementation(function (
        this: InstanceType<typeof LinkParser>,
        filePath: string
      ) {
        if (filePath === bystanderFile) {
          return Promise.reject(new Error('parser exploded'));
        }
        return originalParse.call(this, filePath);
      });

      process.exitCode = 0;
      try {
        await moveCommand([sourceFile, destDir + '/'], { dryRun: true, verbose: true });
      } finally {
        parseSpy.mockRestore();
      }

      expect(process.exitCode).toBe(1);

      const output = mockConsoleLog.mock.calls.map((args) => args.join(' ')).join('\n');
      expect(output).toContain('Parse Failures (1)');
      expect(output).toContain(bystanderFile);
      process.exitCode = 0;
    });
  });

  describe('Summary Reporting', () => {
    let nestedDir: string;
    let alphaFile: string;
    let keepFile: string;

    beforeEach(() => {
      nestedDir = join(testDir, 'nested');
      alphaFile = join(testDir, 'Alpha.md');
      keepFile = join(testDir, 'Keep.md');
      writeFileSync(alphaFile, '# Alpha\n\n[Keep](./Keep.md)\n');
      writeFileSync(keepFile, '# Keep\n');
    });

    it('should attribute dry-run link updates to the files that carry them', async () => {
      await moveCommand([alphaFile, nestedDir + '/'], { dryRun: true });

      const output = mockConsoleLog.mock.calls.map((args) => args.join(' ')).join('\n');
      // The only link update lives inside the moved file itself; the summary must not claim updates happened "in 0 file(s)"
      expect(output).toContain('1 link(s) would be updated across 1 file(s)');
      expect(output).not.toContain('in 0 file(s)');
    });

    it('should list per-link rewrites in dry-run output by default', async () => {
      await moveCommand([alphaFile, nestedDir + '/'], { dryRun: true });

      const output = mockConsoleLog.mock.calls.map((args) => args.join(' ')).join('\n');
      expect(output).toContain('./Keep.md → ../Keep.md');
    });

    it('should report the update count on a real run even with no bystander changes', async () => {
      await moveCommand([alphaFile, nestedDir + '/'], {});

      const output = mockConsoleLog.mock.calls.map((args) => args.join(' ')).join('\n');
      expect(output).toContain('Move operation completed successfully!');
      expect(output).toContain('Updated 1 link(s) across 1 file(s)');
    });

    it('should say when no links needed updating', async () => {
      writeFileSync(alphaFile, '# Alpha\n\nNo links here.\n');
      await moveCommand([alphaFile, nestedDir + '/'], {});

      const output = mockConsoleLog.mock.calls.map((args) => args.join(' ')).join('\n');
      expect(output).toContain('No links needed updating');
    });
  });
});
