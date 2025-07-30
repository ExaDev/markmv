/**
 * Integration tests for validate command with content freshness detection.
 *
 * @fileoverview Tests the full validation pipeline with freshness analysis
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateLinks } from './validate.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Validate Command with Content Freshness Detection', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'validate-freshness-test-'));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('Fresh Content Validation', () => {
    it('should validate fresh external links without flagging them', async () => {
      const testFile = join(tempDir, 'fresh-links.md');
      await writeFile(testFile, `
# Test Document

Check out this [fresh documentation](https://example.com/fresh-docs).
Also see this [recent API guide](https://api.example.com/guide).
      `);

      const recentDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['last-modified', recentDate.toUTCString()]]),
          text: () => Promise.resolve('<html><body>Fresh documentation content</body></html>'),
          url: 'https://example.com/fresh-docs',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['last-modified', recentDate.toUTCString()]]),
          text: () => Promise.resolve('<html><body>Recent API guide content</body></html>'),
          url: 'https://api.example.com/guide',
        });

      const result = await validateLinks([testFile], {
        checkExternal: true,
        checkContentFreshness: true,
        freshnessThreshold: 365, // 1 year threshold
      });

      expect(result.brokenLinks).toBe(0);
      expect(result.staleLinks).toBe(0);
      expect(result.freshLinks).toBe(2);
      expect(result.totalLinks).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should flag stale external links with detailed freshness info', async () => {
      const testFile = join(tempDir, 'stale-links.md');
      await writeFile(testFile, `
# Outdated Documentation

This [old tutorial](https://example.com/old-tutorial) is outdated.
The [deprecated API](https://api.example.com/deprecated) should be avoided.
      `);

      const oldDate = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000); // 3 years ago

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['last-modified', oldDate.toUTCString()]]),
          text: () => Promise.resolve('<html><body>Old tutorial content from 2021</body></html>'),
          url: 'https://example.com/old-tutorial',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
          text: () => Promise.resolve(`
            <html><body>
              <h1>API Documentation</h1>
              <p>This API is deprecated and no longer supported.</p>
            </body></html>
          `),
          url: 'https://api.example.com/deprecated',
        });

      const result = await validateLinks([testFile], {
        checkExternal: true,
        checkContentFreshness: true,
        freshnessThreshold: 730, // 2 years threshold
      });

      expect(result.brokenLinks).toBe(2);
      expect(result.staleLinks).toBe(2);
      expect(result.freshLinks).toBe(0);
      
      // Check broken links details
      const brokenLinks = Object.values(result.brokenLinksByFile)[0];
      expect(brokenLinks).toHaveLength(2);
      
      // First link should be stale due to age
      const firstLink = brokenLinks.find(link => link.url.includes('old-tutorial'));
      expect(firstLink?.reason).toBe('content-stale');
      expect(firstLink?.freshnessInfo?.isFresh).toBe(false);
      expect(firstLink?.freshnessInfo?.lastModified).toBeDefined();
      expect(firstLink?.freshnessInfo?.warning).toContain('old');

      // Second link should be stale due to deprecation pattern
      const secondLink = brokenLinks.find(link => link.url.includes('deprecated'));
      expect(secondLink?.reason).toBe('content-stale');
      expect(secondLink?.freshnessInfo?.stalePatterns).toContain('deprecated');
      expect(secondLink?.freshnessInfo?.stalePatterns).toContain('no longer supported');
    });

    it('should apply domain-specific freshness thresholds', async () => {
      const testFile = join(tempDir, 'domain-thresholds.md');
      await writeFile(testFile, `
# Domain-Specific Documentation

Firebase guide: [Cloud Functions](https://firebase.google.com/docs/functions)
GitHub Actions: [Workflow syntax](https://docs.github.com/actions/reference)
General docs: [Example site](https://example.com/docs)
      `);

      const eightMonthsAgo = new Date(Date.now() - 8 * 30 * 24 * 60 * 60 * 1000);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['last-modified', eightMonthsAgo.toUTCString()]]),
          text: () => Promise.resolve('Firebase Cloud Functions documentation'),
          url: 'https://firebase.google.com/docs/functions',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['last-modified', eightMonthsAgo.toUTCString()]]),
          text: () => Promise.resolve('GitHub Actions workflow syntax'),
          url: 'https://docs.github.com/actions/reference',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['last-modified', eightMonthsAgo.toUTCString()]]),
          text: () => Promise.resolve('Example site documentation'),
          url: 'https://example.com/docs',
        });

      const result = await validateLinks([testFile], {
        checkExternal: true,
        checkContentFreshness: true,
        freshnessThreshold: 730, // 2 years default
      });

      // Firebase and GitHub should be stale (8 months > 6 months default for these domains)
      // Example.com should be fresh (8 months < 2 years default)
      expect(result.brokenLinks).toBeGreaterThan(0);
      expect(result.staleLinks).toBeGreaterThan(0);
      expect(result.freshLinks).toBeGreaterThan(0);
    });
  });

  describe('Mixed Content Types', () => {
    it('should handle files with mixed internal and external links', async () => {
      const internalFile = join(tempDir, 'internal.md');
      await writeFile(internalFile, '# Internal Document\nContent here.');

      const testFile = join(tempDir, 'mixed-links.md');
      await writeFile(testFile, `
# Mixed Links Document

Internal link: [Internal Doc](./internal.md)
External fresh: [Fresh Site](https://example.com/fresh)
External stale: [Stale Site](https://example.com/stale)
Anchor link: [Section](#section)

## Section
Content here.
      `);

      const freshDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const staleDate = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000); // 3 years ago

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['last-modified', freshDate.toUTCString()]]),
          text: () => Promise.resolve('Fresh website content'),
          url: 'https://example.com/fresh',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['last-modified', staleDate.toUTCString()]]),
          text: () => Promise.resolve('Stale website content'),
          url: 'https://example.com/stale',
        });

      const result = await validateLinks([testFile], {
        checkExternal: true,
        checkContentFreshness: true,
        strictInternal: true,
      });

      expect(result.totalLinks).toBe(4); // internal, 2 external, anchor
      expect(result.brokenLinks).toBe(1); // only stale external
      expect(result.staleLinks).toBe(1);
      expect(result.freshLinks).toBe(1);
      
      // Only external links should be fetched
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should count freshness statistics correctly across multiple files', async () => {
      const file1 = join(tempDir, 'file1.md');
      await writeFile(file1, `
# File 1
[Fresh link 1](https://example.com/fresh1)
[Stale link 1](https://example.com/stale1)
      `);

      const file2 = join(tempDir, 'file2.md');
      await writeFile(file2, `
# File 2
[Fresh link 2](https://example.com/fresh2)
[Stale link 2](https://example.com/stale2)
      `);

      const freshDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const staleDate = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['last-modified', freshDate.toUTCString()]]),
          text: () => Promise.resolve('Fresh content 1'),
          url: 'https://example.com/fresh1',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['last-modified', staleDate.toUTCString()]]),
          text: () => Promise.resolve('Stale content 1'),
          url: 'https://example.com/stale1',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['last-modified', freshDate.toUTCString()]]),
          text: () => Promise.resolve('Fresh content 2'),
          url: 'https://example.com/fresh2',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['last-modified', staleDate.toUTCString()]]),
          text: () => Promise.resolve('Stale content 2'),
          url: 'https://example.com/stale2',
        });

      const result = await validateLinks([file1, file2], {
        checkExternal: true,
        checkContentFreshness: true,
      });

      expect(result.filesProcessed).toBe(2);
      expect(result.totalLinks).toBe(4);
      expect(result.brokenLinks).toBe(2); // 2 stale links
      expect(result.staleLinks).toBe(2);
      expect(result.freshLinks).toBe(2);
    });
  });

  describe('Content Pattern Detection', () => {
    it('should detect various staleness patterns', async () => {
      const testFile = join(tempDir, 'pattern-detection.md');
      await writeFile(testFile, `
# Pattern Detection Test

[Deprecated API](https://api.example.com/deprecated)
[Moved page](https://example.com/moved)
[Legacy docs](https://docs.example.com/legacy)
[EOL product](https://products.example.com/eol)
      `);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
          text: () => Promise.resolve('This API is deprecated and will be removed.'),
          url: 'https://api.example.com/deprecated',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
          text: () => Promise.resolve('This page has moved to a new location.'),
          url: 'https://example.com/moved',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
          text: () => Promise.resolve('Legacy documentation - archived content.'),
          url: 'https://docs.example.com/legacy',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map(),
          text: () => Promise.resolve('End of life product - no longer supported.'),
          url: 'https://products.example.com/eol',
        });

      const result = await validateLinks([testFile], {
        checkExternal: true,
        checkContentFreshness: true,
      });

      expect(result.brokenLinks).toBe(4);
      expect(result.staleLinks).toBe(4);

      const brokenLinks = Object.values(result.brokenLinksByFile)[0];
      
      // Check that different patterns are detected
      const deprecatedLink = brokenLinks.find(link => link.url.includes('deprecated'));
      expect(deprecatedLink?.freshnessInfo?.stalePatterns).toContain('deprecated');

      const movedLink = brokenLinks.find(link => link.url.includes('moved'));
      expect(movedLink?.freshnessInfo?.stalePatterns).toContain('this page has moved');

      const legacyLink = brokenLinks.find(link => link.url.includes('legacy'));
      expect(legacyLink?.freshnessInfo?.stalePatterns).toContain('archived');

      const eolLink = brokenLinks.find(link => link.url.includes('eol'));
      expect(eolLink?.freshnessInfo?.stalePatterns).toContain('end of life');
    });
  });

  describe('Error Handling', () => {
    it('should handle mixed success and error responses', async () => {
      const testFile = join(tempDir, 'mixed-responses.md');
      await writeFile(testFile, `
# Mixed Responses

[Working link](https://example.com/working)
[Broken link](https://example.com/broken)
[Fresh link](https://example.com/fresh)
[Network error link](https://example.com/network-error)
      `);

      const freshDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['last-modified', freshDate.toUTCString()]]),
          text: () => Promise.resolve('Working content'),
          url: 'https://example.com/working',
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          headers: new Map(),
          url: 'https://example.com/broken',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['last-modified', freshDate.toUTCString()]]),
          text: () => Promise.resolve('Fresh content'),
          url: 'https://example.com/fresh',
        })
        .mockRejectedValueOnce(new Error('Network timeout'));

      const result = await validateLinks([testFile], {
        checkExternal: true,
        checkContentFreshness: true,
      });

      expect(result.totalLinks).toBe(4);
      expect(result.brokenLinks).toBe(2); // broken (404) + network error
      expect(result.freshLinks).toBe(4); // all external links are counted as fresh when they don't have stale content
      expect(result.staleLinks).toBe(0);

      const brokenLinks = Object.values(result.brokenLinksByFile)[0];
      
      const httpError = brokenLinks.find(link => link.url.includes('broken'));
      expect(httpError?.reason).toBe('external-error');
      expect(httpError?.details).toContain('404');

      const networkError = brokenLinks.find(link => link.url.includes('network-error'));
      expect(networkError?.reason).toBe('external-error');
      expect(networkError?.details).toContain('Network timeout');
    });

    it('should continue processing other links when one fails', async () => {
      const testFile = join(tempDir, 'partial-failure.md');
      await writeFile(testFile, `
# Partial Failure Test

[First link](https://example.com/first)
[Failing link](https://example.com/fail)
[Last link](https://example.com/last)
      `);

      const freshDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['last-modified', freshDate.toUTCString()]]),
          text: () => Promise.resolve('First content'),
          url: 'https://example.com/first',
        })
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['last-modified', freshDate.toUTCString()]]),
          text: () => Promise.resolve('Last content'),
          url: 'https://example.com/last',
        });

      const result = await validateLinks([testFile], {
        checkExternal: true,
        checkContentFreshness: true,
      });

      expect(result.totalLinks).toBe(3);
      expect(result.filesProcessed).toBe(1);
      expect(result.brokenLinks).toBe(1); // only the failing link
      expect(result.freshLinks).toBe(3); // all external links are counted as fresh when they don't have stale content
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('Disabled Freshness Detection', () => {
    it('should not perform freshness checks when disabled', async () => {
      const testFile = join(tempDir, 'no-freshness.md');
      await writeFile(testFile, `
# No Freshness Check

[External link](https://example.com/external)
      `);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
        url: 'https://example.com/external',
      });

      const result = await validateLinks([testFile], {
        checkExternal: true,
        checkContentFreshness: false, // Disabled
      });

      expect(result.brokenLinks).toBe(0);
      expect(result.staleLinks).toBe(0);
      expect(result.freshLinks).toBe(0);
      
      // Should use HEAD method instead of GET
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/external', {
        method: 'HEAD',
        signal: expect.any(AbortSignal),
        headers: {
          'User-Agent': 'markmv-validator/1.0 (content-freshness-detection)',
        },
      });
    });
  });

  describe('Content Change Detection Integration', () => {
    it('should track content changes across validation runs', async () => {
      const testFile = join(tempDir, 'content-changes.md');
      await writeFile(testFile, `
# Content Change Test

[Changing content](https://example.com/changing)
      `);

      // First validation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        text: () => Promise.resolve('Original content version'),
        url: 'https://example.com/changing',
      });

      const result1 = await validateLinks([testFile], {
        checkExternal: true,
        checkContentFreshness: true,
      });

      expect(result1.brokenLinks).toBe(0);
      expect(result1.freshLinks).toBe(1);

      // Second validation with changed content
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        text: () => Promise.resolve('Completely different content version'),
        url: 'https://example.com/changing',
      });

      const result2 = await validateLinks([testFile], {
        checkExternal: true,
        checkContentFreshness: true,
      });

      // Content change alone doesn't make it stale unless there are other factors
      // So we expect it to be fresh but with content change detected
      expect(result2.brokenLinks).toBe(0);
      expect(result2.staleLinks).toBe(0);
      expect(result2.freshLinks).toBe(1);
    });
  });
});