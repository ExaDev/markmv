import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileUtils } from '../utils/file-utils.js';
import { ContentSplitter } from './content-splitter.js';

describe('ContentSplitter', () => {
  let splitter: ContentSplitter;
  let testDir: string;

  beforeEach(async () => {
    splitter = new ContentSplitter();
    testDir = join(tmpdir(), `markmv-splitter-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('splitFile', () => {
    it('should split a markdown file by headers', async () => {
      const sourceFile = join(testDir, 'source.md');
      const content = `# Main Document

Introduction content.

## Section A

Content for section A with [link](./other.md).

## Section B

Content for section B.
@./config.md

## Section C

Final section.`;

      await writeFile(sourceFile, content);

      const result = await splitter.splitFile(sourceFile, {
        strategy: 'headers',
        headerLevel: 2,
        outputDir: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.createdFiles).toHaveLength(3);
      expect(result.createdFiles[0]).toContain('section-a.md');
      expect(result.createdFiles[1]).toContain('section-b.md');
      expect(result.createdFiles[2]).toContain('section-c.md');

      // Check that files were actually created
      for (const filePath of result.createdFiles) {
        expect(await FileUtils.exists(filePath)).toBe(true);
      }

      // Check content of split files
      const sectionAContent = await FileUtils.readTextFile(result.createdFiles[0]);
      expect(sectionAContent).toContain('## Section A');
      expect(sectionAContent).toContain('Content for section A');
    });

    it('should handle dry-run mode', async () => {
      const sourceFile = join(testDir, 'source.md');
      const content = `# Document

## Section 1

Content 1.

## Section 2

Content 2.`;

      await writeFile(sourceFile, content);

      const result = await splitter.splitFile(sourceFile, {
        strategy: 'headers',
        dryRun: true,
        outputDir: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.createdFiles).toHaveLength(2);

      // Files should not actually be created in dry-run
      for (const filePath of result.createdFiles) {
        expect(await FileUtils.exists(filePath)).toBe(false);
      }
    });

    it('should update relative links in split sections', async () => {
      await mkdir(join(testDir, 'docs'));
      const sourceFile = join(testDir, 'docs', 'source.md');
      const targetFile = join(testDir, 'target.md');

      const content = `## Section 1

Link to [target](../target.md) file.

## Section 2

Another [link](../target.md) here.
@../config.md`;

      await writeFile(sourceFile, content);
      await writeFile(targetFile, '# Target');

      const result = await splitter.splitFile(sourceFile, {
        strategy: 'headers',
        outputDir: join(testDir, 'docs'),
      });

      expect(result.success).toBe(true);

      // Check that links are still correct in split files
      const sectionContent = await FileUtils.readTextFile(result.createdFiles[0]);
      expect(sectionContent).toContain('../target.md');
    });

    it('should handle size-based splitting', async () => {
      const sourceFile = join(testDir, 'large.md');
      const content = `# Large Document

${'This is a line of content that will be repeated many times.\n'.repeat(50)}

## Middle Section

${'More content lines here for the middle section.\n'.repeat(50)}`;

      await writeFile(sourceFile, content);

      const result = await splitter.splitFile(sourceFile, {
        strategy: 'size',
        maxSize: 2, // 2KB
        outputDir: testDir,
      });


      expect(result.success).toBe(true);
      expect(result.createdFiles.length).toBeGreaterThan(1);
    }, 10000);

    it('should handle manual splitting with markers', async () => {
      const sourceFile = join(testDir, 'manual.md');
      const content = `# Document

First section content.

<!-- split -->

## Second Section

Second section content.

---split---

## Third Section

Third section content.`;

      await writeFile(sourceFile, content);

      const result = await splitter.splitFile(sourceFile, {
        strategy: 'manual',
        outputDir: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.createdFiles).toHaveLength(3);

      const firstSection = await FileUtils.readTextFile(result.createdFiles[0]);
      expect(firstSection).toContain('First section content');
      expect(firstSection).not.toContain('<!-- split -->');
    });

    it('should preserve frontmatter in original file', async () => {
      const sourceFile = join(testDir, 'with-frontmatter.md');
      const content = `---
title: Test Document
author: Test Author
tags: [test, markdown]
---

# Main Title

## Section 1

Content here.

## Section 2

More content.`;

      await writeFile(sourceFile, content);

      const result = await splitter.splitFile(sourceFile, {
        strategy: 'headers',
        outputDir: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.modifiedFiles).toContain(sourceFile);

      // Check that original file now contains only frontmatter
      const remainingContent = await FileUtils.readTextFile(sourceFile);
      expect(remainingContent).toContain('title: Test Document');
      expect(remainingContent).not.toContain('## Section 1');
    });

    it('should handle files with external references', async () => {
      const sourceFile = join(testDir, 'source.md');
      const referenceFile = join(testDir, 'reference.md');

      await writeFile(
        sourceFile,
        `## Section A

Content for A.

## Section B

Content for B.`
      );

      await writeFile(
        referenceFile,
        `# Reference

This links to [source](./source.md).
@./source.md`
      );

      const result = await splitter.splitFile(sourceFile, {
        strategy: 'headers',
        outputDir: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.modifiedFiles).toContain(referenceFile);

      // Check that external reference was updated
      const updatedReference = await FileUtils.readTextFile(referenceFile);
      expect(updatedReference).toContain('./section-a.md'); // Points to first section
    });

    it('should validate non-existent files', async () => {
      const result = await splitter.splitFile('/nonexistent/file.md', {
        strategy: 'headers',
      });

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Source file does not exist');
    });

    it('should validate non-markdown files', async () => {
      const textFile = join(testDir, 'document.txt');
      await writeFile(textFile, 'Plain text content');

      const result = await splitter.splitFile(textFile, {
        strategy: 'headers',
      });

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Source file must be a markdown file');
    });

    it('should handle files with no splittable content', async () => {
      const sourceFile = join(testDir, 'simple.md');
      await writeFile(sourceFile, '# Just a title\n\nSome content without sections.');

      const result = await splitter.splitFile(sourceFile, {
        strategy: 'headers',
        headerLevel: 2,
      });

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('No headers found at level 2');
    });
  });
});
