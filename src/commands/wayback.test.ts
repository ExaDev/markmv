import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { toWaybackUrl, waybackCommand } from './wayback.js';

/** The subset of the JSON report shape the output test asserts against. */
interface JsonReport {
  totalConverted: number;
  totalUntouched: number;
  files: unknown[];
}

/** Narrow an unknown parsed value to the expected JSON report shape. */
function isJsonReport(value: unknown): value is JsonReport {
  if (typeof value !== 'object' || value === null) return false;
  if (!('totalConverted' in value) || !('totalUntouched' in value) || !('files' in value)) {
    return false;
  }
  return true;
}

describe('toWaybackUrl', () => {
  it('wraps an https URL in the Wayback Machine any-snapshot form', () => {
    expect(toWaybackUrl('https://example.com/page')).toBe(
      'https://web.archive.org/web/*/https://example.com/page'
    );
  });

  it('converts http URLs and preserves the query string and fragment verbatim', () => {
    expect(toWaybackUrl('http://example.com/docs/page?id=42&sort=asc#section')).toBe(
      'https://web.archive.org/web/*/http://example.com/docs/page?id=42&sort=asc#section'
    );
  });

  it('returns undefined for URLs already pointing at the Wayback Machine', () => {
    expect(toWaybackUrl('https://web.archive.org/web/2020/https://example.com')).toBeUndefined();
    expect(
      toWaybackUrl('http://web.archive.org/web/20201001000000*/http://example.com')
    ).toBeUndefined();
  });

  it('returns undefined for non-web schemes and relative paths', () => {
    expect(toWaybackUrl('mailto:someone@example.com')).toBeUndefined();
    expect(toWaybackUrl('ftp://files.example.com/doc.txt')).toBeUndefined();
    expect(toWaybackUrl('./other.md')).toBeUndefined();
    expect(toWaybackUrl('#anchor')).toBeUndefined();
  });
});

