import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateToc, tocCommand } from './toc.js';

describe('TOC Command', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'markmv-toc-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('generateToc', () => {
    it('should generate TOC for a simple markdown file', async () => {
      const content = `# Main Title

## Section 1

Some content here.

### Subsection 1.1

More content.

## Section 2

Final content.
`;

      const filePath = join(tempDir, 'test.md');
      await writeFile(filePath, content, 'utf-8');

      const result = await generateToc([filePath], {
        position: 'after-title',
        minDepth: 2,
        maxDepth: 3,
      });

      expect(result.filesProcessed).toBe(1);
      expect(result.filesModified).toBe(1);
      expect(result.filesSkipped).toBe(0);
      expect(result.fileErrors).toEqual([]);

      // Check that TOC was inserted
      const modifiedContent = await readFile(filePath, 'utf-8');
      expect(modifiedContent).toContain('## Table of Contents');
      expect(modifiedContent).toContain('- [Section 1](#section-1)');
      expect(modifiedContent).toContain('  - [Subsection 1.1](#subsection-1-1)');
      expect(modifiedContent).toContain('- [Section 2](#section-2)');
    });

    it('should handle position "top"', async () => {
      const content = `# Main Title

## Section 1

Content here.
`;

      const filePath = join(tempDir, 'test.md');
      await writeFile(filePath, content, 'utf-8');

      const result = await generateToc([filePath], {
        position: 'top',
        title: 'Contents',
        headingLevel: 3,
      });

      expect(result.filesModified).toBe(1);

      const modifiedContent = await readFile(filePath, 'utf-8');
      expect(modifiedContent).toMatch(/^### Contents\n\n.*- \[Main Title\]\(#main-title\).*- \[Section 1\]\(#section-1\).*# Main Title/s);
    });

    it('should handle position "before-content"', async () => {
      const content = `---
title: Test
---

# Main Title

## Section 1

Content here.
`;

      const filePath = join(tempDir, 'test.md');
      await writeFile(filePath, content, 'utf-8');

      const result = await generateToc([filePath], {
        position: 'before-content',
      });

      expect(result.filesModified).toBe(1);

      const modifiedContent = await readFile(filePath, 'utf-8');
      // Check that TOC was inserted after frontmatter
      expect(modifiedContent).toContain('---\ntitle: Test\n---\n\n## Table of Contents');
      expect(modifiedContent).toContain('- [Main Title](#main-title)');
      expect(modifiedContent).toContain('- [Section 1](#section-1)');
    });

    it('should handle position "replace" with marker', async () => {
      const content = `# Main Title

<!-- TOC -->
Old TOC content
<!-- TOC -->

## Section 1

Content here.
`;

      const filePath = join(tempDir, 'test.md');
      await writeFile(filePath, content, 'utf-8');

      const result = await generateToc([filePath], {
        position: 'replace',
        marker: '<!-- TOC -->',
      });

      expect(result.filesModified).toBe(1);

      const modifiedContent = await readFile(filePath, 'utf-8');
      expect(modifiedContent).not.toContain('Old TOC content');
      expect(modifiedContent).toContain('<!-- TOC -->\n## Table of Contents\n\n- [Main Title](#main-title)\n  - [Section 1](#section-1)\n<!-- TOC -->');
    });

    it('should handle position "replace" with auto-detection', async () => {
      const content = `# Main Title

## Table of Contents

- Old link 1
- Old link 2

## Section 1

Content here.
`;

      const filePath = join(tempDir, 'test.md');
      await writeFile(filePath, content, 'utf-8');

      const result = await generateToc([filePath], {
        position: 'replace',
      });

      expect(result.filesModified).toBe(1);

      const modifiedContent = await readFile(filePath, 'utf-8');
      expect(modifiedContent).not.toContain('Old link 1');
      expect(modifiedContent).toContain('- [Main Title](#main-title)');
      expect(modifiedContent).toContain('- [Section 1](#section-1)');
    });

    it('should skip files with no headings when skipEmpty is true', async () => {
      const content = `This is just plain text with no headings.

Some more text here.
`;

      const filePath = join(tempDir, 'test.md');
      await writeFile(filePath, content, 'utf-8');

      const result = await generateToc([filePath], {
        skipEmpty: true,
      });

      expect(result.filesProcessed).toBe(1);
      expect(result.filesModified).toBe(0);
      expect(result.filesSkipped).toBe(1);

      // Content should be unchanged
      const modifiedContent = await readFile(filePath, 'utf-8');
      expect(modifiedContent).toBe(content);
    });

    it('should include line numbers when requested', async () => {
      const content = `# Main Title

## Section 1

Content here.

## Section 2

More content.
`;

      const filePath = join(tempDir, 'test.md');
      await writeFile(filePath, content, 'utf-8');

      const result = await generateToc([filePath], {
        includeLineNumbers: true,
        minDepth: 2,
      });

      expect(result.filesModified).toBe(1);

      const modifiedContent = await readFile(filePath, 'utf-8');
      expect(modifiedContent).toContain('- [Section 1](#section-1) (line 3)');
      expect(modifiedContent).toContain('- [Section 2](#section-2) (line 7)');
    });

    it('should handle depth filtering', async () => {
      const content = `# Main Title

## Section 1

### Subsection 1.1

#### Deep subsection

## Section 2

Content here.
`;

      const filePath = join(tempDir, 'test.md');
      await writeFile(filePath, content, 'utf-8');

      const result = await generateToc([filePath], {
        minDepth: 2,
        maxDepth: 3,
      });

      expect(result.filesModified).toBe(1);

      const modifiedContent = await readFile(filePath, 'utf-8');
      expect(modifiedContent).toContain('- [Section 1](#section-1)');
      expect(modifiedContent).toContain('  - [Subsection 1.1](#subsection-1-1)');
      // The original content should still contain the deep subsection
      // but it should not appear in the TOC
      expect(modifiedContent).toContain('#### Deep subsection');
      
      // Check that the TOC doesn't contain the deep subsection as a link
      const tocSection = modifiedContent.substring(
        modifiedContent.indexOf('## Table of Contents'),
        modifiedContent.indexOf('## Section 1')
      );
      expect(tocSection).not.toContain('[Deep subsection]');
      expect(modifiedContent).toContain('- [Section 2](#section-2)');
    });

    it('should handle dry run mode', async () => {
      const content = `# Main Title

## Section 1

Content here.
`;

      const filePath = join(tempDir, 'test.md');
      await writeFile(filePath, content, 'utf-8');

      const result = await generateToc([filePath], {
        dryRun: true,
      });

      expect(result.filesProcessed).toBe(1);
      expect(result.filesModified).toBe(1); // Would be modified
      expect(result.filesSkipped).toBe(0);

      // Content should be unchanged in dry run
      const modifiedContent = await readFile(filePath, 'utf-8');
      expect(modifiedContent).toBe(content);
    });

    it('should handle multiple files', async () => {
      const content1 = `# File 1

## Section 1

Content.
`;

      const content2 = `# File 2

## Section A

### Subsection A.1

Content.
`;

      const filePath1 = join(tempDir, 'file1.md');
      const filePath2 = join(tempDir, 'file2.md');
      await writeFile(filePath1, content1, 'utf-8');
      await writeFile(filePath2, content2, 'utf-8');

      const result = await generateToc([filePath1, filePath2], {
        position: 'after-title',
        minDepth: 2,
      });

      expect(result.filesProcessed).toBe(2);
      expect(result.filesModified).toBe(2);
      expect(result.filesSkipped).toBe(0);
      expect(result.fileErrors).toEqual([]);

      // Check first file
      const modifiedContent1 = await readFile(filePath1, 'utf-8');
      expect(modifiedContent1).toContain('- [Section 1](#section-1)');

      // Check second file
      const modifiedContent2 = await readFile(filePath2, 'utf-8');
      expect(modifiedContent2).toContain('- [Section A](#section-a)');
      expect(modifiedContent2).toContain('  - [Subsection A.1](#subsection-a-1)');
    });

    it('should handle file errors gracefully', async () => {
      const nonExistentFile = join(tempDir, 'nonexistent.md');

      const result = await generateToc([nonExistentFile], {});

      expect(result.filesProcessed).toBe(0);
      expect(result.filesModified).toBe(0);
      expect(result.filesSkipped).toBe(0);
      expect(result.fileErrors).toHaveLength(1);
      expect(result.fileErrors[0].file).toBe(nonExistentFile);
      expect(result.fileErrors[0].error).toContain('ENOENT');
    });

    it('should handle custom title and heading level', async () => {
      const content = `# Main Title

## Section 1

Content here.
`;

      const filePath = join(tempDir, 'test.md');
      await writeFile(filePath, content, 'utf-8');

      const result = await generateToc([filePath], {
        title: 'Document Contents',
        headingLevel: 4,
      });

      expect(result.filesModified).toBe(1);

      const modifiedContent = await readFile(filePath, 'utf-8');
      expect(modifiedContent).toContain('#### Document Contents\n\n- [Main Title](#main-title)\n  - [Section 1](#section-1)');
    });
  });

  describe('tocCommand', () => {
    it('should work with CLI options', async () => {
      const content = `# Main Title

## Section 1

Content here.
`;

      const filePath = join(tempDir, 'test.md');
      await writeFile(filePath, content, 'utf-8');

      // Capture console output
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await tocCommand([filePath], {
        minDepth: 2,
        maxDepth: 4,
        includeLineNumbers: false,
        position: 'after-title',
        title: 'Table of Contents',
        headingLevel: 2,
        skipEmpty: true,
        dryRun: false,
        verbose: false,
      });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('📋 TOC Generation Summary'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Files processed: 1'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Files modified: 1'));

      consoleSpy.mockRestore();

      // Check that TOC was added
      const modifiedContent = await readFile(filePath, 'utf-8');
      expect(modifiedContent).toContain('## Table of Contents');
      expect(modifiedContent).toContain('- [Section 1](#section-1)');
    });

    it('should handle invalid position option', async () => {
      const filePath = join(tempDir, 'test.md');
      await writeFile(filePath, '# Test', 'utf-8');

      await expect(tocCommand([filePath], {
        position: 'invalid-position',
        minDepth: 1,
        maxDepth: 6,
        includeLineNumbers: false,
        title: 'Table of Contents',
        headingLevel: 2,
        skipEmpty: true,
        dryRun: false,
        verbose: false,
      })).rejects.toThrow('Invalid position: invalid-position');
    });

    it('should output JSON when requested', async () => {
      const content = `# Main Title

## Section 1

Content here.
`;

      const filePath = join(tempDir, 'test.md');
      await writeFile(filePath, content, 'utf-8');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await tocCommand([filePath], {
        json: true,
        minDepth: 1,
        maxDepth: 6,
        includeLineNumbers: false,
        position: 'after-title',
        title: 'Table of Contents',
        headingLevel: 2,
        skipEmpty: true,
        dryRun: false,
        verbose: false,
      });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"filesProcessed": 1'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"filesModified": 1'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"filesSkipped": 0'));

      consoleSpy.mockRestore();
    });
  });
});