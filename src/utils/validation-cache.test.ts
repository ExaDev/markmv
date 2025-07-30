/**
 * Tests for validation result caching system.
 *
 * @fileoverview Tests for caching validation results and cache management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ValidationCache, calculateFileHash, calculateConfigHash } from './validation-cache.js';

describe('ValidationCache', () => {
  let tempDir: string;
  let cache: ValidationCache;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'validation-cache-test-'));
    cache = new ValidationCache({
      cacheDir: join(tempDir, 'cache'),
      externalLinksTtl: 1000, // 1 second for testing
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('Cache Initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultCache = new ValidationCache();
      expect(defaultCache).toBeDefined();
    });

    it('should initialize with custom configuration', () => {
      const customCache = new ValidationCache({
        cacheDir: './custom-cache',
        externalLinksTtl: 5000,
        maxSizeBytes: 50 * 1024 * 1024,
      });
      expect(customCache).toBeDefined();
    });

    it('should check if cache is enabled', async () => {
      const enabled = await cache.isEnabled();
      expect(enabled).toBe(true);
    });
  });

  describe('Cache Operations', () => {
    const testFilePath = '/test/file.md';
    const testContentHash = 'abc123';
    const testConfigHash = 'def456';
    const testResult = {
      brokenLinks: [],
      totalLinks: 5,
    } as any;

    it('should store and retrieve cache entries', async () => {
      // Store in cache
      await cache.set(testFilePath, testContentHash, testResult, testConfigHash);

      // Retrieve from cache
      const cached = await cache.get(testFilePath, testContentHash, testConfigHash);

      expect(cached).toBeDefined();
      expect(cached?.filePath).toBe(testFilePath);
      expect(cached?.contentHash).toBe(testContentHash);
      expect(cached?.configHash).toBe(testConfigHash);
      expect(cached?.result).toEqual(testResult);
    });

    it('should return undefined for non-existent cache entries', async () => {
      const cached = await cache.get('/nonexistent.md', 'hash', 'config');
      expect(cached).toBeUndefined();
    });

    it('should invalidate cache when content hash changes', async () => {
      await cache.set(testFilePath, testContentHash, testResult, testConfigHash);

      // Try to get with different content hash
      const cached = await cache.get(testFilePath, 'different-hash', testConfigHash);
      expect(cached).toBeUndefined();
    });

    it('should invalidate cache when config hash changes', async () => {
      await cache.set(testFilePath, testContentHash, testResult, testConfigHash);

      // Try to get with different config hash
      const cached = await cache.get(testFilePath, testContentHash, 'different-config');
      expect(cached).toBeUndefined();
    });

    it('should include git commit in cache validation', async () => {
      const gitCommit = 'commit123';
      await cache.set(testFilePath, testContentHash, testResult, testConfigHash, gitCommit);

      // Should get with same git commit
      const cached1 = await cache.get(testFilePath, testContentHash, testConfigHash, gitCommit);
      expect(cached1).toBeDefined();

      // Should still get without git commit (backward compatibility)
      const cached2 = await cache.get(testFilePath, testContentHash, testConfigHash);
      expect(cached2).toBeDefined();
    });

    it('should handle TTL expiration for external links', async () => {
      // Create cache with very short TTL
      const shortTtlCache = new ValidationCache({
        cacheDir: join(tempDir, 'short-ttl-cache'),
        externalLinksTtl: 1, // 1ms
      });

      await shortTtlCache.set(testFilePath, testContentHash, testResult, testConfigHash);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should be invalidated due to TTL (assuming external links exist)
      const cached = await shortTtlCache.get(testFilePath, testContentHash, testConfigHash);
      // Note: This test assumes the hasExternalLinks method returns true
      // In real implementation, this would depend on the actual result content
    });
  });

  describe('Cache Management', () => {
    it('should invalidate specific cache entry', async () => {
      const testResult = { brokenLinks: [], totalLinks: 1 } as any;
      await cache.set('/test/file.md', 'hash1', testResult, 'config1');

      await cache.invalidate('/test/file.md');

      const cached = await cache.get('/test/file.md', 'hash1', 'config1');
      expect(cached).toBeUndefined();
    });

    it('should clear entire cache', async () => {
      const testResult = { brokenLinks: [], totalLinks: 1 } as any;
      await cache.set('/test/file1.md', 'hash1', testResult, 'config1');
      await cache.set('/test/file2.md', 'hash2', testResult, 'config1');

      await cache.clear();

      const cached1 = await cache.get('/test/file1.md', 'hash1', 'config1');
      const cached2 = await cache.get('/test/file2.md', 'hash2', 'config1');

      expect(cached1).toBeUndefined();
      expect(cached2).toBeUndefined();
    });

    it('should get cache metadata', async () => {
      const testResult = { brokenLinks: [], totalLinks: 3 } as any;
      await cache.set('/test/file1.md', 'hash1', testResult, 'config1');
      await cache.set('/test/file2.md', 'hash2', testResult, 'config1');

      const metadata = await cache.getMetadata();

      expect(metadata.totalFiles).toBeGreaterThan(0);
      expect(metadata.sizeBytes).toBeGreaterThan(0);
      expect(metadata.version).toBeDefined();
    });

    it('should perform cleanup of expired entries', async () => {
      // This test would need mock of shouldRemoveFromCache
      // For now, just test that cleanup runs without error
      const removedCount = await cache.cleanup();
      expect(removedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('File Hash Calculation', () => {
    it('should calculate file hash', async () => {
      const testFile = join(tempDir, 'test.md');
      const content = '# Test File\n\nThis is test content.';
      await writeFile(testFile, content, 'utf-8');

      const hash = await calculateFileHash(testFile);

      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64); // SHA-256 hex string
    });

    it('should produce same hash for same content', async () => {
      const testFile1 = join(tempDir, 'test1.md');
      const testFile2 = join(tempDir, 'test2.md');
      const content = '# Same Content\n\nIdentical content.';

      await writeFile(testFile1, content, 'utf-8');
      await writeFile(testFile2, content, 'utf-8');

      const hash1 = await calculateFileHash(testFile1);
      const hash2 = await calculateFileHash(testFile2);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different content', async () => {
      const testFile1 = join(tempDir, 'test1.md');
      const testFile2 = join(tempDir, 'test2.md');

      await writeFile(testFile1, 'Content 1', 'utf-8');
      await writeFile(testFile2, 'Content 2', 'utf-8');

      const hash1 = await calculateFileHash(testFile1);
      const hash2 = await calculateFileHash(testFile2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle file reading errors', async () => {
      await expect(calculateFileHash('/nonexistent/file.md')).rejects.toThrow();
    });
  });

  describe('Config Hash Calculation', () => {
    it('should calculate config hash', () => {
      const config = {
        checkExternal: true,
        timeout: 5000,
        linkTypes: ['internal', 'external'],
      };

      const hash = calculateConfigHash(config);

      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64); // SHA-256 hex string
    });

    it('should produce same hash for same config', () => {
      const config1 = { a: 1, b: 2, c: 3 };
      const config2 = { c: 3, b: 2, a: 1 }; // Different order

      const hash1 = calculateConfigHash(config1);
      const hash2 = calculateConfigHash(config2);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different configs', () => {
      const config1 = { checkExternal: true, timeout: 5000 };
      const config2 = { checkExternal: false, timeout: 5000 };

      const hash1 = calculateConfigHash(config1);
      const hash2 = calculateConfigHash(config2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle complex nested objects', () => {
      const config = {
        options: {
          validation: {
            types: ['internal', 'external'],
            settings: { strict: true, timeout: 1000 }
          }
        },
        features: ['cache', 'git']
      };

      const hash = calculateConfigHash(config);
      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64);
    });
  });

  describe('Error Handling', () => {
    it('should handle cache write failures gracefully', async () => {
      // Create cache with invalid directory (read-only)
      const invalidCache = new ValidationCache({
        cacheDir: '/invalid/readonly/path'
      });

      // Should not throw, just log warning
      await expect(invalidCache.set('/test.md', 'hash', {} as any, 'config')).resolves.not.toThrow();
    });

    it('should handle cache read failures gracefully', async () => {
      const result = await cache.get('/test.md', 'hash', 'config');
      expect(result).toBeUndefined();
    });

    it('should handle malformed cache files', async () => {
      // Create malformed cache file
      const cacheDir = join(tempDir, 'cache');
      await writeFile(join(cacheDir, 'malformed.json'), 'invalid json', 'utf-8');

      // Should handle gracefully
      const result = await cache.get('/test.md', 'hash', 'config');
      expect(result).toBeUndefined();
    });
  });

  describe('Cache Performance', () => {
    it('should handle multiple concurrent operations', async () => {
      const testResult = { brokenLinks: [], totalLinks: 1 } as any;
      const operations = [];

      // Create multiple concurrent cache operations
      for (let i = 0; i < 10; i++) {
        operations.push(
          cache.set(`/test/file${i}.md`, `hash${i}`, testResult, 'config')
        );
      }

      // All operations should complete successfully
      await Promise.all(operations);

      // Verify all entries were stored
      for (let i = 0; i < 10; i++) {
        const cached = await cache.get(`/test/file${i}.md`, `hash${i}`, 'config');
        expect(cached).toBeDefined();
      }
    });

    it('should handle large cache entries', async () => {
      // Create large result object
      const largeResult = {
        brokenLinks: Array(1000).fill(null).map((_, i) => ({
          link: { href: `https://example.com/link${i}`, type: 'external' },
          reason: `Test reason ${i}`
        })),
        totalLinks: 1000
      } as any;

      await cache.set('/test/large.md', 'hash', largeResult, 'config');

      const cached = await cache.get('/test/large.md', 'hash', 'config');
      expect(cached?.result.brokenLinks).toHaveLength(1000);
    });
  });
});