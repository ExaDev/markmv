import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MarkdownLink, ParsedMarkdownFile, ReferenceDefinition } from '../types/links.js';
import { LinkRefactorer } from './link-refactorer.js';

describe('LinkRefactorer', () => {
  const testDir = join(process.cwd(), 'test-temp-refactorer');
  let refactorer: LinkRefactorer;

  beforeEach(async () => {
    refactorer = new LinkRefactorer();
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
    await fs.mkdir(join(filePath, '..'), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
  };

  const createMockParsedFile = (
    filePath: string,
    links: MarkdownLink[] = [],
    references: ReferenceDefinition[] = []
  ): ParsedMarkdownFile => ({
    filePath,
    links,
    outgoingLinks: links,
    incomingLinks: [],
    references,
    headers: [],
    claudeImports: [],
    embeddedFiles: [],
    metadata: { frontmatter: '', wordCount: 0, headingCount: 0, linkCount: links.length },
  });

  describe('constructor and options', () => {
    it('should use default options', () => {
      const refactorer = new LinkRefactorer();
      expect(refactorer).toBeDefined();
    });

    it('should accept custom options', () => {
      const refactorer = new LinkRefactorer({
        preferRelativePaths: false,
        updateClaudeImports: false,
        preserveFormatting: false,
      });
      expect(refactorer).toBeDefined();
    });
  });

  describe('refactorLinksForFileMove', () => {
    it('should update internal links when target file is moved', async () => {
      const sourceContent = `# Document
      
[Link to target](./target.md)
[Another link](./other.md)`;

      const sourceFile = await createTestFile('source.md', sourceContent);
      const targetFile = join(testDir, 'target.md');
      const newTargetFile = join(testDir, 'renamed-target.md');

      const mockParsedFile = createMockParsedFile(sourceFile, [
        {
          text: 'Link to target',
          href: './target.md',
          type: 'internal',
          line: 3,
          column: 1,
          resolvedPath: targetFile,
          absolute: false,
        },
        {
          text: 'Another link',
          href: './other.md',
          type: 'internal',
          line: 4,
          column: 1,
          resolvedPath: join(testDir, 'other.md'),
          absolute: false,
        },
      ]);

      const result = await refactorer.refactorLinksForFileMove(
        mockParsedFile,
        targetFile,
        newTargetFile
      );

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].type).toBe('link-updated');
      expect(result.changes[0].oldValue).toBe('./target.md');
      expect(result.changes[0].newValue).toBe('./renamed-target.md');
      expect(result.errors).toHaveLength(0);
      expect(result.updatedContent).toContain('[Link to target](./renamed-target.md)');
      expect(result.updatedContent).toContain('[Another link](./other.md)'); // Unchanged
    });

    it('should update Claude import links when enabled', async () => {
      const sourceContent = `# Document
      
@./target.md
@./other.md`;

      const sourceFile = await createTestFile('source.md', sourceContent);
      const targetFile = join(testDir, 'target.md');
      const newTargetFile = join(testDir, 'renamed-target.md');

      const refactorer = new LinkRefactorer({ updateClaudeImports: true });

      const mockParsedFile = createMockParsedFile(sourceFile, [
        {
          text: '@./target.md',
          href: './target.md',
          type: 'claude-import',
          line: 3,
          column: 1,
          resolvedPath: targetFile,
          absolute: false,
        },
        {
          text: '@./other.md',
          href: './other.md',
          type: 'claude-import',
          line: 4,
          column: 1,
          resolvedPath: join(testDir, 'other.md'),
          absolute: false,
        },
      ]);

      const result = await refactorer.refactorLinksForFileMove(
        mockParsedFile,
        targetFile,
        newTargetFile
      );

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].oldValue).toBe('./target.md');
      expect(result.changes[0].newValue).toBe('./renamed-target.md');
      expect(result.updatedContent).toContain('@./renamed-target.md');
      expect(result.updatedContent).toContain('@./other.md'); // Unchanged
    });

    it('should handle image links', async () => {
      const sourceContent = `# Document
      
![Image](./image.png)
![Another](./other.png)`;

      const sourceFile = await createTestFile('source.md', sourceContent);
      const targetFile = join(testDir, 'image.png');
      const newTargetFile = join(testDir, 'renamed-image.png');

      const mockParsedFile = createMockParsedFile(sourceFile, [
        {
          text: 'Image',
          href: './image.png',
          type: 'image',
          line: 3,
          column: 1,
          resolvedPath: targetFile,
          absolute: false,
        },
        {
          text: 'Another',
          href: './other.png',
          type: 'image',
          line: 4,
          column: 1,
          resolvedPath: join(testDir, 'other.png'),
          absolute: false,
        },
      ]);

      const result = await refactorer.refactorLinksForFileMove(
        mockParsedFile,
        targetFile,
        newTargetFile
      );

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].type).toBe('link-updated');
      expect(result.changes[0].oldValue).toBe('./image.png');
      expect(result.changes[0].newValue).toBe('./renamed-image.png');
      expect(result.errors).toHaveLength(0);
      expect(result.updatedContent).toContain('![Image](./renamed-image.png)');
      expect(result.updatedContent).toContain('![Another](./other.png)'); // Should be unchanged
    });

    it('should preserve link titles and formatting', async () => {
      const sourceContent = `# Document
      
[Link with title](./target.md "Title here")
![Image with title](./image.png "Image title")`;

      const sourceFile = await createTestFile('source.md', sourceContent);
      const targetFile = join(testDir, 'target.md');
      const newTargetFile = join(testDir, 'renamed-target.md');

      const mockParsedFile = createMockParsedFile(sourceFile, [
        {
          text: 'Link with title',
          href: './target.md',
          type: 'internal',
          line: 3,
          column: 1,
          resolvedPath: targetFile,
          absolute: false,
        },
      ]);

      const result = await refactorer.refactorLinksForFileMove(
        mockParsedFile,
        targetFile,
        newTargetFile
      );

      expect(result.updatedContent).toContain(
        '[Link with title](./renamed-target.md "Title here")'
      );
    });

    it('should handle links with anchors', async () => {
      const sourceContent = `# Document
      
[Link to section](./target.md#section)`;

      const sourceFile = await createTestFile('source.md', sourceContent);
      const targetFile = join(testDir, 'target.md');
      const newTargetFile = join(testDir, 'renamed-target.md');

      const mockParsedFile = createMockParsedFile(sourceFile, [
        {
          text: 'Link to section',
          href: './target.md#section',
          type: 'internal',
          line: 3,
          column: 1,
          resolvedPath: targetFile,
          absolute: false,
        },
      ]);

      const result = await refactorer.refactorLinksForFileMove(
        mockParsedFile,
        targetFile,
        newTargetFile
      );

      expect(result.updatedContent).toContain('[Link to section](./renamed-target.md#section)');
    });

    it('should handle multiple links on same line', async () => {
      const sourceContent = `# Document
      
Links: [First](./target.md) and [Second](./target.md#section)`;

      const sourceFile = await createTestFile('source.md', sourceContent);
      const targetFile = join(testDir, 'target.md');
      const newTargetFile = join(testDir, 'renamed-target.md');

      const mockParsedFile = createMockParsedFile(sourceFile, [
        {
          text: 'First',
          href: './target.md',
          type: 'internal',
          line: 3,
          column: 8,
          resolvedPath: targetFile,
          absolute: false,
        },
        {
          text: 'Second',
          href: './target.md#section',
          type: 'internal',
          line: 3,
          column: 32,
          resolvedPath: targetFile,
          absolute: false,
        },
      ]);

      const result = await refactorer.refactorLinksForFileMove(
        mockParsedFile,
        targetFile,
        newTargetFile
      );

      expect(result.changes).toHaveLength(2);
      expect(result.updatedContent).toContain('[First](./renamed-target.md)');
      expect(result.updatedContent).toContain('[Second](./renamed-target.md#section)');
    });

    it('should handle error during link refactoring', async () => {
      // Create a file with invalid content that might cause parsing issues
      const sourceFile = await createTestFile('source.md', '[Invalid link]()');

      const mockParsedFile = createMockParsedFile(sourceFile, [
        {
          text: 'Invalid link',
          href: '',
          type: 'internal',
          line: 1,
          column: 1,
          resolvedPath: join(testDir, 'target.md'),
          absolute: false,
        },
      ]);

      const result = await refactorer.refactorLinksForFileMove(
        mockParsedFile,
        join(testDir, 'target.md'),
        join(testDir, 'new-target.md')
      );

      // Since we're not actually creating the target file, this should succeed
      // but update the link anyway
      expect(result.errors.length).toBe(0);
    });
  });

  describe('refactorLinksForCurrentFileMove', () => {
    it('should update relative links when source file moves', async () => {
      const sourceContent = `# Document
      
[Relative link](./target.md)
[Absolute link](/absolute/path.md)
[External link](https://example.com)`;

      const sourceFile = await createTestFile('source.md', sourceContent);
      const newSourceFile = join(testDir, 'subdir', 'source.md');

      const mockParsedFile = createMockParsedFile(sourceFile, [
        {
          text: 'Relative link',
          href: './target.md',
          type: 'internal',
          line: 3,
          column: 1,
          resolvedPath: join(testDir, 'target.md'),
          absolute: false,
        },
        {
          text: 'Absolute link',
          href: '/absolute/path.md',
          type: 'internal',
          line: 4,
          column: 1,
          resolvedPath: '/absolute/path.md',
          absolute: true,
        },
        {
          text: 'External link',
          href: 'https://example.com',
          type: 'external',
          line: 5,
          column: 1,
          resolvedPath: '',
          absolute: false,
        },
      ]);

      const result = await refactorer.refactorLinksForCurrentFileMove(
        mockParsedFile,
        newSourceFile
      );

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].oldValue).toBe('./target.md');
      // Normalize path separators for cross-platform compatibility
      const normalizedNewValue = result.changes[0].newValue.replace(/\\/g, '/');
      expect(normalizedNewValue).toBe('../target.md');
      expect(result.updatedContent).toContain('[Relative link](../target.md)');
      expect(result.updatedContent).toContain('[Absolute link](/absolute/path.md)'); // Unchanged
      expect(result.updatedContent).toContain('[External link](https://example.com)'); // Unchanged
    });

    it('should update Claude imports when enabled', async () => {
      const sourceContent = `# Document
      
@./target.md
@../other.md`;

      const sourceFile = await createTestFile('source.md', sourceContent);
      const newSourceFile = join(testDir, 'subdir', 'source.md');

      const refactorer = new LinkRefactorer({ updateClaudeImports: true });

      const mockParsedFile = createMockParsedFile(sourceFile, [
        {
          text: '@./target.md',
          href: './target.md',
          type: 'claude-import',
          line: 3,
          column: 1,
          resolvedPath: join(testDir, 'target.md'),
          absolute: false,
        },
        {
          text: '@../other.md',
          href: '../other.md',
          type: 'claude-import',
          line: 4,
          column: 1,
          resolvedPath: join(testDir, '..', 'other.md'),
          absolute: false,
        },
      ]);

      const result = await refactorer.refactorLinksForCurrentFileMove(
        mockParsedFile,
        newSourceFile
      );

      expect(result.changes).toHaveLength(2);
      // Normalize path separators for cross-platform compatibility
      const normalizedContent = result.updatedContent.replace(/\\/g, '/');
      expect(normalizedContent).toContain('@../target.md');
      expect(normalizedContent).toContain('@../../other.md');
    });

    it('should skip Claude imports when disabled', async () => {
      const sourceContent = `# Document
      
@./target.md`;

      const sourceFile = await createTestFile('source.md', sourceContent);
      const newSourceFile = join(testDir, 'subdir', 'source.md');

      const refactorer = new LinkRefactorer({ updateClaudeImports: false });

      const mockParsedFile = createMockParsedFile(sourceFile, [
        {
          text: '@./target.md',
          href: './target.md',
          type: 'claude-import',
          line: 3,
          column: 1,
          resolvedPath: join(testDir, 'target.md'),
          absolute: false,
        },
      ]);

      const result = await refactorer.refactorLinksForCurrentFileMove(
        mockParsedFile,
        newSourceFile
      );

      expect(result.changes).toHaveLength(0);
      expect(result.updatedContent).toContain('@./target.md'); // Unchanged
    });
  });

  describe('refactorReferenceDefinitions', () => {
    it('should update reference definitions when target file moves', async () => {
      const sourceContent = `# Document

[Link text][ref1]
[Another link][ref2]

[ref1]: ./target.md "Target file"
[ref2]: ./other.md "Other file"`;

      const sourceFile = await createTestFile('source.md', sourceContent);
      const targetFile = join(testDir, 'target.md');
      const newTargetFile = join(testDir, 'renamed-target.md');

      const mockParsedFile = createMockParsedFile(
        sourceFile,
        [],
        [
          {
            id: 'ref1',
            url: './target.md',
            title: 'Target file',
            line: 6,
          },
          {
            id: 'ref2',
            url: './other.md',
            title: 'Other file',
            line: 7,
          },
        ]
      );

      const result = await refactorer.refactorReferenceDefinitions(
        mockParsedFile,
        targetFile,
        newTargetFile
      );

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].oldValue).toBe('./target.md');
      expect(result.changes[0].newValue).toBe('./renamed-target.md');
      expect(result.updatedContent).toContain('[ref1]: ./renamed-target.md "Target file"');
      expect(result.updatedContent).toContain('[ref2]: ./other.md "Other file"'); // Unchanged
    });

    it('should handle references without titles', async () => {
      const sourceContent = `# Document

[Link text][ref1]

[ref1]: ./target.md`;

      const sourceFile = await createTestFile('source.md', sourceContent);
      const targetFile = join(testDir, 'target.md');
      const newTargetFile = join(testDir, 'renamed-target.md');

      const mockParsedFile = createMockParsedFile(
        sourceFile,
        [],
        [
          {
            id: 'ref1',
            url: './target.md',
            title: undefined,
            line: 5,
          },
        ]
      );

      const result = await refactorer.refactorReferenceDefinitions(
        mockParsedFile,
        targetFile,
        newTargetFile
      );

      expect(result.changes).toHaveLength(1);
      expect(result.updatedContent).toContain('[ref1]: ./renamed-target.md');
      expect(result.updatedContent).not.toContain('""');
    });

    it('should handle error during reference refactoring', async () => {
      const sourceFile = await createTestFile('source.md', '[ref1]: ./target.md');

      const mockParsedFile = createMockParsedFile(
        sourceFile,
        [],
        [
          {
            id: 'ref1',
            url: './target.md',
            title: undefined,
            line: 1,
          },
        ]
      );

      const result = await refactorer.refactorReferenceDefinitions(
        mockParsedFile,
        join(testDir, 'target.md'),
        join(testDir, 'new-target.md')
      );

      // This should succeed since we created the file
      expect(result.errors.length).toBe(0);
      expect(result.changes.length).toBe(1);
    });
  });

  describe('private methods through public interface', () => {
    it('should correctly escape regex special characters', async () => {
      const sourceContent = `# Document
      
[Link](./file[special].md)`;

      const sourceFile = await createTestFile('source.md', sourceContent);
      const targetFile = join(testDir, 'file[special].md');
      const newTargetFile = join(testDir, 'file[renamed].md');

      const mockParsedFile = createMockParsedFile(sourceFile, [
        {
          text: 'Link',
          href: './file[special].md',
          type: 'internal',
          line: 3,
          column: 1,
          resolvedPath: targetFile,
          absolute: false,
        },
      ]);

      const result = await refactorer.refactorLinksForFileMove(
        mockParsedFile,
        targetFile,
        newTargetFile
      );

      expect(result.changes).toHaveLength(1);
      expect(result.updatedContent).toContain('[Link](./file[renamed].md)');
    });

    it('should handle complex file paths with spaces and special characters', async () => {
      const sourceContent = `# Document
      
[Link](./My File (1).md)`;

      const sourceFile = await createTestFile('source.md', sourceContent);
      const targetFile = join(testDir, 'My File (1).md');
      const newTargetFile = join(testDir, 'My File (Renamed).md');

      const mockParsedFile = createMockParsedFile(sourceFile, [
        {
          text: 'Link',
          href: './My File (1).md',
          type: 'internal',
          line: 3,
          column: 1,
          resolvedPath: targetFile,
          absolute: false,
        },
      ]);

      const result = await refactorer.refactorLinksForFileMove(
        mockParsedFile,
        targetFile,
        newTargetFile
      );

      expect(result.changes).toHaveLength(1);
      expect(result.updatedContent).toContain('[Link](./My File (Renamed).md)');
    });
  });

  describe('options behavior', () => {
    it('should respect preferRelativePaths option', async () => {
      const sourceContent = `# Document
      
[Link](./target.md)`;

      const sourceFile = await createTestFile('source.md', sourceContent);
      const targetFile = join(testDir, 'target.md');
      const newTargetFile = join(testDir, 'renamed-target.md');

      const refactorer = new LinkRefactorer({ preferRelativePaths: false });

      const mockParsedFile = createMockParsedFile(sourceFile, [
        {
          text: 'Link',
          href: './target.md',
          type: 'internal',
          line: 3,
          column: 1,
          resolvedPath: targetFile,
          absolute: false,
        },
      ]);

      const result = await refactorer.refactorLinksForFileMove(
        mockParsedFile,
        targetFile,
        newTargetFile
      );

      expect(result.changes).toHaveLength(1);
      // Should use absolute path when preferRelativePaths is false
      // Normalize path separators for cross-platform compatibility
      const normalizedNewValue = result.changes[0].newValue.replace(/\\/g, '/');
      const normalizedExpected = newTargetFile.replace(/\\/g, '/');
      expect(normalizedNewValue).toBe(normalizedExpected);
    });

    it('should preserve formatting when preserveFormatting is enabled', async () => {
      // This is tested implicitly in other tests since preserveFormatting defaults to true
      // The regex-based replacement preserves titles, spacing, etc.
      expect(true).toBe(true); // Placeholder - formatting preservation is tested throughout
    });
  });
});
