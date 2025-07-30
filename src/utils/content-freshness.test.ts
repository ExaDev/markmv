/**
 * Tests for content freshness detection system.
 *
 * @fileoverview Tests for detecting stale external content and last-modified tracking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContentFreshnessDetector, DEFAULT_FRESHNESS_CONFIG, type ResponseInfo } from './content-freshness.js';

describe('ContentFreshnessDetector', () => {
  let tempDir: string;
  let detector: ContentFreshnessDetector;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'content-freshness-test-'));
    detector = new ContentFreshnessDetector({
      cacheDir: join(tempDir, 'cache'),
      defaultThreshold: 365 * 24 * 60 * 60 * 1000, // 1 year for testing
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultDetector = new ContentFreshnessDetector();
      expect(defaultDetector.isEnabled()).toBe(true);
    });

    it('should initialize with custom configuration', () => {
      const customDetector = new ContentFreshnessDetector({
        enabled: false,
        defaultThreshold: 6 * 30 * 24 * 60 * 60 * 1000, // 6 months
        stalePatterns: ['custom-pattern'],
      });
      expect(customDetector.isEnabled()).toBe(false);
    });

    it('should use default freshness configuration', () => {
      expect(DEFAULT_FRESHNESS_CONFIG.enabled).toBe(true);
      expect(DEFAULT_FRESHNESS_CONFIG.defaultThreshold).toBe(2 * 365 * 24 * 60 * 60 * 1000);
      expect(DEFAULT_FRESHNESS_CONFIG.stalePatterns).toContain('deprecated');
      expect(DEFAULT_FRESHNESS_CONFIG.domainThresholds['firebase.google.com']).toBe(1 * 365 * 24 * 60 * 60 * 1000);
    });
  });

  describe('Content Analysis', () => {
    it('should detect fresh content based on last-modified header', async () => {
      const recentDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const response: ResponseInfo = {
        status: 200,
        headers: {
          'last-modified': recentDate.toUTCString(),
        },
        content: 'Fresh content here',
        finalUrl: 'https://example.com/fresh',
      };

      const result = await detector.analyzeContentFreshness('https://example.com/fresh', response);

      expect(result.isFresh).toBe(true);
      expect(result.lastModified).toBeDefined();
      expect(result.ageMs).toBeLessThan(365 * 24 * 60 * 60 * 1000);
      expect(result.warning).toBeUndefined();
    });

    it('should detect stale content based on last-modified header', async () => {
      const oldDate = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000); // 2 years ago
      const response: ResponseInfo = {
        status: 200,
        headers: {
          'last-modified': oldDate.toUTCString(),
        },
        content: 'Old content here',
        finalUrl: 'https://example.com/old',
      };

      const result = await detector.analyzeContentFreshness('https://example.com/old', response);

      expect(result.isFresh).toBe(false);
      expect(result.lastModified).toBeDefined();
      expect(result.ageMs).toBeGreaterThan(365 * 24 * 60 * 60 * 1000);
      expect(result.warning).toContain('old');
      expect(result.suggestion).toContain('newer version');
    });

    it('should detect stale patterns in content', async () => {
      const response: ResponseInfo = {
        status: 200,
        headers: {},
        content: 'This feature is deprecated and no longer supported.',
        finalUrl: 'https://example.com/deprecated',
      };

      const result = await detector.analyzeContentFreshness('https://example.com/deprecated', response);

      expect(result.isFresh).toBe(false);
      expect(result.stalePatterns).toContain('deprecated');
      expect(result.stalePatterns).toContain('no longer supported');
      expect(result.warning).toContain('staleness indicators');
    });

    it('should apply domain-specific thresholds', async () => {
      const firebaseDetector = new ContentFreshnessDetector({
        cacheDir: join(tempDir, 'firebase-cache'),
        domainThresholds: {
          'firebase.google.com': 6 * 30 * 24 * 60 * 60 * 1000, // 6 months
        },
      });

      const dateEightMonthsAgo = new Date(Date.now() - 8 * 30 * 24 * 60 * 60 * 1000);
      const response: ResponseInfo = {
        status: 200,
        headers: {
          'last-modified': dateEightMonthsAgo.toUTCString(),
        },
        content: 'Firebase documentation',
        finalUrl: 'https://firebase.google.com/docs/functions',
      };

      const result = await firebaseDetector.analyzeContentFreshness(
        'https://firebase.google.com/docs/functions',
        response
      );

      expect(result.isFresh).toBe(false);
      expect(result.thresholdMs).toBe(6 * 30 * 24 * 60 * 60 * 1000);
    });

    it('should handle missing last-modified header gracefully', async () => {
      const response: ResponseInfo = {
        status: 200,
        headers: {},
        content: 'No last modified header',
        finalUrl: 'https://example.com/no-header',
      };

      const result = await detector.analyzeContentFreshness('https://example.com/no-header', response);

      expect(result.lastModified).toBeUndefined();
      expect(result.ageMs).toBeUndefined();
      // Content might still be flagged as stale if patterns are detected
    });

    it('should detect multiple stale patterns', async () => {
      const response: ResponseInfo = {
        status: 200,
        headers: {},
        content: 'This page has moved and the content is deprecated. This is legacy documentation.',
        finalUrl: 'https://example.com/multi-stale',
      };

      const result = await detector.analyzeContentFreshness('https://example.com/multi-stale', response);

      expect(result.isFresh).toBe(false);
      expect(result.stalePatterns).toContain('this page has moved');
      expect(result.stalePatterns).toContain('deprecated');
      expect(result.stalePatterns).toContain('legacy documentation');
    });
  });

  describe('Content Change Detection', () => {
    it('should detect content changes between validations', async () => {
      const url = 'https://example.com/changing';
      
      // First validation
      const response1: ResponseInfo = {
        status: 200,
        headers: {},
        content: 'Original content',
        finalUrl: url,
      };

      const result1 = await detector.analyzeContentFreshness(url, response1);
      expect(result1.hasContentChanged).toBeUndefined(); // No previous content

      // Second validation with changed content
      const response2: ResponseInfo = {
        status: 200,
        headers: {},
        content: 'Updated content with significant changes',
        finalUrl: url,
      };

      const result2 = await detector.analyzeContentFreshness(url, response2);
      expect(result2.hasContentChanged).toBe(true);
      expect(result2.previousContentHash).toBeDefined();
      expect(result2.contentHash).not.toBe(result2.previousContentHash);
    });

    it('should not flag content as changed for minor whitespace differences', async () => {
      const url = 'https://example.com/whitespace';
      
      // First validation
      const response1: ResponseInfo = {
        status: 200,
        headers: {},
        content: 'Content   with    extra\n\n\nspaces\t\tand\ttabs',
        finalUrl: url,
      };

      const result1 = await detector.analyzeContentFreshness(url, response1);

      // Second validation with normalized whitespace
      const response2: ResponseInfo = {
        status: 200,
        headers: {},
        content: 'Content with extra spaces and tabs',
        finalUrl: url,
      };

      const result2 = await detector.analyzeContentFreshness(url, response2);
      expect(result2.contentHash).toBe(result1.contentHash);
    });

    it('should normalize content for consistent hashing', async () => {
      const url = 'https://example.com/normalize';
      
      const contentWithVariations = `
        <html>
          <head>
            <script>console.log('dynamic');</script>
            <style>.test { color: red; }</style>
          </head>
          <body>
            <!-- This is a comment -->
            <p>Main content here on 2024-01-15 at 14:30:25</p>
          </body>
        </html>
      `;

      const response: ResponseInfo = {
        status: 200,
        headers: {},
        content: contentWithVariations,
        finalUrl: url,
      };

      const result = await detector.analyzeContentFreshness(url, response);
      expect(result.contentHash).toBeDefined();
      expect(result.contentHash).toHaveLength(64); // SHA-256 hex string
    });
  });

  describe('Cache Management', () => {
    it('should store and retrieve cached content information', async () => {
      const url = 'https://example.com/cached';
      const response: ResponseInfo = {
        status: 200,
        headers: {
          'last-modified': new Date().toUTCString(),
          'etag': '"test-etag"',
        },
        content: 'Cached content',
        finalUrl: url,
      };

      // First analysis should cache the result
      await detector.analyzeContentFreshness(url, response);

      // Get cache stats
      const stats = await detector.getCacheStats();
      expect(stats.totalEntries).toBe(1);
      expect(stats.newestEntry).toBeDefined();
    });

    it('should clear cache successfully', async () => {
      const url = 'https://example.com/clear-cache';
      const response: ResponseInfo = {
        status: 200,
        headers: {},
        content: 'Cache test content',
        finalUrl: url,
      };

      await detector.analyzeContentFreshness(url, response);

      let stats = await detector.getCacheStats();
      expect(stats.totalEntries).toBe(1);

      await detector.clearCache();

      stats = await detector.getCacheStats();
      expect(stats.totalEntries).toBe(0);
    });

    it('should handle cache errors gracefully', async () => {
      const invalidDetector = new ContentFreshnessDetector({
        cacheDir: '/invalid/readonly/path',
      });

      const url = 'https://example.com/cache-error';
      const response: ResponseInfo = {
        status: 200,
        headers: {},
        content: 'Error test content',
        finalUrl: url,
      };

      // Should not throw error even with invalid cache path
      const result = await invalidDetector.analyzeContentFreshness(url, response);
      expect(result.contentHash).toBeDefined();
    });
  });

  describe('URL Processing', () => {
    it('should extract domain correctly from various URL formats', async () => {
      const testCases = [
        'https://example.com/path',
        'http://subdomain.example.com/path?query=1',
        'https://docs.github.com/en/actions',
        'https://firebase.google.com/docs/functions/beta',
      ];

      for (const url of testCases) {
        const response: ResponseInfo = {
          status: 200,
          headers: {},
          content: 'Test content',
          finalUrl: url,
        };

        const result = await detector.analyzeContentFreshness(url, response);
        expect(result.url).toBe(url);
        expect(result.thresholdMs).toBeGreaterThan(0);
      }
    });

    it('should handle invalid URLs gracefully', async () => {
      const invalidUrl = 'not-a-valid-url';
      const response: ResponseInfo = {
        status: 200,
        headers: {},
        content: 'Test content',
        finalUrl: invalidUrl,
      };

      const result = await detector.analyzeContentFreshness(invalidUrl, response);
      expect(result.url).toBe(invalidUrl);
      expect(result.thresholdMs).toBe(detector['config'].defaultThreshold);
    });
  });

  describe('Age Formatting', () => {
    it('should format age in human-readable format', async () => {
      const testCases = [
        { ageMs: 2 * 365 * 24 * 60 * 60 * 1000, expected: '2 years' },
        { ageMs: 1 * 365 * 24 * 60 * 60 * 1000 + 6 * 30 * 24 * 60 * 60 * 1000, expected: '1 year, 6 months' },
        { ageMs: 3 * 30 * 24 * 60 * 60 * 1000, expected: '3 months' },
        { ageMs: 15 * 24 * 60 * 60 * 1000, expected: '15 days' },
      ];

      for (const testCase of testCases) {
        const oldDate = new Date(Date.now() - testCase.ageMs);
        const response: ResponseInfo = {
          status: 200,
          headers: {
            'last-modified': oldDate.toUTCString(),
          },
          content: 'Age test content',
          finalUrl: 'https://example.com/age-test',
        };

        const result = await detector.analyzeContentFreshness('https://example.com/age-test', response);
        
        if (!result.isFresh && result.warning) {
          expect(result.warning).toContain(testCase.expected);
        }
      }
    });
  });

  describe('Disabled Detection', () => {
    it('should return fresh result when detection is disabled', async () => {
      const disabledDetector = new ContentFreshnessDetector({
        enabled: false,
      });

      const response: ResponseInfo = {
        status: 200,
        headers: {},
        content: 'This content is deprecated and no longer supported',
        finalUrl: 'https://example.com/disabled',
      };

      const result = await disabledDetector.analyzeContentFreshness('https://example.com/disabled', response);

      expect(result.isFresh).toBe(true);
      expect(result.stalePatterns).toHaveLength(0);
      expect(result.thresholdMs).toBe(0);
    });
  });

  describe('Case Sensitivity', () => {
    it('should detect stale patterns case-insensitively', async () => {
      const response: ResponseInfo = {
        status: 200,
        headers: {},
        content: 'This feature is DEPRECATED and NO LONGER SUPPORTED.',
        finalUrl: 'https://example.com/case-test',
      };

      const result = await detector.analyzeContentFreshness('https://example.com/case-test', response);

      expect(result.isFresh).toBe(false);
      expect(result.stalePatterns).toContain('deprecated');
      expect(result.stalePatterns).toContain('no longer supported');
    });
  });

  describe('Performance', () => {
    it('should handle large content efficiently', async () => {
      const largeContent = 'Large content section '.repeat(10000) + 'deprecated';
      const response: ResponseInfo = {
        status: 200,
        headers: {},
        content: largeContent,
        finalUrl: 'https://example.com/large',
      };

      const startTime = Date.now();
      const result = await detector.analyzeContentFreshness('https://example.com/large', response);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      expect(result.stalePatterns).toContain('deprecated');
      expect(result.contentHash).toBeDefined();
    });

    it('should handle concurrent analyses', async () => {
      const urls = Array.from({ length: 10 }, (_, i) => `https://example.com/concurrent-${i}`);
      const promises = urls.map(url => {
        const response: ResponseInfo = {
          status: 200,
          headers: {},
          content: `Content for ${url}`,
          finalUrl: url,
        };
        return detector.analyzeContentFreshness(url, response);
      });

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result.url).toBe(urls[i]);
        expect(result.contentHash).toBeDefined();
      });
    });
  });
});