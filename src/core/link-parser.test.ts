import { execFile } from 'node:child_process';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LinkParser } from './link-parser.js';

const execFileAsync = promisify(execFile);

describe('LinkParser', () => {
  let parser: LinkParser;
  let testDir: string;

  beforeEach(async () => {
    parser = new LinkParser();
    testDir = join(
      tmpdir(),
      `markmv-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    await mkdir(testDir, { recursive: true });
    // Ensure directory exists before continuing
    const dirStat = await stat(testDir);
    if (!dirStat.isDirectory()) {
      throw new Error(`Failed to create test directory: ${testDir}`);
    }
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
        column: 11,
        absolute: false,
        resolvedPath: join(testDir, 'other.md'),
        referenceId: undefined,
      });

      const externalLink = result.links.find((l) => l.href === 'https://example.com');
      expect(externalLink).toEqual({
        type: 'external',
        href: 'https://example.com',
        text: 'external link',
        line: 4,
        column: 15,
        absolute: false,
        referenceId: undefined,
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
        line: 3,
        column: 18,
        absolute: true,
        resolvedPath: '/absolute/path/file.md',
        referenceId: undefined,
      });

      const homeImport = claudeImports.find((l) => l.href === '~/home/file.md');
      expect(homeImport?.type).toBe('claude-import');
      expect(homeImport?.absolute).toBe(true);
      // Normalize path separators for cross-platform compatibility
      const normalizedPath = homeImport?.resolvedPath?.replace(/\\/g, '/');
      expect(normalizedPath).toMatch(/\/home\/file\.md$/);
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
        referenceId: undefined,
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

  describe('claude-import home paths', () => {
    it('should parse a file containing @~/ without throwing', async () => {
      const filePath = join(testDir, 'memory-note.md');
      await writeFile(filePath, '- @~/memory/dev/foo.md\n');

      const result = await parser.parseFile(filePath);

      expect(result.links).toHaveLength(1);
    });

    it('should resolve @~/ claude imports against the home directory', async () => {
      const filePath = join(testDir, 'memory-note.md');
      await writeFile(filePath, '- @~/memory/dev/foo.md\n');

      const result = await parser.parseFile(filePath);

      const link = result.links[0];
      expect(link?.type).toBe('claude-import');
      expect(link?.href).toBe('~/memory/dev/foo.md');
      expect(link?.resolvedPath).toBe(join(homedir(), 'memory/dev/foo.md'));
    });

    it('should parse @~/ claude imports under the real ESM runtime', { timeout: 30_000 }, async () => {
      // Vitest transforms modules through Vite, which shims require() and masks the ReferenceError an ESM-only runtime throws. Spawn a real ESM process to exercise the published behaviour.
      const requireFromTest = createRequire(import.meta.url);
      const tsxEntry = pathToFileURL(requireFromTest.resolve('tsx')).href;
      const notePath = join(testDir, 'note.md');
      await writeFile(notePath, '- @~/memory/dev/foo.md\n');

      const parserUrl = pathToFileURL(fileURLToPath(new URL('./link-parser.ts', import.meta.url))).href;
      const scriptPath = join(testDir, 'esm-parse-check.mjs');
      await writeFile(
        scriptPath,
        [
          `import { LinkParser } from ${JSON.stringify(parserUrl)};`,
          'const parser = new LinkParser();',
          `const result = await parser.parseFile(${JSON.stringify(notePath)});`,
          "const link = result.links[0];",
          "if (!link) throw new Error('expected one claude-import link, got none');",
          "console.log(JSON.stringify({ href: link.href, resolvedPath: link.resolvedPath }));",
        ].join('\n')
      );

      const { stdout } = await execFileAsync(process.execPath, ['--import', tsxEntry, scriptPath]);

      const parsed: unknown = JSON.parse(stdout);
      expect(parsed).toEqual({
        href: '~/memory/dev/foo.md',
        resolvedPath: join(homedir(), 'memory/dev/foo.md'),
      });
    });
  });
});
