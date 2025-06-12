import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { convertCommand } from './convert.js';

describe('Convert Command', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'markmv-convert-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('Basic functionality', () => {
    it('should process files with dry run option', async () => {
      // Create a test markdown file with links
      const testFile = join(testDir, 'test.md');
      const content = `# Test Document

This is a [link to another file](./other.md) and here's an image:
![test image](./images/test.png)

Also a reference link [ref link][1] and a Claude import:
@./imported.md

[1]: ./referenced.md
`;

      await writeFile(testFile, content);

      // Test dry run
      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number | undefined): never => {
        exitCode = code || 0;
        // Don't throw, just prevent actual exit
        return null as never;
      }) as typeof process.exit;

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (message: string) => {
        logs.push(message);
      };

      try {
        await convertCommand([testFile], {
          pathResolution: 'relative',
          dryRun: true,
          verbose: true,
        });
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }

      expect(exitCode).toBe(0);
      expect(logs.some((log) => log.includes('Starting link conversion'))).toBe(true);
      expect(logs.some((log) => log.includes('Dry run mode'))).toBe(true);
    });

    it('should handle files that need no conversion', async () => {
      // Create a test file with no links
      const testFile = join(testDir, 'simple.md');
      const content = `# Simple Document

This is just text with no links.
`;

      await writeFile(testFile, content);

      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number | undefined): never => {
        exitCode = code || 0;
        // Don't throw, just prevent actual exit
        return null as never;
      }) as typeof process.exit;

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (message: string) => {
        logs.push(message);
      };

      try {
        await convertCommand([testFile], {
          pathResolution: 'relative',
          verbose: true,
        });
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }

      expect(exitCode).toBe(0);
      expect(logs.some((log) => log.includes('No changes were needed'))).toBe(true);
    });

    it('should validate conversion options', async () => {
      const testFile = join(testDir, 'test.md');
      await writeFile(testFile, '# Test');

      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number | undefined): never => {
        exitCode = code || 0;
        // Don't throw, just prevent actual exit
        return null as never;
      }) as typeof process.exit;

      const originalError = console.error;
      const errors: string[] = [];
      console.error = (...args: unknown[]) => {
        errors.push(args.join(' '));
      };

      try {
        // Test with no conversion options
        await convertCommand([testFile], {});
      } finally {
        process.exit = originalExit;
        console.error = originalError;
      }

      expect(exitCode).toBe(1);
      expect(
        errors.some((error) => error.includes('At least one conversion option must be specified'))
      ).toBe(true);
    });

    it('should handle invalid path resolution option', async () => {
      const testFile = join(testDir, 'test.md');
      await writeFile(testFile, '# Test');

      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number | undefined): never => {
        exitCode = code || 0;
        // Don't throw, just prevent actual exit
        return null as never;
      }) as typeof process.exit;

      const originalError = console.error;
      const errors: string[] = [];
      console.error = (...args: unknown[]) => {
        errors.push(args.join(' '));
      };

      try {
        await convertCommand([testFile], {
          pathResolution: 'invalid' as 'absolute' | 'relative',
        });
      } finally {
        process.exit = originalExit;
        console.error = originalError;
      }

      expect(exitCode).toBe(1);
      expect(errors.some((error) => error.includes('Invalid path resolution type'))).toBe(true);
    });

    it('should handle invalid link style option', async () => {
      const testFile = join(testDir, 'test.md');
      await writeFile(testFile, '# Test');

      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number | undefined): never => {
        exitCode = code || 0;
        // Don't throw, just prevent actual exit
        return null as never;
      }) as typeof process.exit;

      const originalError = console.error;
      const errors: string[] = [];
      console.error = (...args: unknown[]) => {
        errors.push(args.join(' '));
      };

      try {
        await convertCommand([testFile], {
          linkStyle: 'invalid' as 'markdown' | 'claude' | 'combined' | 'wikilink',
        });
      } finally {
        process.exit = originalExit;
        console.error = originalError;
      }

      expect(exitCode).toBe(1);
      expect(errors.some((error) => error.includes('Invalid link style'))).toBe(true);
    });
  });

  describe('File pattern expansion', () => {
    it('should handle direct file paths', async () => {
      const testFile = join(testDir, 'direct.md');
      await writeFile(testFile, '# Direct file');

      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number | undefined): never => {
        exitCode = code || 0;
        // Don't throw, just prevent actual exit
        return null as never;
      }) as typeof process.exit;

      try {
        await convertCommand([testFile], {
          pathResolution: 'relative',
          dryRun: true,
          verbose: true,
        });
      } finally {
        process.exit = originalExit;
      }

      expect(exitCode).toBe(0);
    });

    it('should handle directory patterns with recursive option', async () => {
      // Create nested directory structure
      const subDir = join(testDir, 'subdir');
      await mkdir(subDir, { recursive: true });
      await writeFile(join(subDir, 'nested.md'), '# Nested file');
      await writeFile(join(testDir, 'root.md'), '# Root file');

      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number | undefined): never => {
        exitCode = code || 0;
        // Don't throw, just prevent actual exit
        return null as never;
      }) as typeof process.exit;

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (message: string) => {
        logs.push(message);
      };

      try {
        await convertCommand([testDir], {
          pathResolution: 'relative',
          recursive: true,
          dryRun: true,
          verbose: true,
        });
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }

      expect(exitCode).toBe(0);
      expect(logs.some((log) => log.includes('markdown files to process'))).toBe(true);
    });

    it('should handle non-existent files gracefully', async () => {
      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number | undefined): never => {
        exitCode = code || 0;
        // Don't throw, just prevent actual exit
        return null as never;
      }) as typeof process.exit;

      const originalError = console.error;
      const errors: string[] = [];
      console.error = (...args: unknown[]) => {
        errors.push(args.join(' '));
      };

      try {
        await convertCommand(['non-existent.md'], {
          pathResolution: 'relative',
        });
      } finally {
        process.exit = originalExit;
        console.error = originalError;
      }

      expect(exitCode).toBe(1);
      expect(errors.some((error) => error.includes('No markdown files found'))).toBe(true);
    });

    it('should require at least one file pattern', async () => {
      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number | undefined): never => {
        exitCode = code || 0;
        // Don't throw, just prevent actual exit
        return null as never;
      }) as typeof process.exit;

      const originalError = console.error;
      const errors: string[] = [];
      console.error = (...args: unknown[]) => {
        errors.push(args.join(' '));
      };

      try {
        await convertCommand([], {
          pathResolution: 'relative',
        });
      } finally {
        process.exit = originalExit;
        console.error = originalError;
      }

      expect(exitCode).toBe(1);
      expect(
        errors.some((error) => error.includes('At least one file pattern must be specified'))
      ).toBe(true);
    });
  });

  describe('Summary output', () => {
    it('should display comprehensive summary', async () => {
      const testFile = join(testDir, 'summary.md');
      const content = `# Summary Test

[link](./other.md)
`;
      await writeFile(testFile, content);

      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number | undefined): never => {
        exitCode = code || 0;
        // Don't throw, just prevent actual exit
        return null as never;
      }) as typeof process.exit;

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (message: string) => {
        logs.push(message);
      };

      try {
        await convertCommand([testFile], {
          pathResolution: 'relative',
          linkStyle: 'wikilink',
          dryRun: true,
          verbose: true,
        });
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }

      expect(exitCode).toBe(0);
      expect(logs.some((log) => log.includes('Conversion Summary'))).toBe(true);
      expect(logs.some((log) => log.includes('Files processed:'))).toBe(true);
      expect(logs.some((log) => log.includes('Path resolution: converted to relative'))).toBe(true);
      expect(logs.some((log) => log.includes('Link style: converted to wikilink'))).toBe(true);
      expect(logs.some((log) => log.includes('Dry run - no files were actually modified'))).toBe(
        true
      );
    });
  });
});
