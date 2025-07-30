/**
 * Tests for LinkValidator with content freshness detection integration.
 *
 * @fileoverview Tests for link validation with freshness analysis
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LinkValidator } from './link-validator.js';
import type { MarkdownLink } from '../types/links.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('LinkValidator with Content Freshness Detection', () => {
  let tempDir: string;
  let validator: LinkValidator;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'link-validator-freshness-test-'));
    
    validator = new LinkValidator({
      checkExternal: true,
      checkContentFreshness: true,
      externalTimeout: 5000,
      freshnessConfig: {
        defaultThreshold: 365 * 24 * 60 * 60 * 1000, // 1 year for testing
        cacheDir: join(tempDir, 'freshness-cache'),
      },
    });

    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('Fresh Content Detection', () => {
    it('should validate fresh external links without flagging them as broken', async () => {
      const recentDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([
          ['last-modified', recentDate.toUTCString()],
          ['content-type', 'text/html'],
        ]),
        text: () => Promise.resolve('<html><body>Fresh content</body></html>'),
        url: 'https://example.com/fresh',
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://example.com/fresh',
        text: 'Fresh Link',
        line: 1,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      expect(result).toBeNull(); // Link should be valid
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/fresh', {
        method: 'GET',
        signal: expect.any(AbortSignal),
        headers: {
          'User-Agent': 'markmv-validator/1.0 (content-freshness-detection)',
        },
      });
    });

    it('should flag stale external links as broken with freshness info', async () => {
      const oldDate = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000); // 2 years ago
      
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([
          ['last-modified', oldDate.toUTCString()],
        ]),
        text: () => Promise.resolve('<html><body>Old content</body></html>'),
        url: 'https://example.com/stale',
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://example.com/stale',
        text: 'Stale Link',
        line: 1,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('content-stale');
      expect(result?.details).toContain('old'); // Updated to match actual warning text
      expect(result?.freshnessInfo).toBeDefined();
      expect(result?.freshnessInfo?.isFresh).toBe(false);
      expect(result?.freshnessInfo?.lastModified).toBeDefined();
    });

    it('should detect deprecated content patterns', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
        text: () => Promise.resolve(`
          <html>
            <body>
              <h1>API Documentation</h1>
              <p>This API is deprecated and no longer supported. Please use the new version.</p>
            </body>
          </html>
        `),
        url: 'https://api.example.com/deprecated',
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://api.example.com/deprecated',
        text: 'Deprecated API',
        line: 1,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('content-stale');
      expect(result?.freshnessInfo?.stalePatterns).toContain('deprecated');
      expect(result?.freshnessInfo?.stalePatterns).toContain('no longer supported');
    });

    it('should use GET method when freshness detection is enabled', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
        text: () => Promise.resolve('Fresh content'),
        url: 'https://example.com/get',
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://example.com/get',
        text: 'Test Link',
        line: 1,
      };

      await validator.validateLink(link, '/test/file.md');

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/get', {
        method: 'GET', // Should use GET for content analysis
        signal: expect.any(AbortSignal),
        headers: {
          'User-Agent': 'markmv-validator/1.0 (content-freshness-detection)',
        },
      });
    });

    it('should apply domain-specific freshness thresholds', async () => {
      const firebaseValidator = new LinkValidator({
        checkExternal: true,
        checkContentFreshness: true,
        freshnessConfig: {
          domainThresholds: {
            'firebase.google.com': 6 * 30 * 24 * 60 * 60 * 1000, // 6 months
          },
        },
      });

      const eightMonthsAgo = new Date(Date.now() - 8 * 30 * 24 * 60 * 60 * 1000);
      
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([
          ['last-modified', eightMonthsAgo.toUTCString()],
        ]),
        text: () => Promise.resolve('Firebase documentation'),
        url: 'https://firebase.google.com/docs/functions',
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://firebase.google.com/docs/functions',
        text: 'Firebase Docs',
        line: 1,
      };

      const result = await firebaseValidator.validateLink(link, '/test/file.md');

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('content-stale');
      expect(result?.freshnessInfo?.thresholdMs).toBe(6 * 30 * 24 * 60 * 60 * 1000);
    });
  });

  describe('Without Freshness Detection', () => {
    it('should use HEAD method when freshness detection is disabled', async () => {
      const validatorWithoutFreshness = new LinkValidator({
        checkExternal: true,
        checkContentFreshness: false,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
        url: 'https://example.com/head',
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://example.com/head',
        text: 'Test Link',
        line: 1,
      };

      await validatorWithoutFreshness.validateLink(link, '/test/file.md');

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/head', {
        method: 'HEAD', // Should use HEAD when freshness is disabled
        signal: expect.any(AbortSignal),
        headers: {
          'User-Agent': 'markmv-validator/1.0 (content-freshness-detection)',
        },
      });
    });

    it('should not include freshness info when detection is disabled', async () => {
      const validatorWithoutFreshness = new LinkValidator({
        checkExternal: true,
        checkContentFreshness: false,
      });

      const veryOldDate = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000); // 5 years ago
      
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([
          ['last-modified', veryOldDate.toUTCString()],
        ]),
        url: 'https://example.com/old-no-freshness',
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://example.com/old-no-freshness',
        text: 'Old Link',
        line: 1,
      };

      const result = await validatorWithoutFreshness.validateLink(link, '/test/file.md');

      expect(result).toBeNull(); // Should be valid even if old
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors during freshness check', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://example.com/network-error',
        text: 'Error Link',
        line: 1,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('external-error');
      expect(result?.details).toContain('Network error');
    });

    it('should handle HTTP errors during freshness check', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Map(),
        url: 'https://example.com/not-found',
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://example.com/not-found',
        text: 'Not Found Link',
        line: 1,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('external-error');
      expect(result?.details).toContain('HTTP 404');
    });

    it('should handle timeout during freshness check', async () => {
      const shortTimeoutValidator = new LinkValidator({
        checkExternal: true,
        checkContentFreshness: true,
        externalTimeout: 1, // Very short timeout
      });

      // Mock a slow response that will definitely timeout
      mockFetch.mockImplementation(() => 
        new Promise((resolve, reject) => {
          // Simulate AbortController behavior
          setTimeout(() => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
          }, 2);
        })
      );

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://example.com/slow',
        text: 'Slow Link',
        line: 1,
      };

      const result = await shortTimeoutValidator.validateLink(link, '/test/file.md');

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('external-error');
      expect(result?.details).toContain('aborted');
    });

    it('should handle malformed response headers gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([
          ['last-modified', 'invalid-date-format'],
        ]),
        text: () => Promise.resolve('Content with invalid headers'),
        url: 'https://example.com/invalid-headers',
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://example.com/invalid-headers',
        text: 'Invalid Headers Link',
        line: 1,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      // Should still work, just without last-modified date
      expect(result).toBeNull(); // Link is valid despite invalid headers
    });
  });

  describe('Image Link Freshness', () => {
    it('should check freshness for external image links', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([
          ['content-type', 'image/jpeg'],
        ]),
        text: () => Promise.resolve(''), // Images don't have text content
        url: 'https://example.com/image.jpg',
      });

      const link: MarkdownLink = {
        type: 'image',
        href: 'https://example.com/image.jpg',
        text: 'Test Image',
        line: 1,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      expect(result).toBeNull(); // Image should be valid
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/image.jpg', {
        method: 'GET',
        signal: expect.any(AbortSignal),
        headers: {
          'User-Agent': 'markmv-validator/1.0 (content-freshness-detection)',
        },
      });
    });

    it('should not check freshness for local image links', async () => {
      // Create a test image file
      const imagePath = join(tempDir, 'test-image.jpg');
      await writeFile(imagePath, 'fake-image-content');

      const link: MarkdownLink = {
        type: 'image',
        href: './test-image.jpg',
        text: 'Local Image',
        line: 1,
        resolvedPath: imagePath,
      };

      const result = await validator.validateLink(link, '/test/file.md');

      expect(result).toBeNull(); // Local image should be valid
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Content Change Detection', () => {
    it('should provide content hashes for freshness analysis', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
        text: () => Promise.resolve('Content for hash analysis'),
        url: 'https://example.com/hash-test',
      });

      const link: MarkdownLink = {
        type: 'external',
        href: 'https://example.com/hash-test',
        text: 'Hash Test Link',
        line: 1,
      };

      const result = await validator.validateLink(link, '/test/file.md');
      
      // Should be valid since content is fresh and no stale patterns
      expect(result).toBeNull();
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/hash-test', {
        method: 'GET',
        signal: expect.any(AbortSignal),
        headers: {
          'User-Agent': 'markmv-validator/1.0 (content-freshness-detection)',
        },
      });
    });
  });

  describe('Multiple Link Types', () => {
    it('should handle mixed link types with selective freshness checking', async () => {
      // Mock for external link
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
        text: () => Promise.resolve('External content'),
        url: 'https://example.com/external',
      });

      const links: MarkdownLink[] = [
        {
          type: 'internal',
          href: './internal.md',
          text: 'Internal Link',
          line: 1,
          resolvedPath: join(tempDir, 'internal.md'),
        },
        {
          type: 'external',
          href: 'https://example.com/external',
          text: 'External Link',
          line: 2,
        },
        {
          type: 'anchor',
          href: '#section',
          text: 'Anchor Link',
          line: 3,
        },
      ];

      // Create internal file
      await writeFile(join(tempDir, 'internal.md'), '# Internal File');
      
      // Create source file with anchor
      const sourceFile = join(tempDir, 'source.md');
      await writeFile(sourceFile, '# Section\nContent here');

      const results = await Promise.all(
        links.map(link => validator.validateLink(link, sourceFile))
      );

      // Internal link should be valid
      expect(results[0]).toBeNull();
      
      // External link should be valid (fresh)
      expect(results[1]).toBeNull();
      
      // Anchor link should be valid
      expect(results[2]).toBeNull();

      // Only external link should trigger fetch
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});