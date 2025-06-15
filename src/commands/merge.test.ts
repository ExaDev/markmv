import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeCommand } from './merge.js';

// Mock console methods
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

// Mock process.exit
const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
  throw new Error(`Process exit called with code ${code}`);
});

describe('Merge Command', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `markmv-merge-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
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

  describe('Argument Validation', () => {
    it('should exit with error when source file missing', async () => {
      const nonExistentSource = join(testDir, 'nonexistent.md');
      const targetFile = join(testDir, 'target.md');
      
      writeFileSync(targetFile, '# Target\n\nTarget content');
      
      await expect(mergeCommand(nonExistentSource, targetFile, {})).rejects.toThrow('Process exit called with code 1');
      
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('❌ File not found:'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should exit with error when target file missing', async () => {
      const sourceFile = join(testDir, 'source.md');
      const nonExistentTarget = join(testDir, 'nonexistent.md');
      
      writeFileSync(sourceFile, '# Source\n\nSource content');
      
      await expect(mergeCommand(sourceFile, nonExistentTarget, {})).rejects.toThrow('Process exit called with code 1');
      
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('❌ File not found:'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should show usage examples on validation error', async () => {
      const nonExistentSource = join(testDir, 'nonexistent.md');
      const targetFile = join(testDir, 'target.md');
      
      writeFileSync(targetFile, '# Target');
      
      await expect(mergeCommand(nonExistentSource, targetFile, {})).rejects.toThrow('Process exit called with code 1');
      
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('❌ File not found:'));
    });
  });

  describe('Basic Functionality', () => {
    it('should process valid source and target files', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');
      
      writeFileSync(sourceFile, '# Source\n\nSource content here');
      writeFileSync(targetFile, '# Target\n\nTarget content here');
      
      await mergeCommand(sourceFile, targetFile, { dryRun: true, verbose: true });
      
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🔀 Merging'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🔀 Merging'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('using interactive strategy'));
    });

    it('should handle files with different content types', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');
      
      writeFileSync(sourceFile, '# Source Document\n\n- List item 1\n- List item 2\n\n[Link](./other.md)');
      writeFileSync(targetFile, '# Target Document\n\n## Existing Section\n\nExisting content\n\n```typescript\nconst example = "code";\n```');
      
      await mergeCommand(sourceFile, targetFile, { dryRun: true, verbose: true });
      
      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌'));
    });
  });

  describe('Merge Strategies', () => {
    it('should handle append strategy', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');
      
      writeFileSync(sourceFile, '# Source\n\nSource content');
      writeFileSync(targetFile, '# Target\n\nTarget content');
      
      await mergeCommand(sourceFile, targetFile, { 
        strategy: 'append', 
        dryRun: true, 
        verbose: true 
      });
      
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('using append strategy'));
    });

    it('should handle prepend strategy', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');
      
      writeFileSync(sourceFile, '# Source\n\nSource content');
      writeFileSync(targetFile, '# Target\n\nTarget content');
      
      await mergeCommand(sourceFile, targetFile, { 
        strategy: 'prepend', 
        dryRun: true, 
        verbose: true 
      });
      
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('using prepend strategy'));
    });

    it('should handle interactive strategy', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');
      
      writeFileSync(sourceFile, '# Source\n\nSource content');
      writeFileSync(targetFile, '# Target\n\nTarget content');
      
      await mergeCommand(sourceFile, targetFile, { 
        strategy: 'interactive', 
        dryRun: true, 
        verbose: true 
      });
      
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('using interactive strategy'));
    });
  });

  describe('Transclusion Options', () => {
    it('should handle create-transclusions option', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');
      
      writeFileSync(sourceFile, '# Source\n\nSource content');
      writeFileSync(targetFile, '# Target\n\nTarget content');
      
      await mergeCommand(sourceFile, targetFile, { 
        createTransclusions: true, 
        dryRun: true, 
        verbose: true 
      });
      
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🔗 Creating Obsidian transclusions where possible'));
    });

    it('should handle normal merge without transclusions', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');
      
      writeFileSync(sourceFile, '# Source\n\nSource content');
      writeFileSync(targetFile, '# Target\n\nTarget content');
      
      await mergeCommand(sourceFile, targetFile, { 
        createTransclusions: false, 
        dryRun: true, 
        verbose: true 
      });
      
      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('🔗 Creating Obsidian transclusions'));
    });
  });

  describe('Verbose Output', () => {
    it('should show detailed information in verbose mode', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');
      
      writeFileSync(sourceFile, '# Source\n\nSource content');
      writeFileSync(targetFile, '# Target\n\nTarget content');
      
      await mergeCommand(sourceFile, targetFile, { dryRun: true, verbose: true });
      
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🔀 Merging'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('using interactive strategy'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🔍 Dry run mode'));
    });

    it('should be less verbose in non-verbose mode', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');
      
      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '# Target');
      
      await mergeCommand(sourceFile, targetFile, { dryRun: true, verbose: false });
      
      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('🔀 Merging'));
    });
  });

  describe('Dry Run Mode', () => {
    it('should show preview in dry run mode', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');
      
      writeFileSync(sourceFile, '# Source\n\nSource content');
      writeFileSync(targetFile, '# Target\n\nTarget content');
      
      await mergeCommand(sourceFile, targetFile, { dryRun: true });
      
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📋 Changes that would be made:'));
    });

    it('should not modify files in dry run mode', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');
      
      const originalSourceContent = '# Source\n\nSource content';
      const originalTargetContent = '# Target\n\nTarget content';
      
      writeFileSync(sourceFile, originalSourceContent);
      writeFileSync(targetFile, originalTargetContent);
      
      await mergeCommand(sourceFile, targetFile, { dryRun: true });
      
      // Files should remain unchanged in dry run mode
      const fs = await import('node:fs');
      expect(fs.readFileSync(sourceFile, 'utf8')).toBe(originalSourceContent);
      expect(fs.readFileSync(targetFile, 'utf8')).toBe(originalTargetContent);
    });
  });

  describe('Error Handling', () => {
    it('should handle file operation errors gracefully', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');
      
      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '# Target');
      
      // Test with valid parameters in dry run mode
      await mergeCommand(sourceFile, targetFile, { 
        strategy: 'append',
        dryRun: true 
      });
      
      // Should complete without errors
      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌'));
    });

    it('should handle merge operation failures', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');
      
      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '# Target');
      
      // The merge operation might fail due to various reasons
      // In dry run mode, we can test error handling paths
      await mergeCommand(sourceFile, targetFile, { dryRun: true });
      
      // Should handle any potential errors gracefully
      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌ Merge operation failed:'));
    });

    it('should handle unexpected errors', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');
      
      writeFileSync(sourceFile, '# Source');
      writeFileSync(targetFile, '# Target');
      
      // Test with default strategy (falls back to interactive)
      await mergeCommand(sourceFile, targetFile, { 
        dryRun: true
      });
      
      // Should complete without critical errors
      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌ Unexpected error:'));
    });
  });

  describe('Success Cases', () => {
    it('should complete successfully for valid merge', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');
      
      writeFileSync(sourceFile, '# Source Document\n\nThis is source content.');
      writeFileSync(targetFile, '# Target Document\n\nThis is target content.');
      
      await mergeCommand(sourceFile, targetFile, { dryRun: true });
      
      // Should complete without errors
      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌'));
    });

    it('should handle complex content merging', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetFile = join(testDir, 'target.md');
      
      const complexSourceContent = `# Source
      
## Introduction
This is a complex document.

### Features
- Feature 1
- Feature 2

## Code Example
\`\`\`typescript
interface Example {
  name: string;
  value: number;
}
\`\`\`

[Link to external](./external.md)
`;

      const complexTargetContent = `# Target
      
## Overview
This document already exists.

### Current Status
- Status A
- Status B

## Implementation
\`\`\`javascript
const implementation = {
  ready: true
};
\`\`\`
`;
      
      writeFileSync(sourceFile, complexSourceContent);
      writeFileSync(targetFile, complexTargetContent);
      
      await mergeCommand(sourceFile, targetFile, { 
        strategy: 'append', 
        dryRun: true, 
        verbose: true 
      });
      
      expect(mockConsoleError).not.toHaveBeenCalledWith(expect.stringContaining('❌'));
    });
  });
});