describe('Wayback Command', () => {
  let testDir: string;
  let logs: string[];
  let originalLog: typeof console.log;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'markmv-wayback-test-'));
    logs = [];
    originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '));
    };
  });

  afterEach(async () => {
    console.log = originalLog;
    await rm(testDir, { recursive: true, force: true });
  });

  it('converts external http(s) links in a markdown file', async () => {
    const testFile = join(testDir, 'doc.md');
    await writeFile(
      testFile,
      '# Doc\n\nSee [GitHub](https://github.com) and [the guide](http://example.com/docs).\n'
    );

    const result = await waybackCommand([testFile], {});

    expect(result.success).toBe(true);
    expect(result.totalConverted).toBe(2);

    const content = await readFile(testFile, 'utf-8');
    expect(content).toContain('[GitHub](https://web.archive.org/web/*/https://github.com)');
    expect(content).toContain('[the guide](https://web.archive.org/web/*/http://example.com/docs)');
  });

  it('dry run reports conversions but leaves the file unchanged', async () => {
    const testFile = join(testDir, 'dry.md');
    const original = '# Dry\n\n[Site](https://example.com)\n';
    await writeFile(testFile, original);

    const result = await waybackCommand([testFile], { dryRun: true });

    expect(result.success).toBe(true);
    expect(result.totalConverted).toBe(1);
    expect(result.filesModified).toBe(0);
    expect(await readFile(testFile, 'utf-8')).toBe(original);
  });

  it('preserves archived and non-web links and reports per-file counts', async () => {
    const testFile = join(testDir, 'mixed.md');
    const content = [
      '# Mixed',
      '',
      '[live](https://example.com/live)',
      '[archived](https://web.archive.org/web/2020/https://example.com/old)',
      '[mail](mailto:someone@example.com)',
      '[ftp](ftp://files.example.com/doc.txt)',
      '[internal](./other.md)',
      '',
    ].join('\n');
    await writeFile(testFile, content);

    const result = await waybackCommand([testFile], {});

    expect(result.totalConverted).toBe(1);
    expect(result.totalAlreadyArchived).toBe(1);
    expect(result.totalUntouched).toBe(3);

    const updated = await readFile(testFile, 'utf-8');
    expect(updated).toContain('[live](https://web.archive.org/web/*/https://example.com/live)');
    expect(updated).toContain(
      '[archived](https://web.archive.org/web/2020/https://example.com/old)'
    );
    expect(updated).toContain('[mail](mailto:someone@example.com)');
    expect(updated).toContain('[ftp](ftp://files.example.com/doc.txt)');
    expect(updated).toContain('[internal](./other.md)');
  });

  it('converts reference-style link definitions and leaves usages intact', async () => {
    const testFile = join(testDir, 'refs.md');
    const content = [
      '# Refs',
      '',
      'See [the site][1] and [the archive][2].',
      '',
      '[1]: https://example.com',
      '[2]: https://web.archive.org/web/2020/https://example.com/old',
      '',
    ].join('\n');
    await writeFile(testFile, content);

    const result = await waybackCommand([testFile], {});

    expect(result.totalConverted).toBe(1);
    expect(result.totalAlreadyArchived).toBe(1);

    const updated = await readFile(testFile, 'utf-8');
    expect(updated).toContain('[1]: https://web.archive.org/web/*/https://example.com');
    expect(updated).toContain('[2]: https://web.archive.org/web/2020/https://example.com/old');
    expect(updated).toContain('See [the site][1] and [the archive][2].');
  });

  it('converts remote image sources', async () => {
    const testFile = join(testDir, 'images.md');
    await writeFile(testFile, '# Images\n\n![chart](http://example.com/chart.png)\n');

    const result = await waybackCommand([testFile], {});

    expect(result.totalConverted).toBe(1);
    const updated = await readFile(testFile, 'utf-8');
    expect(updated).toContain(
      '![chart](https://web.archive.org/web/*/http://example.com/chart.png)'
    );
  });

  it('converts angle-bracket autolinks', async () => {
    const testFile = join(testDir, 'autolink.md');
    await writeFile(testFile, '# Autolink\n\nVisit <https://example.com/autolink> today.\n');

    const result = await waybackCommand([testFile], {});

    expect(result.success).toBe(true);
    expect(result.totalConverted).toBe(1);
    const updated = await readFile(testFile, 'utf-8');
    expect(updated).toContain('<https://web.archive.org/web/*/https://example.com/autolink>');
  });

  it('converts angle-bracketed destinations that contain spaces', async () => {
    const testFile = join(testDir, 'angle.md');
    const content = [
      '# Angle',
      '',
      '[doc](<https://example.com/my doc.pdf>)',
      '',
      '[ref]: <https://example.com/another doc.pdf>',
      '',
    ].join('\n');
    await writeFile(testFile, content);

    const result = await waybackCommand([testFile], {});

    expect(result.success).toBe(true);
    expect(result.totalConverted).toBe(2);
    const updated = await readFile(testFile, 'utf-8');
    expect(updated).toContain(
      '[doc](<https://web.archive.org/web/*/https://example.com/my doc.pdf>)'
    );
    expect(updated).toContain(
      '[ref]: <https://web.archive.org/web/*/https://example.com/another doc.pdf>'
    );
  });

  it('is idempotent: a second run converts nothing and changes no bytes', async () => {
    const testFile = join(testDir, 'idempotent.md');
    const converted = '# Converted\n\n[site](https://web.archive.org/web/*/https://example.com)\n';
    await writeFile(testFile, converted);

    const result = await waybackCommand([testFile], {});

    expect(result.totalConverted).toBe(0);
    expect(result.totalAlreadyArchived).toBe(1);
    expect(result.filesModified).toBe(0);
    expect(await readFile(testFile, 'utf-8')).toBe(converted);
  });

  it('leaves URLs inside code blocks untouched', async () => {
    const testFile = join(testDir, 'code.md');
    const content =
      '# Code\n\n```\ncurl https://example.com/api\n```\n\n[real link](https://example.com/page)\n';
    await writeFile(testFile, content);

    const result = await waybackCommand([testFile], {});

    expect(result.totalConverted).toBe(1);
    const updated = await readFile(testFile, 'utf-8');
    expect(updated).toContain('curl https://example.com/api');
    expect(updated).toContain(
      '[real link](https://web.archive.org/web/*/https://example.com/page)'
    );
  });

  it('outputs a JSON report when json option is set', async () => {
    const testFile = join(testDir, 'report.md');
    await writeFile(testFile, '# Report\n\n[a](https://example.com/a) [b](mailto:x@example.com)\n');

    const result = await waybackCommand([testFile], { json: true });

    expect(logs.length).toBe(1);
    const parsed: unknown = JSON.parse(logs[0]);
    if (!isJsonReport(parsed)) {
      throw new Error('JSON report did not have the expected shape');
    }
    expect(parsed.totalConverted).toBe(1);
    expect(parsed.totalUntouched).toBe(1);
    expect(parsed.files.length).toBe(1);
    expect(result.totalConverted).toBe(1);
  });

  it('prints per-file detail and a summary when verbose', async () => {
    const testFile = join(testDir, 'verbose.md');
    await writeFile(
      testFile,
      '# Verbose\n\n[a](https://example.com/a) [old](https://web.archive.org/web/2020/https://example.com) [inner](./x.md)\n'
    );

    await waybackCommand([testFile], { verbose: true, dryRun: true });

    expect(logs.some((log) => log.includes('Starting Wayback Machine conversion'))).toBe(true);
    expect(logs.some((log) => log.includes('Dry run mode: no files will be modified'))).toBe(true);
    expect(logs.some((log) => log.includes('Converted: 1'))).toBe(true);
    expect(logs.some((log) => log.includes('Already archived: 1'))).toBe(true);
    expect(logs.some((log) => log.includes('Untouched: 1'))).toBe(true);
    expect(logs.some((log) => log.includes('Wayback Machine Summary'))).toBe(true);
    expect(logs.some((log) => log.includes('Files processed: 1'))).toBe(true);
    expect(logs.some((log) => log.includes('Links converted: 1'))).toBe(true);
    expect(logs.some((log) => log.includes('Dry run - no files were actually modified'))).toBe(
      true
    );
  });

  it('expands glob patterns across multiple files', async () => {
    await writeFile(join(testDir, 'one.md'), '# One\n\n[a](https://example.com/a)\n');
    await writeFile(join(testDir, 'two.md'), '# Two\n\n[b](https://example.com/b)\n');
    await writeFile(join(testDir, 'notes.txt'), 'not markdown');

    const result = await waybackCommand([join(testDir, '*.md')], {});

    expect(result.filesProcessed).toBe(2);
    expect(result.totalConverted).toBe(2);
    expect(await readFile(join(testDir, 'one.md'), 'utf-8')).toContain(
      'https://web.archive.org/web/*/https://example.com/a'
    );
  });

  it('processes directories recursively when recursive is set', async () => {
    await mkdir(join(testDir, 'sub'));
    await writeFile(join(testDir, 'root.md'), '# Root\n\n[a](https://example.com/a)\n');
    await writeFile(join(testDir, 'sub', 'nested.md'), '# Nested\n');

    const result = await waybackCommand([testDir], { recursive: true });

    expect(result.filesProcessed).toBe(2);
    expect(result.totalConverted).toBe(1);
  });

  it('processes only top-level markdown files of a directory without recursive', async () => {
    await mkdir(join(testDir, 'top'));
    await writeFile(join(testDir, 'root.md'), '# Root\n');
    await writeFile(join(testDir, 'top', 'nested.md'), '# Nested\n');

    const result = await waybackCommand([testDir], {});

    expect(result.filesProcessed).toBe(1);
  });

  describe('error handling', () => {
    let originalExit: typeof process.exit;
    let originalError: typeof console.error;
    let exitCalls: number[];
    let errors: string[];

    beforeEach(() => {
      originalExit = process.exit;
      originalError = console.error;
      exitCalls = [];
      errors = [];
      process.exit = (code?: number): never => {
        exitCalls.push(code ?? 0);
        throw new Error(`halted: process.exit called with ${String(code ?? 0)}`);
      };
      console.error = (...args: unknown[]) => {
        errors.push(args.join(' '));
      };
    });

    afterEach(() => {
      process.exit = originalExit;
      console.error = originalError;
    });

    it('exits with code 1 when no patterns are given', async () => {
      await waybackCommand([], {}).catch(() => undefined);

      expect(exitCalls).toEqual([1]);
      expect(
        errors.some((error) => error.includes('At least one file pattern must be specified'))
      ).toBe(true);
    });

    it('exits with code 1 when no markdown files match the patterns', async () => {
      await waybackCommand([join(testDir, 'non-existent.md')], {}).catch(() => undefined);

      expect(exitCalls).toEqual([1]);
      expect(errors.some((error) => error.includes('No markdown files found'))).toBe(true);
    });
  });

  describe('destination precision', () => {
    it('counts each usage of a shared definition and rewrites the definition once', async () => {
      const testFile = join(testDir, 'shared.md');
      const content = [
        '# Shared',
        '',
        '[first][1] and [second][1]',
        '',
        '[1]: https://example.com/shared',
        '',
      ].join('\n');
      await writeFile(testFile, content);

      const result = await waybackCommand([testFile], {});

      expect(result.totalConverted).toBe(2);
      const updated = await readFile(testFile, 'utf-8');
      expect(updated).toBe(
        [
          '# Shared',
          '',
          '[first][1] and [second][1]',
          '',
          '[1]: https://web.archive.org/web/*/https://example.com/shared',
          '',
        ].join('\n')
      );
    });

    it('converts the destination, not a URL that also appears as link text', async () => {
      const testFile = join(testDir, 'text-url.md');
      await writeFile(testFile, '[https://example.com](https://example.com)\n');

      await waybackCommand([testFile], {});

      const updated = await readFile(testFile, 'utf-8');
      expect(updated).toBe(
        '[https://example.com](https://web.archive.org/web/*/https://example.com)\n'
      );
    });

    it('keeps link titles intact', async () => {
      const testFile = join(testDir, 'title.md');
      await writeFile(testFile, '[a](https://example.com "the title")\n');

      await waybackCommand([testFile], {});

      const updated = await readFile(testFile, 'utf-8');
      expect(updated).toBe('[a](https://web.archive.org/web/*/https://example.com "the title")\n');
    });

    it('leaves bare URLs in prose untouched', async () => {
      const testFile = join(testDir, 'bare.md');
      const content = 'Plain text https://example.com/bare without a link.\n';
      await writeFile(testFile, content);

      const result = await waybackCommand([testFile], {});

      expect(result.totalConverted).toBe(0);
      expect(await readFile(testFile, 'utf-8')).toBe(content);
    });
  });
});
