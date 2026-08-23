import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { embedCommand } from './embed.js';

/** Bytes of a minimal valid 1x1 PNG, so tests round-trip real image bytes rather than placeholders. */
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

/** Capture process.exit codes and console output while a command runs. */
async function captureCommandOutput(
  run: () => Promise<void>
): Promise<{ exitCode: number; logs: string[]; errors: string[] }> {
  const state = { exitCode: 0, logs: [] as string[], errors: [] as string[] };

  const originalExit = process.exit;
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  process.exit = (code: number | undefined): never => {
    state.exitCode = code ?? 0;
    return null as never;
  };
  console.log = (...args: unknown[]) => {
    state.logs.push(args.join(' '));
  };
  console.warn = (...args: unknown[]) => {
    state.logs.push(args.join(' '));
  };
  console.error = (...args: unknown[]) => {
    state.errors.push(args.join(' '));
  };

  try {
    await run();
  } finally {
    process.exit = originalExit;
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }

  return state;
}

describe('Embed Command', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'markmv-embed-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('Basic functionality', () => {
    it('rewrites a local image link to an inline base64 data URI', async () => {
      const markdownFile = join(testDir, 'doc.md');
      const imageFile = join(testDir, 'diagram.png');
      await writeFile(markdownFile, '# Doc\n\n![Diagram](diagram.png)\n');
      await writeFile(imageFile, PNG_BYTES);

      const output = await captureCommandOutput(() => embedCommand([markdownFile], {}));

      expect(output.exitCode).toBe(0);
      const content = await readFile(markdownFile, 'utf-8');
      expect(content).toBe(
        `# Doc\n\n![Diagram](data:image/png;base64,${PNG_BYTES.toString('base64')})\n`
      );
    });

    it('deletes the image file once no file in the set references it', async () => {
      const markdownFile = join(testDir, 'doc.md');
      const imageFile = join(testDir, 'diagram.png');
      await writeFile(markdownFile, '![Diagram](diagram.png)\n');
      await writeFile(imageFile, PNG_BYTES);

      const output = await captureCommandOutput(() => embedCommand([markdownFile], {}));

      expect(output.exitCode).toBe(0);
      expect(existsSync(imageFile)).toBe(false);
      expect(output.logs.some((log) => log.includes('🗑️'))).toBe(true);
    });

    it('reports a missing referenced image as an error and leaves the file untouched', async () => {
      const markdownFile = join(testDir, 'doc.md');
      await writeFile(markdownFile, '# Doc\n\n![Missing](missing.png)\n');

      const output = await captureCommandOutput(() => embedCommand([markdownFile], {}));

      expect(output.exitCode).toBe(1);
      expect(output.errors.some((error) => error.includes('missing.png'))).toBe(true);
      const content = await readFile(markdownFile, 'utf-8');
      expect(content).toBe('# Doc\n\n![Missing](missing.png)\n');
    });
  });

  describe('References across the processed file set', () => {
    it('deletes a shared image once every file in the set has embedded it', async () => {
      const first = join(testDir, 'first.md');
      const second = join(testDir, 'second.md');
      const imageFile = join(testDir, 'diagram.png');
      await writeFile(first, '![Diagram](diagram.png)\n');
      await writeFile(second, '![Same diagram](diagram.png)\n');
      await writeFile(imageFile, PNG_BYTES);

      const output = await captureCommandOutput(() => embedCommand([first, second], {}));

      expect(output.exitCode).toBe(0);
      expect(existsSync(imageFile)).toBe(false);
      const firstContent = await readFile(first, 'utf-8');
      expect(firstContent).toContain('data:image/png;base64,');
      const secondContent = await readFile(second, 'utf-8');
      expect(secondContent).toContain('data:image/png;base64,');
    });

    it('keeps the image when a file in the set still references it after a failed embed', async () => {
      const successFile = join(testDir, 'ok.md');
      const failingFile = join(testDir, 'broken.md');
      const imageFile = join(testDir, 'diagram.png');
      await writeFile(successFile, '![Diagram](diagram.png)\n');
      await writeFile(failingFile, '![Diagram](diagram.png)\n\n![Other](gone.webp)\n');
      await writeFile(imageFile, PNG_BYTES);

      const output = await captureCommandOutput(() => embedCommand([successFile, failingFile], {}));

      expect(output.exitCode).toBe(1);
      expect(existsSync(imageFile)).toBe(true);
      expect(output.logs.some((log) => log.includes('Kept') && log.includes('diagram.png'))).toBe(
        true
      );
      const successContent = await readFile(successFile, 'utf-8');
      expect(successContent).toContain('data:image/png;base64,');
      const failingContent = await readFile(failingFile, 'utf-8');
      expect(failingContent).toBe('![Diagram](diagram.png)\n\n![Other](gone.webp)\n');
    });
  });

  describe('Deletion safety', () => {
    it('keeps an image still referenced by a markdown file outside the processed set', async () => {
      await writeFile(join(testDir, 'pic.png'), PNG_BYTES);
      await writeFile(join(testDir, 'a.md'), '# A\n\n![Pic](./pic.png)\n');
      await writeFile(join(testDir, 'b.md'), '# B\n\n![Same pic](./pic.png)\n');

      const output = await captureCommandOutput(() => embedCommand([join(testDir, 'a.md')], {}));

      expect(output.exitCode).toBe(0);
      // b.md still links the image; embedding a.md alone must not destroy it
      expect(existsSync(join(testDir, 'pic.png'))).toBe(true);
    });
  });

  describe('Dry run', () => {
    it('plans rewrites without touching markdown or image files', async () => {
      const markdownFile = join(testDir, 'doc.md');
      const imageFile = join(testDir, 'diagram.png');
      const original = '# Doc\n\n![Diagram](diagram.png)\n';
      await writeFile(markdownFile, original);
      await writeFile(imageFile, PNG_BYTES);

      const output = await captureCommandOutput(() =>
        embedCommand([markdownFile], { dryRun: true })
      );

      expect(output.exitCode).toBe(0);
      expect(await readFile(markdownFile, 'utf-8')).toBe(original);
      expect(existsSync(imageFile)).toBe(true);
      expect(output.logs.some((log) => log.toLowerCase().includes('dry run'))).toBe(true);
      expect(
        output.logs.some((log) => log.includes('diagram.png') && log.includes('Would embed'))
      ).toBe(true);
    });
  });

  describe('File pattern expansion', () => {
    it('expands glob patterns to markdown files', async () => {
      const first = join(testDir, 'a.md');
      const second = join(testDir, 'b.md');
      const ignored = join(testDir, 'notes.txt');
      await writeFile(first, '![First](one.png)\n');
      await writeFile(second, '![Second](two.png)\n');
      await writeFile(ignored, '![Not markdown](three.png)\n');
      await writeFile(join(testDir, 'one.png'), PNG_BYTES);
      await writeFile(join(testDir, 'two.png'), PNG_BYTES);

      // Forward slashes so the glob expands on Windows, where join produces backslashes
      const pattern = join(testDir, '*.md').replace(/\\/g, '/');
      const output = await captureCommandOutput(() => embedCommand([pattern], {}));

      expect(output.exitCode).toBe(0);
      expect(await readFile(first, 'utf-8')).toContain('data:image/png;base64,');
      expect(await readFile(second, 'utf-8')).toContain('data:image/png;base64,');
    });

    it('fails loudly when a pattern matches no markdown files', async () => {
      const output = await captureCommandOutput(() =>
        embedCommand([join(testDir, 'nothing-*.md')], {})
      );

      expect(output.exitCode).toBe(1);
      expect(output.errors.some((error) => error.includes('No markdown files found'))).toBe(true);
    });
  });

  describe('Error reporting', () => {
    it('reports an unsupported image extension and leaves the file untouched', async () => {
      const markdownFile = join(testDir, 'doc.md');
      await writeFile(markdownFile, '![Odd](weird.pic)\n');
      await writeFile(join(testDir, 'weird.pic'), Buffer.from('not really an image'));

      const output = await captureCommandOutput(() => embedCommand([markdownFile], {}));

      expect(output.exitCode).toBe(1);
      expect(output.errors.some((error) => error.includes('Unsupported image extension'))).toBe(
        true
      );
      expect(await readFile(markdownFile, 'utf-8')).toBe('![Odd](weird.pic)\n');
    });

    it('leaves remote image links alone', async () => {
      const markdownFile = join(testDir, 'doc.md');
      await writeFile(
        markdownFile,
        '# Doc\n\n![Remote](https://example.com/pic.png)\n\n![Local](diagram.png)\n'
      );
      await writeFile(join(testDir, 'diagram.png'), PNG_BYTES);

      const output = await captureCommandOutput(() => embedCommand([markdownFile], {}));

      expect(output.exitCode).toBe(0);
      const content = await readFile(markdownFile, 'utf-8');
      expect(content).toContain('![Remote](https://example.com/pic.png)');
      expect(content).toContain('data:image/png;base64,');
    });
  });

  describe('JSON output', () => {
    it('emits a machine-readable summary instead of the human-readable one', async () => {
      const markdownFile = join(testDir, 'doc.md');
      const imageFile = join(testDir, 'diagram.png');
      await writeFile(markdownFile, '![Diagram](diagram.png)\n');
      await writeFile(imageFile, PNG_BYTES);

      const output = await captureCommandOutput(() => embedCommand([markdownFile], { json: true }));

      expect(output.exitCode).toBe(0);
      const parsed = JSON.parse(output.logs.join('\n')) as {
        command: string;
        success: boolean;
        filesProcessed: number;
        filesModified: string[];
        imagesEmbedded: number;
        imagesDeleted: string[];
        errors: string[];
      };
      expect(parsed.command).toBe('embed');
      expect(parsed.success).toBe(true);
      expect(parsed.filesProcessed).toBe(1);
      expect(parsed.filesModified).toEqual([markdownFile]);
      expect(parsed.imagesEmbedded).toBe(1);
      expect(parsed.imagesDeleted).toEqual([imageFile]);
      expect(parsed.errors).toEqual([]);
    });
  });

  describe('Verbose output', () => {
    it('announces each file as it is processed', async () => {
      const markdownFile = join(testDir, 'doc.md');
      await writeFile(markdownFile, '![Diagram](diagram.png)\n');
      await writeFile(join(testDir, 'diagram.png'), PNG_BYTES);

      const output = await captureCommandOutput(() =>
        embedCommand([markdownFile], { verbose: true })
      );

      expect(output.exitCode).toBe(0);
      expect(output.logs.some((log) => log.includes(`Processing ${markdownFile}`))).toBe(true);
    });

    it('embeds both occurrences of an image referenced twice in one file', async () => {
      const markdownFile = join(testDir, 'doc.md');
      const imageFile = join(testDir, 'diagram.png');
      await writeFile(markdownFile, '![One](diagram.png)\n\n![Two](diagram.png)\n');
      await writeFile(imageFile, PNG_BYTES);

      const output = await captureCommandOutput(() => embedCommand([markdownFile], {}));

      expect(output.exitCode).toBe(0);
      const content = await readFile(markdownFile, 'utf-8');
      const expected = `data:image/png;base64,${PNG_BYTES.toString('base64')}`;
      expect(content).toBe(`![One](${expected})\n\n![Two](${expected})\n`);
      expect(existsSync(imageFile)).toBe(false);
    });
  });
});
