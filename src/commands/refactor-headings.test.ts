import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { refactorHeadings, formatRefactorHeadingsResults } from './refactor-headings.js';
import type { RefactorHeadingsOperationOptions } from './refactor-headings.js';

describe('refactorHeadings', () => {
  let testDir: string;
  let testFile1: string;
  let testFile2: string;

  beforeEach(async () => {
    // Create real temporary directory for testing
    testDir = join(tmpdir(), `markmv-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    
    testFile1 = join(testDir, 'file1.md');
    testFile2 = join(testDir, 'file2.md');
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('basic heading refactoring', () => {
    it('should refactor heading text and generate correct slugs', async () => {
      const testContent = `# Main Title

## Getting Started

This is some content.

### Advanced Usage

More content here.

## Getting Started

Duplicate heading for testing.
`;

      const expectedContent = `# Main Title

## Quick Start Guide

This is some content.

### Advanced Usage

More content here.

## Quick Start Guide

Duplicate heading for testing.
`;

      await writeFile(testFile1, testContent, 'utf-8');

      const options: RefactorHeadingsOperationOptions = {
        oldHeading: 'Getting Started',
        newHeading: 'Quick Start Guide',
        dryRun: false,
        verbose: false,
      };

      const result = await refactorHeadings([testFile1], options);

      expect(result.success).toBe(true);
      expect(result.filesProcessed).toBe(1);
      expect(result.headingsChanged).toBe(2);
      expect(result.headingChanges).toHaveLength(2);
      
      // Verify heading changes
      expect(result.headingChanges[0]).toEqual({
        filePath: testFile1,
        line: 3,
        oldText: 'Getting Started',
        newText: 'Quick Start Guide',
        oldSlug: 'getting-started',
        newSlug: 'quick-start-guide',
        level: 2,
      });

      expect(result.headingChanges[1]).toEqual({
        filePath: testFile1,
        line: 11,
        oldText: 'Getting Started',
        newText: 'Quick Start Guide',
        oldSlug: 'getting-started',
        newSlug: 'quick-start-guide',
        level: 2,
      });

      // Check file was actually modified
      const modifiedContent = await readFile(testFile1, 'utf-8');
      expect(modifiedContent).toBe(expectedContent);
    });

    it('should handle headings with different levels', async () => {
      const testContent = `# Installation

## Installation

### Installation Steps

#### Installation Notes
`;

      await writeFile(testFile1, testContent, 'utf-8');

      const options: RefactorHeadingsOperationOptions = {
        oldHeading: 'Installation',
        newHeading: 'Setup',
        dryRun: false,
        verbose: false,
      };

      const result = await refactorHeadings([testFile1], options);

      expect(result.headingsChanged).toBe(2); // Only exact text matches: "Installation" and "Installation"
      expect(result.headingChanges.map(c => c.level)).toEqual([1, 2]);
    });

    it('should skip files with no matching headings', async () => {
      const testContent = `# Different Title

## Other Section

Content here.
`;

      await writeFile(testFile1, testContent, 'utf-8');

      const options: RefactorHeadingsOperationOptions = {
        oldHeading: 'Non-existent Heading',
        newHeading: 'New Heading',
        dryRun: false,
        verbose: false,
      };

      const result = await refactorHeadings([testFile1], options);

      expect(result.filesProcessed).toBe(1);
      expect(result.headingsChanged).toBe(0);
      expect(result.headingChanges).toHaveLength(0);
      
      // File should not be modified
      const unchangedContent = await readFile(testFile1, 'utf-8');
      expect(unchangedContent).toBe(testContent);
    });
  });

  describe('anchor link updating', () => {
    it('should update anchor links that reference changed headings', async () => {
      const testContent = `# Documentation

## Getting Started

See the [installation guide](#getting-started) for details.

Jump to [Getting Started](#getting-started) section.

Check out [other section](#other-section).

## Other Section

More content.
`;

      await writeFile(testFile1, testContent, 'utf-8');

      const options: RefactorHeadingsOperationOptions = {
        oldHeading: 'Getting Started',
        newHeading: 'Quick Start Guide',
        updateCrossReferences: true,
        dryRun: false,
        verbose: false,
      };

      const result = await refactorHeadings([testFile1], options);

      expect(result.headingsChanged).toBe(1);
      expect(result.linksUpdated).toBe(2);
      expect(result.linkUpdates).toHaveLength(2);

      // Verify link updates
      expect(result.linkUpdates[0]).toEqual({
        filePath: testFile1,
        line: 5,
        oldLink: '#getting-started',
        newLink: '#quick-start-guide',
        linkType: 'anchor',
      });

      expect(result.linkUpdates[1]).toEqual({
        filePath: testFile1,
        line: 7,
        oldLink: '#getting-started',
        newLink: '#quick-start-guide',
        linkType: 'anchor',
      });

      // Check that links were actually updated in the file
      const modifiedContent = await readFile(testFile1, 'utf-8');
      expect(modifiedContent).toContain('[installation guide](#quick-start-guide)');
      expect(modifiedContent).toContain('[Getting Started](#quick-start-guide)');
      expect(modifiedContent).toContain('[other section](#other-section)'); // Should remain unchanged
    });

    it('should not update anchor links when updateCrossReferences is false', async () => {
      const testContent = `# Documentation

## Getting Started

See the [installation guide](#getting-started) for details.
`;

      await writeFile(testFile1, testContent, 'utf-8');

      const options: RefactorHeadingsOperationOptions = {
        oldHeading: 'Getting Started',
        newHeading: 'Quick Start Guide',
        updateCrossReferences: false,
        dryRun: false,
        verbose: false,
      };

      const result = await refactorHeadings([testFile1], options);

      expect(result.headingsChanged).toBe(1);
      expect(result.linksUpdated).toBe(0);
      expect(result.linkUpdates).toHaveLength(0);

      // Link should not be updated
      const modifiedContent = await readFile(testFile1, 'utf-8');
      expect(modifiedContent).toContain('[installation guide](#getting-started)');
    });
  });

  describe('dry run mode', () => {
    it('should not write files in dry run mode', async () => {
      const testContent = `# Main Title

## Getting Started

Content here.
`;

      await writeFile(testFile1, testContent, 'utf-8');

      const options: RefactorHeadingsOperationOptions = {
        oldHeading: 'Getting Started',
        newHeading: 'Quick Start Guide',
        dryRun: true,
        verbose: false,
      };

      const result = await refactorHeadings([testFile1], options);

      expect(result.headingsChanged).toBe(1);
      
      // File should not be modified
      const unchangedContent = await readFile(testFile1, 'utf-8');
      expect(unchangedContent).toBe(testContent);
    });

    it('should still detect and report changes in dry run mode', async () => {
      const testContent = `# Documentation

## Getting Started

See [getting started](#getting-started) guide.
`;

      await writeFile(testFile1, testContent, 'utf-8');

      const options: RefactorHeadingsOperationOptions = {
        oldHeading: 'Getting Started',
        newHeading: 'Quick Start Guide',
        updateCrossReferences: true,
        dryRun: true,
        verbose: false,
      };

      const result = await refactorHeadings([testFile1], options);

      expect(result.headingsChanged).toBe(1);
      expect(result.linksUpdated).toBe(1);
      expect(result.headingChanges).toHaveLength(1);
      expect(result.linkUpdates).toHaveLength(1);
      
      // File should not be modified
      const unchangedContent = await readFile(testFile1, 'utf-8');
      expect(unchangedContent).toBe(testContent);
    });
  });

  describe('multiple files processing', () => {
    it('should process multiple files correctly', async () => {
      const file1Content = `# File 1

## Getting Started

Content in file 1.
`;

      const file2Content = `# File 2

## Getting Started

Content in file 2.

See [getting started](#getting-started) for more.
`;

      await writeFile(testFile1, file1Content, 'utf-8');
      await writeFile(testFile2, file2Content, 'utf-8');

      const options: RefactorHeadingsOperationOptions = {
        oldHeading: 'Getting Started',
        newHeading: 'Quick Start Guide',
        updateCrossReferences: true,
        dryRun: false,
        verbose: false,
      };

      const result = await refactorHeadings([testFile1, testFile2], options);

      expect(result.filesProcessed).toBe(2);
      expect(result.headingsChanged).toBe(2); // One heading in each file
      expect(result.linksUpdated).toBe(1); // One link in file2
    });
  });

  describe('error handling', () => {
    it('should handle file read errors gracefully', async () => {
      const nonexistentFile = join(testDir, 'nonexistent.md');

      const options: RefactorHeadingsOperationOptions = {
        oldHeading: 'Getting Started',
        newHeading: 'Quick Start Guide',
        dryRun: false,
        verbose: false,
      };

      const result = await refactorHeadings([nonexistentFile], options);

      expect(result.filesProcessed).toBe(0); // No files were actually processed
      expect(result.fileErrors).toHaveLength(1);
      expect(result.fileErrors[0].file).toBe(nonexistentFile);
      expect(result.fileErrors[0].error).toContain('Failed to resolve file pattern');
      expect(result.success).toBe(false);
    });
  });

  describe('custom slug generation', () => {
    it('should use custom slugify function when provided', async () => {
      const testContent = `## Getting Started\n\nContent.`;
      await writeFile(testFile1, testContent, 'utf-8');

      const options: RefactorHeadingsOperationOptions = {
        oldHeading: 'Getting Started',
        newHeading: 'Quick Start Guide',
        slugify: (text: string) => text.toLowerCase().replace(/\s+/g, '_'),
        dryRun: false,
        verbose: false,
      };

      const result = await refactorHeadings([testFile1], options);

      expect(result.headingChanges[0].oldSlug).toBe('getting_started');
      expect(result.headingChanges[0].newSlug).toBe('quick_start_guide');
    });
  });

  describe('regex escaping', () => {
    it('should handle special characters in heading text', async () => {
      const testContent = `## [API] Reference (v1.0)

Content here.
`;

      const expectedContent = `## [New API] Reference (v2.0)

Content here.
`;

      await writeFile(testFile1, testContent, 'utf-8');

      const options: RefactorHeadingsOperationOptions = {
        oldHeading: '[API] Reference (v1.0)',
        newHeading: '[New API] Reference (v2.0)',
        dryRun: false,
        verbose: false,
      };

      const result = await refactorHeadings([testFile1], options);

      expect(result.headingsChanged).toBe(1);
      
      const modifiedContent = await readFile(testFile1, 'utf-8');
      expect(modifiedContent).toBe(expectedContent);
    });
  });
});

describe('formatRefactorHeadingsResults', () => {
  it('should format results with heading changes and link updates', () => {
    const result = {
      success: true,
      filesProcessed: 2,
      headingsChanged: 3,
      linksUpdated: 2,
      headingChanges: [
        {
          filePath: 'file1.md',
          line: 5,
          oldText: 'Getting Started',
          newText: 'Quick Start Guide',
          oldSlug: 'getting-started',
          newSlug: 'quick-start-guide',
          level: 2,
        },
        {
          filePath: 'file2.md',
          line: 10,
          oldText: 'Getting Started',
          newText: 'Quick Start Guide',
          oldSlug: 'getting-started',
          newSlug: 'quick-start-guide',
          level: 3,
        },
      ],
      linkUpdates: [
        {
          filePath: 'file1.md',
          line: 15,
          oldLink: '#getting-started',
          newLink: '#quick-start-guide',
          linkType: 'anchor' as const,
        },
      ],
      fileErrors: [],
      processingTime: 1500,
    };

    const options: RefactorHeadingsOperationOptions = {
      oldHeading: 'Getting Started',
      newHeading: 'Quick Start Guide',
      dryRun: false,
      verbose: false,
    };

    const formatted = formatRefactorHeadingsResults(result, options);

    expect(formatted).toContain('🔧 Heading Refactoring Results');
    expect(formatted).toContain('Files processed: 2');
    expect(formatted).toContain('Headings changed: 3');
    expect(formatted).toContain('Links updated: 2');
    expect(formatted).toContain('Processing time: 1500ms');
    expect(formatted).toContain('📝 Heading Changes:');
    expect(formatted).toContain('🔗 Link Updates:');
    expect(formatted).toContain('file1.md (line 5)');
    expect(formatted).toContain('## Getting Started');
    expect(formatted).toContain('## Quick Start Guide');
    expect(formatted).toContain('#getting-started → #quick-start-guide');
  });

  it('should show dry run indicator when in dry run mode', () => {
    const result = {
      success: true,
      filesProcessed: 1,
      headingsChanged: 1,
      linksUpdated: 0,
      headingChanges: [],
      linkUpdates: [],
      fileErrors: [],
      processingTime: 500,
    };

    const options: RefactorHeadingsOperationOptions = {
      oldHeading: 'Old',
      newHeading: 'New',
      dryRun: true,
      verbose: false,
    };

    const formatted = formatRefactorHeadingsResults(result, options);

    expect(formatted).toContain('🔍 Dry run - no files were actually modified');
  });

  it('should show errors when present', () => {
    const result = {
      success: false,
      filesProcessed: 1,
      headingsChanged: 0,
      linksUpdated: 0,
      headingChanges: [],
      linkUpdates: [],
      fileErrors: [
        { file: 'error.md', error: 'File not found' },
        { file: 'error2.md', error: 'Permission denied' },
      ],
      processingTime: 100,
    };

    const options: RefactorHeadingsOperationOptions = {
      oldHeading: 'Old',
      newHeading: 'New',
      dryRun: false,
      verbose: false,
    };

    const formatted = formatRefactorHeadingsResults(result, options);

    expect(formatted).toContain('💥 Errors:');
    expect(formatted).toContain('💥 error.md: File not found');
    expect(formatted).toContain('💥 error2.md: Permission denied');
  });

  it('should handle empty results gracefully', () => {
    const result = {
      success: true,
      filesProcessed: 0,
      headingsChanged: 0,
      linksUpdated: 0,
      headingChanges: [],
      linkUpdates: [],
      fileErrors: [],
      processingTime: 0,
    };

    const options: RefactorHeadingsOperationOptions = {
      oldHeading: 'Old',
      newHeading: 'New',
      dryRun: false,
      verbose: false,
    };

    const formatted = formatRefactorHeadingsResults(result, options);

    expect(formatted).toContain('🔧 Heading Refactoring Results');
    expect(formatted).toContain('Files processed: 0');
    expect(formatted).toContain('Headings changed: 0');
    expect(formatted).toContain('Links updated: 0');
    expect(formatted).not.toContain('📝 Heading Changes:');
    expect(formatted).not.toContain('🔗 Link Updates:');
  });
});