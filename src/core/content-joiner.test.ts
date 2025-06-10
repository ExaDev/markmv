import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { JoinOperationOptions } from '../types/operations.js';
import { ContentJoiner } from './content-joiner.js';

describe('ContentJoiner', () => {
  const testDir = join(process.cwd(), 'test-temp');
  let joiner: ContentJoiner;

  beforeEach(async () => {
    joiner = new ContentJoiner();
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  const createTestFile = async (filename: string, content: string): Promise<string> => {
    const filePath = join(testDir, filename);
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  };

  describe('joinFiles', () => {
    it('should join files with dependency ordering', async () => {
      const file1 = await createTestFile(
        'intro.md',
        `---
title: "Introduction"
---

# Introduction

This is the introduction. See [basics](basics.md) for more.`
      );

      const file2 = await createTestFile(
        'basics.md',
        `---
title: "Basics"
---

# Basics

This covers basics. Check [advanced](advanced.md) next.`
      );

      const file3 = await createTestFile(
        'advanced.md',
        `---
title: "Advanced"
---

# Advanced Topics

Advanced concepts here.`
      );

      const options: JoinOperationOptions = {
        orderStrategy: 'dependency',
        output: join(testDir, 'joined.md'),
        dryRun: false,
      };

      const result = await joiner.joinFiles([file1, file2, file3], options);

      expect(result.success).toBe(true);
      expect(result.createdFiles).toHaveLength(1);
      expect(result.errors).toHaveLength(0);

      // Check that joined file was created
      const joinedContent = await fs.readFile(join(testDir, 'joined.md'), 'utf8');
      expect(joinedContent).toContain('title: "Advanced & Basics & Introduction"');
      expect(joinedContent).toContain('# Advanced Topics');
      expect(joinedContent).toContain('# Basics');
      expect(joinedContent).toContain('# Introduction');

      // Advanced should come before Basics (dependency order)
      const advancedIndex = joinedContent.indexOf('# Advanced Topics');
      const basicsIndex = joinedContent.indexOf('# Basics');
      expect(advancedIndex).toBeLessThan(basicsIndex);
    });

    it('should join files alphabetically when requested', async () => {
      const file1 = await createTestFile('zebra.md', '# Zebra File\n\nContent about zebras.');
      const file2 = await createTestFile('alpha.md', '# Alpha File\n\nContent about alpha.');

      const options: JoinOperationOptions = {
        orderStrategy: 'alphabetical',
        output: join(testDir, 'alpha-joined.md'),
        dryRun: false,
      };

      const result = await joiner.joinFiles([file1, file2], options);

      expect(result.success).toBe(true);

      const joinedContent = await fs.readFile(join(testDir, 'alpha-joined.md'), 'utf8');
      const alphaIndex = joinedContent.indexOf('# Alpha File');
      const zebraIndex = joinedContent.indexOf('# Zebra File');
      expect(alphaIndex).toBeLessThan(zebraIndex);
    });

    it('should handle dry run mode', async () => {
      const file1 = await createTestFile('test1.md', '# Test 1\n\nContent 1');
      const file2 = await createTestFile('test2.md', '# Test 2\n\nContent 2');

      const options: JoinOperationOptions = {
        output: join(testDir, 'dry-run.md'),
        dryRun: true,
      };

      const result = await joiner.joinFiles([file1, file2], options);

      expect(result.success).toBe(true);
      expect(result.createdFiles).toContain(join(testDir, 'dry-run.md'));

      // File should not actually exist
      let fileExists = true;
      try {
        await fs.access(join(testDir, 'dry-run.md'));
      } catch {
        fileExists = false;
      }
      expect(fileExists).toBe(false);
    });

    it('should generate default output filename', async () => {
      const file1 = await createTestFile('main.md', '# Main\n\nContent');
      const file2 = await createTestFile('other.md', '# Other\n\nContent');

      const options: JoinOperationOptions = {
        dryRun: true, // Don't actually create the file
      };

      const result = await joiner.joinFiles([file1, file2], options);

      expect(result.success).toBe(true);
      expect(result.createdFiles[0]).toMatch(/main-joined\.md$/);
    });

    it('should handle files with frontmatter conflicts', async () => {
      const file1 = await createTestFile(
        'conflict1.md',
        `---
title: "First Title"
author: "Author 1"
tags: ["tag1", "tag2"]
---

# Content 1`
      );

      const file2 = await createTestFile(
        'conflict2.md',
        `---
title: "Second Title"
author: "Author 2"
tags: ["tag2", "tag3"]
---

# Content 2`
      );

      const options: JoinOperationOptions = {
        output: join(testDir, 'conflict-joined.md'),
        dryRun: false,
      };

      const result = await joiner.joinFiles([file1, file2], options);

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);

      // Check merged frontmatter
      const joinedContent = await fs.readFile(join(testDir, 'conflict-joined.md'), 'utf8');
      expect(joinedContent).toContain('title: "First Title & Second Title"');
      expect(joinedContent).toContain('author: "Author 1"'); // First author wins
      expect(joinedContent).toContain('"tag1", "tag2", "tag3"'); // Tags merged and deduplicated
    });

    it('should handle duplicate headers', async () => {
      const file1 = await createTestFile('dup1.md', '# Same Header\n\nContent from file 1');
      const file2 = await createTestFile('dup2.md', '# Same Header\n\nContent from file 2');

      const options: JoinOperationOptions = {
        output: join(testDir, 'dup-joined.md'),
        dryRun: false,
      };

      const result = await joiner.joinFiles([file1, file2], options);

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.includes('duplicate-headers'))).toBe(true);
    });

    it('should deduplicate links', async () => {
      const file1 = await createTestFile(
        'link1.md',
        '# File 1\n\n[Common Link](shared.md)\n\nContent 1'
      );
      const file2 = await createTestFile(
        'link2.md',
        '# File 2\n\n[Common Link](shared.md)\n\nContent 2'
      );

      const options: JoinOperationOptions = {
        output: join(testDir, 'dedup-joined.md'),
        dryRun: false,
      };

      const result = await joiner.joinFiles([file1, file2], options);

      expect(result.success).toBe(true);

      const joinedContent = await fs.readFile(join(testDir, 'dedup-joined.md'), 'utf8');
      const linkMatches = joinedContent.match(/\[Common Link\]\(shared\.md\)/g);
      expect(linkMatches?.length).toBe(1); // Should only appear once after deduplication
    });

    it('should handle missing files gracefully', async () => {
      const file1 = await createTestFile('exists.md', '# Exists\n\nContent');
      const missingFile = join(testDir, 'missing.md');

      const options: JoinOperationOptions = {
        output: join(testDir, 'partial-joined.md'),
        dryRun: false,
      };

      const result = await joiner.joinFiles([file1, missingFile], options);

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.includes('missing.md'))).toBe(true);

      // Should still create output with available files
      const joinedContent = await fs.readFile(join(testDir, 'partial-joined.md'), 'utf8');
      expect(joinedContent).toContain('# Exists');
    });

    it('should handle empty file list', async () => {
      const options: JoinOperationOptions = {
        output: join(testDir, 'empty.md'),
        dryRun: false,
      };

      const result = await joiner.joinFiles([], options);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('No valid files to join');
    });

    it('should preserve file structure when requested', async () => {
      const file1 = await createTestFile(
        'structured.md',
        `---
title: "Structured Content"
---

# Main Header

## Section 1

Content of section 1.

## Section 2

Content of section 2.`
      );

      const file2 = await createTestFile('simple.md', '# Simple Content\n\nJust simple content.');

      const options: JoinOperationOptions = {
        output: join(testDir, 'structured-joined.md'),
        dryRun: false,
      };

      const result = await joiner.joinFiles([file1, file2], options);

      expect(result.success).toBe(true);

      const joinedContent = await fs.readFile(join(testDir, 'structured-joined.md'), 'utf8');
      expect(joinedContent).toContain('## Section 1');
      expect(joinedContent).toContain('## Section 2');
      expect(joinedContent).toContain('# Simple Content');
    });
  });
});
