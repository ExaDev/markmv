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

  describe('Link Style Conversion', () => {
    it('should convert standard markdown links to combined format', async () => {
      const testFile = join(testDir, 'combined-test.md');
      const content = `# Link Style Test

Standard markdown links:
- [Backend Guide](./backend/guide.md)
- [Frontend Component](./frontend/component.md)
- [API Reference](./docs/api.md)

External links (should not be converted):
- [GitHub](https://github.com)
- [Documentation](https://docs.example.com)
`;

      await writeFile(testFile, content);

      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number | undefined): never => {
        exitCode = code || 0;
        return null as never;
      }) as typeof process.exit;

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (message: string) => {
        logs.push(message);
      };

      try {
        await convertCommand([testFile], {
          linkStyle: 'combined',
          verbose: true
        });
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }

      expect(exitCode).toBe(0);
      expect(logs.some(log => log.includes('Files modified: 1'))).toBe(true);
      expect(logs.some(log => log.includes('Link style: converted to combined'))).toBe(true);

      // Verify the file was actually converted
      const { readFile } = await import('node:fs/promises');
      const convertedContent = await readFile(testFile, 'utf-8');
      
      // Should convert internal links to combined format
      expect(convertedContent).toContain('[@./backend/guide.md](./backend/guide.md)');
      expect(convertedContent).toContain('[@./frontend/component.md](./frontend/component.md)');
      expect(convertedContent).toContain('[@./docs/api.md](./docs/api.md)');
      
      // Should leave external links unchanged
      expect(convertedContent).toContain('[GitHub](https://github.com)');
      expect(convertedContent).toContain('[Documentation](https://docs.example.com)');
    });

    it('should not double-convert already combined format links', async () => {
      const testFile = join(testDir, 'already-combined.md');
      const content = `# Already Combined

These are already in combined format:
- [@./backend/guide.md](./backend/guide.md)
- [@./frontend/component.md](./frontend/component.md)

Mixed content:
- [Standard Link](./standard.md)
- [@./already-combined.md](./already-combined.md)
`;

      await writeFile(testFile, content);

      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number | undefined): never => {
        exitCode = code || 0;
        return null as never;
      }) as typeof process.exit;

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (message: string) => {
        logs.push(message);
      };

      try {
        await convertCommand([testFile], {
          linkStyle: 'combined',
          verbose: true
        });
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }

      expect(exitCode).toBe(0);
      expect(logs.some(log => log.includes('Files modified: 1'))).toBe(true);

      // Verify conversion happened only for standard links
      const { readFile } = await import('node:fs/promises');
      const convertedContent = await readFile(testFile, 'utf-8');
      
      // Already combined links should remain unchanged
      expect(convertedContent).toContain('[@./backend/guide.md](./backend/guide.md)');
      expect(convertedContent).toContain('[@./frontend/component.md](./frontend/component.md)');
      expect(convertedContent).toContain('[@./already-combined.md](./already-combined.md)');
      
      // Standard link should be converted
      expect(convertedContent).toContain('[@./standard.md](./standard.md)');
    });

    it('should report no changes when all links are already in target format', async () => {
      const testFile = join(testDir, 'no-changes-needed.md');
      const content = `# All Already Combined

- [@./file1.md](./file1.md)
- [@./file2.md](./file2.md)
- [@./file3.md](./file3.md)
`;

      await writeFile(testFile, content);

      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number | undefined): never => {
        exitCode = code || 0;
        return null as never;
      }) as typeof process.exit;

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (message: string) => {
        logs.push(message);
      };

      try {
        await convertCommand([testFile], {
          linkStyle: 'combined',
          verbose: true
        });
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }

      expect(exitCode).toBe(0);
      expect(logs.some(log => log.includes('No changes needed'))).toBe(true);
      expect(logs.some(log => log.includes('Files modified: 0'))).toBe(true);
      expect(logs.some(log => log.includes('Total changes: 0'))).toBe(true);
    });

    it('should convert combined format back to standard markdown', async () => {
      const testFile = join(testDir, 'combined-to-markdown.md');
      const content = `# Combined to Markdown

Combined format links:
- [@./backend/guide.md](./backend/guide.md)
- [@./frontend/component.md](./frontend/component.md)
- [@./docs/api.md](./docs/api.md)

External links:
- [GitHub](https://github.com)
`;

      await writeFile(testFile, content);

      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number | undefined): never => {
        exitCode = code || 0;
        return null as never;
      }) as typeof process.exit;

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (message: string) => {
        logs.push(message);
      };

      try {
        await convertCommand([testFile], {
          linkStyle: 'markdown',
          verbose: true
        });
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }

      expect(exitCode).toBe(0);
      expect(logs.some(log => log.includes('Files modified: 1'))).toBe(true);
      expect(logs.some(log => log.includes('Link style: converted to markdown'))).toBe(true);

      // Verify conversion back to standard markdown
      const { readFile } = await import('node:fs/promises');
      const convertedContent = await readFile(testFile, 'utf-8');
      
      // Should convert back to standard markdown (remove @)
      expect(convertedContent).toContain('[./backend/guide.md](./backend/guide.md)');
      expect(convertedContent).toContain('[./frontend/component.md](./frontend/component.md)');
      expect(convertedContent).toContain('[./docs/api.md](./docs/api.md)');
      
      // External links should remain unchanged
      expect(convertedContent).toContain('[GitHub](https://github.com)');
    });

    it('should convert to Claude import format', async () => {
      const testFile = join(testDir, 'claude-conversion.md');
      const content = `# Claude Conversion Test

Standard markdown links:
- [Backend Guide](./backend/guide.md)
- [Frontend Component](./frontend/component.md)

External links (should not be converted):
- [GitHub](https://github.com)
`;

      await writeFile(testFile, content);

      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number | undefined): never => {
        exitCode = code || 0;
        return null as never;
      }) as typeof process.exit;

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (message: string) => {
        logs.push(message);
      };

      try {
        await convertCommand([testFile], {
          linkStyle: 'claude',
          verbose: true
        });
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }

      expect(exitCode).toBe(0);
      expect(logs.some(log => log.includes('Files modified: 1'))).toBe(true);
      expect(logs.some(log => log.includes('Link style: converted to claude'))).toBe(true);

      // Verify conversion to Claude format
      const { readFile } = await import('node:fs/promises');
      const convertedContent = await readFile(testFile, 'utf-8');
      
      // Should convert to Claude import format
      expect(convertedContent).toContain('@./backend/guide.md');
      expect(convertedContent).toContain('@./frontend/component.md');
      
      // External links should remain unchanged
      expect(convertedContent).toContain('[GitHub](https://github.com)');
    });

    it('should convert to wikilink format', async () => {
      const testFile = join(testDir, 'wikilink-conversion.md');
      const content = `# Wikilink Conversion Test

Standard markdown links:
- [Backend Guide](./backend/guide.md)
- [Frontend Component](./frontend/component.md)

External links (should not be converted):
- [GitHub](https://github.com)
`;

      await writeFile(testFile, content);

      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number | undefined): never => {
        exitCode = code || 0;
        return null as never;
      }) as typeof process.exit;

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (message: string) => {
        logs.push(message);
      };

      try {
        await convertCommand([testFile], {
          linkStyle: 'wikilink',
          verbose: true
        });
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }

      expect(exitCode).toBe(0);
      expect(logs.some(log => log.includes('Files modified: 1'))).toBe(true);
      expect(logs.some(log => log.includes('Link style: converted to wikilink'))).toBe(true);

      // Verify conversion to wikilink format
      const { readFile } = await import('node:fs/promises');
      const convertedContent = await readFile(testFile, 'utf-8');
      
      // Should convert to wikilink format (may be escaped in markdown output)
      expect(convertedContent).toContain('\\[\\[./backend/guide.md]]');
      expect(convertedContent).toContain('\\[\\[./frontend/component.md]]');
      
      // External links should remain unchanged
      expect(convertedContent).toContain('[GitHub](https://github.com)');
    });

    it('should handle dry run for link style conversion', async () => {
      const testFile = join(testDir, 'dry-run-test.md');
      const content = `# Dry Run Test

- [Standard Link](./file.md)
- [Another Link](./another.md)
`;

      await writeFile(testFile, content);

      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number | undefined): never => {
        exitCode = code || 0;
        return null as never;
      }) as typeof process.exit;

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (message: string) => {
        logs.push(message);
      };

      try {
        await convertCommand([testFile], {
          linkStyle: 'combined',
          dryRun: true,
          verbose: true
        });
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }

      expect(exitCode).toBe(0);
      expect(logs.some(log => log.includes('Dry run - no files were actually modified'))).toBe(true);
      expect(logs.some(log => log.includes('Files modified: 0'))).toBe(true);
      expect(logs.some(log => log.includes('Total changes:'))).toBe(true);

      // Verify file was not actually modified
      const { readFile } = await import('node:fs/promises');
      const unchangedContent = await readFile(testFile, 'utf-8');
      
      // Should still contain original format
      expect(unchangedContent).toContain('[Standard Link](./file.md)');
      expect(unchangedContent).toContain('[Another Link](./another.md)');
      expect(unchangedContent).not.toContain('@');
    });

    it('should handle multiple files with link style conversion', async () => {
      // Create multiple test files
      const files = ['file1.md', 'file2.md', 'file3.md'];
      const content = `# Test File

- [Internal Link](./internal.md)
- [Another Link](./another.md)
- [External Link](https://github.com)
`;

      for (const file of files) {
        await writeFile(join(testDir, file), content);
      }

      let exitCode = 0;
      const originalExit = process.exit;
      process.exit = ((code: number | undefined): never => {
        exitCode = code || 0;
        return null as never;
      }) as typeof process.exit;

      const originalLog = console.log;
      const logs: string[] = [];
      console.log = (message: string) => {
        logs.push(message);
      };

      try {
        await convertCommand([join(testDir, '*.md')], {
          linkStyle: 'combined',
          verbose: true
        });
      } finally {
        process.exit = originalExit;
        console.log = originalLog;
      }

      expect(exitCode).toBe(0);
      expect(logs.some(log => log.includes('Files processed: 3'))).toBe(true);
      expect(logs.some(log => log.includes('Files modified: 3'))).toBe(true);
      expect(logs.some(log => log.includes('Total changes: 6'))).toBe(true); // 2 internal links per file

      // Verify all files were converted
      const { readFile } = await import('node:fs/promises');
      for (const file of files) {
        const convertedContent = await readFile(join(testDir, file), 'utf-8');
        expect(convertedContent).toContain('[@./internal.md](./internal.md)');
        expect(convertedContent).toContain('[@./another.md](./another.md)');
        expect(convertedContent).toContain('[External Link](https://github.com)'); // External unchanged
      }
    });
  });
});
