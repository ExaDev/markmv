import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { embedCommand } from './embed.js';
import { extractCommand } from './extract.js';

/** Bytes of a minimal valid 1x1 PNG, so tests round-trip real image bytes rather than placeholders. */
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

/** The data URI form of the PNG bytes. */
const PNG_DATA_URI = `data:image/png;base64,${PNG_BYTES.toString('base64')}`;

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

describe('Extract Command', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'markmv-extract-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('Basic functionality', () => {
    it('writes the inline image to a file named from the alt text and links to it', async () => {
      const markdownFile = join(testDir, 'doc.md');
      await writeFile(markdownFile, `# Doc\n\n![Flow Diagram](${PNG_DATA_URI})\n`);

      const output = await captureCommandOutput(() => extractCommand([markdownFile], {}));

      expect(output.exitCode).toBe(0);
      const imageFile = join(testDir, 'flow-diagram.png');
      expect(existsSync(imageFile)).toBe(true);
      expect(await readFile(imageFile)).toEqual(PNG_BYTES);
      expect(await readFile(markdownFile, 'utf-8')).toBe(
        '# Doc\n\n![Flow Diagram](flow-diagram.png)\n'
      );
    });

    it('falls back to numbered img-N filenames when the alt text is unusable', async () => {
      const markdownFile = join(testDir, 'doc.md');
      await writeFile(markdownFile, `# Doc\n\n![](${PNG_DATA_URI})\n\n![!!!](${PNG_DATA_URI})\n`);

      const output = await captureCommandOutput(() => extractCommand([markdownFile], {}));

      expect(output.exitCode).toBe(0);
      expect(existsSync(join(testDir, 'img-1.png'))).toBe(true);
      expect(existsSync(join(testDir, 'img-2.png'))).toBe(true);
      const content = await readFile(markdownFile, 'utf-8');
      expect(content).toContain('![](img-1.png)');
      expect(content).toContain('![!!!](img-2.png)');
    });

    it('honours --output-dir and links to the file relative to the markdown', async () => {
      const markdownFile = join(testDir, 'doc.md');
      await writeFile(markdownFile, `# Doc\n\n![Flow Diagram](${PNG_DATA_URI})\n`);

      const output = await captureCommandOutput(() =>
        extractCommand([markdownFile], { outputDir: join(testDir, 'assets') })
      );

      expect(output.exitCode).toBe(0);
      const imageFile = join(testDir, 'assets', 'flow-diagram.png');
      expect(existsSync(imageFile)).toBe(true);
      expect(await readFile(imageFile)).toEqual(PNG_BYTES);
      expect(await readFile(markdownFile, 'utf-8')).toBe(
        '# Doc\n\n![Flow Diagram](assets/flow-diagram.png)\n'
      );
    });
  });

  describe('Error reporting', () => {
    it('rejects a non-image data URI with a clear error and leaves the file untouched', async () => {
      const markdownFile = join(testDir, 'doc.md');
      const original = `# Doc\n\n![Page](data:text/html;base64,PGh0bWw+)\n`;
      await writeFile(markdownFile, original);

      const output = await captureCommandOutput(() => extractCommand([markdownFile], {}));

      expect(output.exitCode).toBe(1);
      expect(
        output.errors.some((error) => error.toLowerCase().includes('not an image data uri'))
      ).toBe(true);
      expect(await readFile(markdownFile, 'utf-8')).toBe(original);
    });

    it('rejects a non-base64 data URI with a clear error', async () => {
      const markdownFile = join(testDir, 'doc.md');
      await writeFile(markdownFile, '# Doc\n\n![Odd](data:image/png,%89PNG%0D)\n');

      const output = await captureCommandOutput(() => extractCommand([markdownFile], {}));

      expect(output.exitCode).toBe(1);
      expect(output.errors.some((error) => error.toLowerCase().includes('only base64'))).toBe(true);
      expect(await readFile(markdownFile, 'utf-8')).toBe(
        '# Doc\n\n![Odd](data:image/png,%89PNG%0D)\n'
      );
    });
  });

  describe('File name collisions', () => {
    it('never overwrites an existing image file, deriving a numbered suffix instead', async () => {
      const markdownFile = join(testDir, 'doc.md');
      const existing = join(testDir, 'flow-diagram.png');
      await writeFile(markdownFile, `# Doc\n\n![Flow Diagram](${PNG_DATA_URI})\n`);
      await writeFile(existing, Buffer.from('an unrelated existing image'));

      const output = await captureCommandOutput(() => extractCommand([markdownFile], {}));

      expect(output.exitCode).toBe(0);
      expect(await readFile(existing, 'utf-8')).toBe('an unrelated existing image');
      expect(await readFile(join(testDir, 'flow-diagram-2.png'))).toEqual(PNG_BYTES);
      expect(await readFile(markdownFile, 'utf-8')).toBe(
        '# Doc\n\n![Flow Diagram](flow-diagram-2.png)\n'
      );
    });
  });

  describe('Dry run', () => {
    it('plans extractions without writing image files or touching the markdown', async () => {
      const markdownFile = join(testDir, 'doc.md');
      const original = `# Doc\n\n![Flow Diagram](${PNG_DATA_URI})\n`;
      await writeFile(markdownFile, original);

      const output = await captureCommandOutput(() =>
        extractCommand([markdownFile], { dryRun: true })
      );

      expect(output.exitCode).toBe(0);
      expect(await readFile(markdownFile, 'utf-8')).toBe(original);
      expect(existsSync(join(testDir, 'flow-diagram.png'))).toBe(false);
      expect(output.logs.some((log) => log.toLowerCase().includes('dry run'))).toBe(true);
      expect(
        output.logs.some((log) => log.includes('flow-diagram.png') && log.includes('Would extract'))
      ).toBe(true);
    });
  });

  describe('Round trip with embed', () => {
    it('embed then extract reproduces the original linked image and bytes', async () => {
      const markdownFile = join(testDir, 'doc.md');
      const imageFile = join(testDir, 'diagram.png');
      const original = '# Doc\n\n![Diagram](diagram.png)\n';
      await writeFile(markdownFile, original);
      await writeFile(imageFile, PNG_BYTES);

      const embedOutput = await captureCommandOutput(() => embedCommand([markdownFile], {}));
      expect(embedOutput.exitCode).toBe(0);
      expect(existsSync(imageFile)).toBe(false);
      expect(await readFile(markdownFile, 'utf-8')).toBe(
        `# Doc\n\n![Diagram](data:image/png;base64,${PNG_BYTES.toString('base64')})\n`
      );

      const extractOutput = await captureCommandOutput(() => extractCommand([markdownFile], {}));
      expect(extractOutput.exitCode).toBe(0);
      expect(await readFile(imageFile)).toEqual(PNG_BYTES);
      expect(await readFile(markdownFile, 'utf-8')).toBe(original);
    });
  });

  describe('JSON output', () => {
    it('emits a machine-readable summary instead of the human-readable one', async () => {
      const markdownFile = join(testDir, 'doc.md');
      await writeFile(markdownFile, `# Doc\n\n![Flow Diagram](${PNG_DATA_URI})\n`);

      const output = await captureCommandOutput(() =>
        extractCommand([markdownFile], { json: true })
      );

      expect(output.exitCode).toBe(0);
      const parsed = JSON.parse(output.logs.join('\n')) as {
        command: string;
        success: boolean;
        filesProcessed: number;
        filesModified: string[];
        imagesExtracted: number;
        imagesCreated: string[];
        errors: string[];
      };
      expect(parsed.command).toBe('extract');
      expect(parsed.success).toBe(true);
      expect(parsed.filesProcessed).toBe(1);
      expect(parsed.filesModified).toEqual([markdownFile]);
      expect(parsed.imagesExtracted).toBe(1);
      // The JSON output reports unix-separator paths; compare against the normalised form so the assertion holds on Windows as well
      expect(parsed.imagesCreated).toEqual([join(testDir, 'flow-diagram.png').replace(/\\/g, '/')]);
      expect(parsed.errors).toEqual([]);
    });
  });

  describe('Verbose output', () => {
    it('announces each file as it is processed', async () => {
      const markdownFile = join(testDir, 'doc.md');
      await writeFile(markdownFile, `# Doc\n\n![Flow Diagram](${PNG_DATA_URI})\n`);

      const output = await captureCommandOutput(() =>
        extractCommand([markdownFile], { verbose: true })
      );

      expect(output.exitCode).toBe(0);
      expect(output.logs.some((log) => log.includes(`Processing ${markdownFile}`))).toBe(true);
    });

    it('derives the file extension from the data URI mime type', async () => {
      const markdownFile = join(testDir, 'doc.md');
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
      await writeFile(
        markdownFile,
        `# Doc\n\n![Logo](data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')})\n`
      );

      const output = await captureCommandOutput(() => extractCommand([markdownFile], {}));

      expect(output.exitCode).toBe(0);
      expect(await readFile(join(testDir, 'logo.svg'), 'utf-8')).toBe(svg);
      expect(await readFile(markdownFile, 'utf-8')).toBe('# Doc\n\n![Logo](logo.svg)\n');
    });
  });
});
