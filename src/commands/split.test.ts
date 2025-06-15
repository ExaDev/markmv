import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { splitCommand } from './split.js';

// Mock console methods
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

// Mock process.exit
const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
  throw new Error(`Process exit called with code ${code}`);
});

describe('Split Command', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `markmv-split-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    mkdirSync(testDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    try {
      import('node:fs').then(fs => {
        if (existsSync(testDir)) {
          fs.rmSync(testDir, { recursive: true, force: true });
        }
      });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Basic Functionality', () => {
    it('should handle missing source file', async () => {
      const nonExistentFile = join(testDir, 'nonexistent.md');
      
      await expect(splitCommand(nonExistentFile, { dryRun: true })).rejects.toThrow('Process exit called with code 1');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should process file with default header strategy', async () => {
      const sourceFile = join(testDir, 'test.md');
      const content = `# Main Title

## Section 1
Content for section 1

## Section 2  
Content for section 2

### Subsection 2.1
More content`;
      
      writeFileSync(sourceFile, content);
      
      await splitCommand(sourceFile, { dryRun: true, verbose: true });
      
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🔪 Splitting'));
    });

    it('should handle different split strategies', async () => {
      const sourceFile = join(testDir, 'test.md');
      const content = `# Title\n\nSome content here.\n\n## Section\n\nMore content.`;
      
      writeFileSync(sourceFile, content);

      // Test headers strategy
      await splitCommand(sourceFile, { strategy: 'headers', dryRun: true });
      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌'));

      // Test size strategy  
      await splitCommand(sourceFile, { strategy: 'size', maxSize: 1, dryRun: true });
      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌'));

      // Test lines strategy
      await splitCommand(sourceFile, { strategy: 'lines', splitLines: '3,5', dryRun: true });
      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌'));
    });
  });

  describe('Output Directory Handling', () => {
    it('should use custom output directory when specified', async () => {
      const sourceFile = join(testDir, 'test.md');
      const outputDir = join(testDir, 'output');
      const content = `# Title\n\n## Section 1\n\nContent\n\n## Section 2\n\nMore content`;
      
      writeFileSync(sourceFile, content);
      
      await splitCommand(sourceFile, { 
        output: outputDir, 
        dryRun: true, 
        verbose: true 
      });
      
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🔪 Splitting'));
    });

    it('should handle default output directory', async () => {
      const sourceFile = join(testDir, 'test.md');
      const content = `# Title\n\n## Section\n\nContent`;
      
      writeFileSync(sourceFile, content);
      
      await splitCommand(sourceFile, { dryRun: true, verbose: true });
      
      // Should not throw error and should process successfully
      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌'));
    });
  });

  describe('Strategy-Specific Options', () => {
    it('should handle header level option', async () => {
      const sourceFile = join(testDir, 'test.md');
      const content = `# H1\n\n## H2\n\nContent\n\n### H3\n\nMore content`;
      
      writeFileSync(sourceFile, content);
      
      await splitCommand(sourceFile, { 
        strategy: 'headers', 
        headerLevel: 3, 
        dryRun: true 
      });
      
      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌'));
    });

    it('should handle max size option', async () => {
      const sourceFile = join(testDir, 'test.md');
      const content = 'A'.repeat(1000); // Large content
      
      writeFileSync(sourceFile, content);
      
      await splitCommand(sourceFile, { 
        strategy: 'size', 
        maxSize: 1, 
        dryRun: true 
      });
      
      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌'));
    });

    it('should handle split lines option', async () => {
      const sourceFile = join(testDir, 'test.md');
      const content = `Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6`;
      
      writeFileSync(sourceFile, content);
      
      await splitCommand(sourceFile, { 
        strategy: 'lines', 
        splitLines: '2,4', 
        dryRun: true 
      });
      
      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌'));
    });
  });

  describe('Verbose Output', () => {
    it('should show detailed information in verbose mode', async () => {
      const sourceFile = join(testDir, 'test.md');
      const content = `# Title\n\n## Section\n\nContent here`;
      
      writeFileSync(sourceFile, content);
      
      await splitCommand(sourceFile, { dryRun: true, verbose: true });
      
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🔪 Splitting'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🔪 Splitting'));
    });

    it('should be less verbose in non-verbose mode', async () => {
      const sourceFile = join(testDir, 'test.md');
      const content = `# Title\n\n## Section 1\n\nContent\n\n## Section 2\n\nMore content`;
      
      writeFileSync(sourceFile, content);
      
      await splitCommand(sourceFile, { dryRun: true, verbose: false });
      
      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('🔪 Splitting'));
    });
  });

  describe('Dry Run Mode', () => {
    it('should show preview in dry run mode', async () => {
      const sourceFile = join(testDir, 'test.md');
      const content = `# Title\n\n## Section 1\n\nContent\n\n## Section 2\n\nMore content`;
      
      writeFileSync(sourceFile, content);
      
      await splitCommand(sourceFile, { dryRun: true });
      
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📋 Changes that would be made:'));
    });

    it('should not actually create files in dry run mode', async () => {
      const sourceFile = join(testDir, 'test.md');
      const outputDir = join(testDir, 'output');
      const content = `# Title\n\n## Section\n\nContent`;
      
      writeFileSync(sourceFile, content);
      
      await splitCommand(sourceFile, { 
        output: outputDir, 
        dryRun: true 
      });
      
      // Output directory should not be created in dry run mode
      expect(existsSync(outputDir)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle file operation errors gracefully', async () => {
      const sourceFile = join(testDir, 'test.md');
      writeFileSync(sourceFile, '# Title\n\nContent');
      
      // Try to use an invalid output directory that cannot be created
      const invalidOutput = '/invalid/path/that/cannot/be/created';
      
      await expect(splitCommand(sourceFile, { 
        output: invalidOutput, 
        dryRun: false 
      })).rejects.toThrow('Process exit called with code 1');
      
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('❌'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle unexpected errors', async () => {
      const sourceFile = join(testDir, 'test.md');
      writeFileSync(sourceFile, '# Title');
      
      // Use invalid strategy to trigger error handling
      await expect(splitCommand(sourceFile, { 
        strategy: 'invalid' as never,
        dryRun: true 
      })).rejects.toThrow();
    });
  });

  describe('Success Cases', () => {
    it('should complete successfully for valid file', async () => {
      const sourceFile = join(testDir, 'test.md');
      const content = `# Main Title\n\n## Section 1\n\nContent here\n\n## Section 2\n\nMore content`;
      
      writeFileSync(sourceFile, content);
      
      await splitCommand(sourceFile, { dryRun: true });
      
      // Should complete without errors
      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌'));
    });

    it('should handle empty or minimal files', async () => {
      const sourceFile = join(testDir, 'minimal.md');
      writeFileSync(sourceFile, '# Title\n\n## Section 1\n\nContent');
      
      await splitCommand(sourceFile, { dryRun: true });
      
      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌'));
    });
  });
});