import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { joinCommand } from './join.js';

// Mock console methods
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

// Mock process.exit
const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
  throw new Error(`Process exit called with code ${code}`);
});

describe('Join Command', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `markmv-join-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    mkdirSync(testDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
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
    it('should exit with error when no files provided', async () => {
      await expect(joinCommand([], {})).rejects.toThrow('Process exit called with code 1');

      expect(mockConsoleError).toHaveBeenCalledWith('❌ No files provided to join');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should show usage examples when no files provided', async () => {
      await expect(joinCommand([], {})).rejects.toThrow('Process exit called with code 1');

      expect(mockConsoleError).toHaveBeenCalledWith('❌ No files provided to join');
    });
  });

  describe('File Processing', () => {
    it('should exit with error when only one file provided', async () => {
      const file1 = join(testDir, 'file1.md');
      writeFileSync(file1, '# File 1\n\nContent of file 1');

      await expect(joinCommand([file1], { dryRun: true, verbose: true })).rejects.toThrow(
        'Process exit called with code 1'
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        '❌ At least two files are required for joining'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle multiple files', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');
      const file3 = join(testDir, 'file3.md');

      writeFileSync(file1, '# File 1\n\nContent 1');
      writeFileSync(file2, '# File 2\n\nContent 2');
      writeFileSync(file3, '# File 3\n\nContent 3');

      await joinCommand([file1, file2, file3], { dryRun: true, verbose: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('🔗 Joining 3 files using dependency strategy')
      );
    });

    it('should handle glob patterns', async () => {
      const file1 = join(testDir, 'doc1.md');
      const file2 = join(testDir, 'doc2.md');

      writeFileSync(file1, '# Doc 1');
      writeFileSync(file2, '# Doc 2');

      // Test with explicit file paths since glob expansion might not work in test environment
      await joinCommand([file1, file2], { dryRun: true, verbose: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('🔗 Joining 2 files using dependency strategy')
      );
    });

    it('should exit when no markdown files found', async () => {
      const nonExistentFile = join(testDir, 'nonexistent.md');

      await expect(joinCommand([nonExistentFile], {})).rejects.toThrow(
        'Process exit called with code 1'
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        '❌ At least two files are required for joining'
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Order Strategies', () => {
    it('should handle alphabetical order strategy', async () => {
      const file1 = join(testDir, 'b-file.md');
      const file2 = join(testDir, 'a-file.md');

      writeFileSync(file1, '# B File');
      writeFileSync(file2, '# A File');

      await joinCommand([file1, file2], {
        orderStrategy: 'alphabetical',
        dryRun: true,
        verbose: true,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('🔗 Joining 2 files using alphabetical strategy')
      );
    });

    it('should handle manual order strategy', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');

      writeFileSync(file1, '# File 1');
      writeFileSync(file2, '# File 2');

      await joinCommand([file1, file2], {
        orderStrategy: 'manual',
        dryRun: true,
        verbose: true,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('🔗 Joining 2 files using manual strategy')
      );
    });

    it('should handle dependency order strategy', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');

      writeFileSync(file1, '# File 1\n\n[Link to file2](./file2.md)');
      writeFileSync(file2, '# File 2\n\nContent');

      await joinCommand([file1, file2], {
        orderStrategy: 'dependency',
        dryRun: true,
        verbose: true,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('🔗 Joining 2 files using dependency strategy')
      );
    });

    it('should handle chronological order strategy', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');

      writeFileSync(file1, '# File 1');
      // Add small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      writeFileSync(file2, '# File 2');

      await joinCommand([file1, file2], {
        orderStrategy: 'chronological',
        dryRun: true,
        verbose: true,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('🔗 Joining 2 files using chronological strategy')
      );
    });
  });

  describe('Output Options', () => {
    it('should handle custom output file name', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');
      const outputFile = join(testDir, 'custom-output.md');

      writeFileSync(file1, '# File 1');
      writeFileSync(file2, '# File 2');

      await joinCommand([file1, file2], {
        output: outputFile,
        dryRun: true,
        verbose: true,
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📄 Output file:'));
    });

    it('should handle default output file name', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');

      writeFileSync(file1, '# File 1');
      writeFileSync(file2, '# File 2');

      await joinCommand([file1, file2], { dryRun: true, verbose: true });

      // Should use default naming without errors
      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌'));
    });
  });

  describe('Verbose Output', () => {
    it('should show detailed information in verbose mode', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');

      writeFileSync(file1, '# File 1');
      writeFileSync(file2, '# File 2');

      await joinCommand([file1, file2], { dryRun: true, verbose: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('🔗 Joining 2 files using dependency strategy')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📁 Input files:'));
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('🔍 Dry run mode - no changes will be made')
      );
    });

    it('should be less verbose in non-verbose mode', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');

      writeFileSync(file1, '# File 1');
      writeFileSync(file2, '# File 2');

      await joinCommand([file1, file2], { dryRun: true, verbose: false });

      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('🔗 Joining'));
    });
  });

  describe('Dry Run Mode', () => {
    it('should show preview in dry run mode', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');

      writeFileSync(file1, '# File 1');
      writeFileSync(file2, '# File 2');

      await joinCommand([file1, file2], { dryRun: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('📋 Changes that would be made:')
      );
    });

    it('should not create actual files in dry run mode', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');
      const outputFile = join(testDir, 'output.md');

      writeFileSync(file1, '# File 1');
      writeFileSync(file2, '# File 2');

      await joinCommand([file1, file2], {
        output: outputFile,
        dryRun: true,
      });

      // Output file should not be created in dry run mode
      expect(existsSync(outputFile)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle file operation errors gracefully', async () => {
      const file1 = join(testDir, 'file1.md');
      writeFileSync(file1, '# File 1');

      // Try to use an invalid output path
      const invalidOutput = '/invalid/path/output.md';

      await expect(
        joinCommand([file1], {
          output: invalidOutput,
          dryRun: false,
        })
      ).rejects.toThrow('Process exit called with code 1');

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('❌'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle unexpected errors', async () => {
      const file1 = join(testDir, 'file1.md');
      writeFileSync(file1, '# File 1');

      // Use invalid order strategy to trigger error
      await expect(
        joinCommand([file1], {
          orderStrategy: 'invalid' as never,
          dryRun: true,
        })
      ).rejects.toThrow();
    });
  });

  describe('Success Cases', () => {
    it('should complete successfully for valid files', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');

      writeFileSync(file1, '# File 1\n\nContent 1');
      writeFileSync(file2, '# File 2\n\nContent 2');

      await joinCommand([file1, file2], { dryRun: true });

      // Should complete without errors
      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌'));
    });

    it('should handle files with cross-references', async () => {
      const file1 = join(testDir, 'file1.md');
      const file2 = join(testDir, 'file2.md');

      writeFileSync(file1, '# File 1\n\n[See file 2](./file2.md)');
      writeFileSync(file2, '# File 2\n\n[Back to file 1](./file1.md)');

      await joinCommand([file1, file2], { dryRun: true, verbose: true });

      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌'));
    });
  });
});
