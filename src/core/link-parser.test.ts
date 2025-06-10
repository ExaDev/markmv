import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LinkParser } from '../link-parser.js';

describe('LinkParser', () => {
  let parser: LinkParser;
  let testDir: string;

  beforeEach(async () => {
    parser = new LinkParser();
    testDir = join(tmpdir(), `markmv-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('parseFile', () => {
    it('should parse regular markdown links', async () => {
      const content = `# Test File

This is a [regular link](./other.md) to another file.
And here's an [external link](https://example.com).
`;

      const filePath = join(testDir, 'test.md');
      await writeFile(filePath, content);

      const result = await parser.parseFile(filePath);

      expect(result.links).toHaveLength(2);

      const internalLink = result.links.find((l) => l.href === './other.md');
      expect(internalLink).toEqual({
        type: 'internal',
        href: './other.md',
        text: 'regular link',
        line: 3,
        column: 12,
        absolute: false,
        resolvedPath: join(testDir, 'other.md'),
      });

      const externalLink = result.links.find((l) => l.href === 'https://example.com');
      expect(externalLink).toEqual({
        type: 'external',
        href: 'https://example.com',
        text: 'external link',
        line: 4,
        column: 17,
        absolute: false,
      });
    });

    it('should parse Claude import links', async () => {
      const content = `# Test File with Claude Imports

@./local-file.md
@/absolute/path/file.md
@~/home/file.md

Some text with @inline-import.md in the middle.
`;

      const filePath = join(testDir, 'test.md');
      await writeFile(filePath, content);

      const result = await parser.parseFile(filePath);

      const claudeImports = result.links.filter((l) => l.type === 'claude-import');
      expect(claudeImports).toHaveLength(4);

      const relativeImport = claudeImports.find((l) => l.href === './local-file.md');
      expect(relativeImport).toEqual({
        type: 'claude-import',
        href: './local-file.md',
        text: '@./local-file.md',
        line: 3,
        column: 1,
        absolute: false,
        resolvedPath: join(testDir, 'local-file.md'),
      });

      const absoluteImport = claudeImports.find((l) => l.href === '/absolute/path/file.md');
      expect(absoluteImport).toEqual({
        type: 'claude-import',
        href: '/absolute/path/file.md',
        text: '@/absolute/path/file.md',
        line: 4,
        column: 1,
        absolute: true,
        resolvedPath: '/absolute/path/file.md',
      });

      const homeImport = claudeImports.find((l) => l.href === '~/home/file.md');
      expect(homeImport?.type).toBe('claude-import');
      expect(homeImport?.absolute).toBe(true);
      expect(homeImport?.resolvedPath).toMatch(/\/home\/file\.md$/);
    });

    it('should parse image links', async () => {
      const content = `# Test Images

![Alt text](./image.png)
![External image](https://example.com/image.jpg)
`;

      const filePath = join(testDir, 'test.md');
      await writeFile(filePath, content);

      const result = await parser.parseFile(filePath);

      const images = result.links.filter((l) => l.type === 'image');
      expect(images).toHaveLength(2);

      const localImage = images.find((l) => l.href === './image.png');
      expect(localImage).toEqual({
        type: 'image',
        href: './image.png',
        text: 'Alt text',
        line: 3,
        column: 1,
        absolute: false,
        resolvedPath: join(testDir, 'image.png'),
      });
    });

    it('should parse reference-style links', async () => {
      const content = `# Test References

This is a [reference link][ref1] and another [reference][ref2].

[ref1]: ./file1.md "Title 1"
[ref2]: https://example.com "Title 2"
`;

      const filePath = join(testDir, 'test.md');
      await writeFile(filePath, content);

      const result = await parser.parseFile(filePath);

      expect(result.references).toHaveLength(2);
      expect(result.references[0]).toEqual({
        id: 'ref1',
        url: './file1.md',
        title: 'Title 1',
        line: 5,
      });

      const referenceLinks = result.links.filter((l) => l.type === 'reference');
      expect(referenceLinks).toHaveLength(2);
    });

    it('should parse anchor links', async () => {
      const content = `# Test Anchors

[Go to section](#section)
[External anchor](https://example.com#anchor)
`;

      const filePath = join(testDir, 'test.md');
      await writeFile(filePath, content);

      const result = await parser.parseFile(filePath);

      const anchorLink = result.links.find((l) => l.href === '#section');
      expect(anchorLink?.type).toBe('anchor');

      const externalWithAnchor = result.links.find((l) => l.href === 'https://example.com#anchor');
      expect(externalWithAnchor?.type).toBe('external');
    });

    it('should extract dependencies correctly', async () => {
      const content = `# Test Dependencies

[Internal link](./dep1.md)
@./dep2.md
![Image](./image.png)
[External](https://example.com)
[Anchor](#section)
`;

      const filePath = join(testDir, 'test.md');
      await writeFile(filePath, content);

      const result = await parser.parseFile(filePath);

      expect(result.dependencies).toHaveLength(3);
      expect(result.dependencies).toContain(join(testDir, 'dep1.md'));
      expect(result.dependencies).toContain(join(testDir, 'dep2.md'));
      expect(result.dependencies).toContain(join(testDir, 'image.png'));
    });
  });

  describe('parseDirectory', () => {
    it('should parse all markdown files in directory', async () => {
      await writeFile(join(testDir, 'file1.md'), '# File 1\n[Link](./file2.md)');
      await writeFile(join(testDir, 'file2.md'), '# File 2\n@./file1.md');
      await writeFile(join(testDir, 'not-markdown.txt'), 'Not a markdown file');

      const results = await parser.parseDirectory(testDir);

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.filePath).sort()).toEqual(
        [join(testDir, 'file1.md'), join(testDir, 'file2.md')].sort()
      );
    });
  });
});
