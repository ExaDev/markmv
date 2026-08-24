import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LinkParser } from './link-parser.js';
import {
  findDuplicateNoteStems,
  resolveWikilinks,
  type ParsedMarkdownFile,
} from './obsidian-vault.js';

describe('obsidian vault resolution', () => {
  let parser: LinkParser;
  let vaultRoot: string;

  beforeEach(async () => {
    parser = new LinkParser();
    vaultRoot = join(
      tmpdir(),
      `markmv-vault-test-${String(Date.now())}-${Math.random().toString(36).slice(2, 11)}`
    );
    await mkdir(vaultRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(vaultRoot, { recursive: true, force: true });
  });

  async function parseVault(): Promise<ParsedMarkdownFile[]> {
    // parseDirectory walks the vault; resolution runs over its output
    return parser.parseDirectory(vaultRoot);
  }

  describe('resolveWikilinks', () => {
    it('resolves a bare wikilink to the unique note with that stem', async () => {
      await writeFile(join(vaultRoot, 'Home.md'), 'See [[Tailscale]].\n');
      await mkdir(join(vaultRoot, 'devops'));
      await writeFile(join(vaultRoot, 'devops', 'Tailscale.md'), '# Tailscale\n');

      const files = await parseVault();
      const ambiguities = resolveWikilinks(files, vaultRoot);

      expect(ambiguities).toHaveLength(0);
      const home = files.find((f) => f.filePath.endsWith('Home.md'));
      const wikilink = home?.links.find((l) => l.type === 'wikilink');
      expect(wikilink?.resolvedPath).toBe(join(vaultRoot, 'devops', 'Tailscale.md'));
      expect(home?.dependencies).toContain(join(vaultRoot, 'devops', 'Tailscale.md'));
    });

    it('resolves explicit-extension and path-qualified wikilinks', async () => {
      await writeFile(
        join(vaultRoot, 'Home.md'),
        '[[Note.md]] and [[devops/Tailscale]] and ![[pic.png]]\n'
      );
      await writeFile(join(vaultRoot, 'Note.md'), '# Note\n');
      await mkdir(join(vaultRoot, 'devops'));
      await writeFile(join(vaultRoot, 'devops', 'Tailscale.md'), '# Tailscale\n');
      await writeFile(join(vaultRoot, 'pic.png'), 'fake png');

      const files = await parseVault();
      resolveWikilinks(files, vaultRoot);

      const home = files.find((f) => f.filePath.endsWith('Home.md'));
      const byHref = new Map(home?.links.map((l) => [l.href, l]));
      expect(byHref.get('Note.md')?.resolvedPath).toBe(join(vaultRoot, 'Note.md'));
      expect(byHref.get('devops/Tailscale')?.resolvedPath).toBe(
        join(vaultRoot, 'devops', 'Tailscale.md')
      );
      expect(byHref.get('pic.png')?.resolvedPath).toBe(join(vaultRoot, 'pic.png'));
    });

    it('leaves ambiguous bare wikilinks unresolved and reports the candidates', async () => {
      await writeFile(join(vaultRoot, 'Home.md'), 'See [[Note]].\n');
      await mkdir(join(vaultRoot, 'a'));
      await mkdir(join(vaultRoot, 'b'));
      await writeFile(join(vaultRoot, 'a', 'Note.md'), '# A note\n');
      await writeFile(join(vaultRoot, 'b', 'Note.md'), '# B note\n');

      const files = await parseVault();
      const ambiguities = resolveWikilinks(files, vaultRoot);

      const home = files.find((f) => f.filePath.endsWith('Home.md'));
      const wikilink = home?.links.find((l) => l.type === 'wikilink');
      expect(wikilink?.resolvedPath).toBeUndefined();
      expect(ambiguities).toHaveLength(1);
      expect(ambiguities[0]?.stem).toBe('Note');
      expect(ambiguities[0]?.candidates).toHaveLength(2);
    });

    it('keeps block references on the link while resolving the target', async () => {
      await writeFile(join(vaultRoot, 'Home.md'), '[[Note#Section]]\n');
      await writeFile(join(vaultRoot, 'Note.md'), '# Note\n');

      const files = await parseVault();
      resolveWikilinks(files, vaultRoot);

      const home = files.find((f) => f.filePath.endsWith('Home.md'));
      const wikilink = home?.links.find((l) => l.type === 'wikilink');
      expect(wikilink?.blockReference).toBe('#Section');
      expect(wikilink?.resolvedPath).toBe(join(vaultRoot, 'Note.md'));
    });
  });

  describe('findDuplicateNoteStems', () => {
    it('reports only stems shared by multiple markdown files', async () => {
      await mkdir(join(vaultRoot, 'a'));
      await mkdir(join(vaultRoot, 'b'));
      await writeFile(join(vaultRoot, 'a', 'Note.md'), '# A\n');
      await writeFile(join(vaultRoot, 'b', 'Note.md'), '# B\n');
      await writeFile(join(vaultRoot, 'Unique.md'), '# U\n');

      const files = await parseVault();
      const duplicates = findDuplicateNoteStems(files);

      expect(duplicates).toHaveLength(1);
      expect(duplicates[0]?.stem).toBe('Note');
      expect(duplicates[0]?.paths.sort()).toEqual(
        [join(vaultRoot, 'a', 'Note.md'), join(vaultRoot, 'b', 'Note.md')].sort()
      );
    });
  });
});
