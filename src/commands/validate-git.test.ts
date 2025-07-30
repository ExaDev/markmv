/**
 * Tests for git integration in validate command.
 *
 * @fileoverview Tests for git-aware validation features including caching and incremental validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateLinks } from './validate.js';

// Mock git utils and validation cache
vi.mock('../utils/git-utils.js', () => {
  const MockGitUtils = vi.fn().mockImplementation(() => ({
    isGitRepository: vi.fn().mockReturnValue(true),
    getRepositoryRoot: vi.fn().mockReturnValue('/test/repo'),
    getStatus: vi.fn().mockReturnValue({
      branch: 'main',
      commit: 'abc123',
      isDirty: false,
      rootDir: '/test/repo',
    }),
    getCurrentCommit: vi.fn().mockReturnValue('abc123'),
    refExists: vi.fn().mockReturnValue(true),
    getChangedFiles: vi.fn().mockReturnValue([
      { path: '/test/repo/changed.md', status: 'modified' },
      { path: '/test/repo/new.md', status: 'added' },
    ]),
    getStagedFiles: vi.fn().mockReturnValue([
      { path: '/test/repo/staged.md', status: 'modified' },
    ]),
  }));

  return {
    GitUtils: MockGitUtils,
  };
});

vi.mock('../utils/validation-cache.js', () => {
  const mockCache = {
    isEnabled: vi.fn().mockResolvedValue(true),
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    getMetadata: vi.fn().mockResolvedValue({
      totalFiles: 5,
      totalLinks: 25,
      hitRate: 80,
      sizeBytes: 1024,
      lastCleanup: 0,
      version: '1.0.0',
    }),
  };

  const MockValidationCache = vi.fn().mockImplementation(() => mockCache);

  return {
    ValidationCache: MockValidationCache,
    calculateFileHash: vi.fn().mockResolvedValue('test-hash'),
    calculateConfigHash: vi.fn().mockReturnValue('config-hash'),
  };
});

// Mock link validator and parser
vi.mock('../core/link-validator.js', () => ({
  LinkValidator: vi.fn().mockImplementation(() => ({
    validateLinks: vi.fn().mockResolvedValue({
      brokenLinks: [],
    }),
    checkCircularReferences: vi.fn().mockResolvedValue({
      hasCircularReferences: false,
    }),
  })),
}));

vi.mock('../core/link-parser.js', () => ({
  LinkParser: vi.fn().mockImplementation(() => ({
    parseFile: vi.fn().mockResolvedValue({
      links: [
        { type: 'internal', href: 'other.md', line: 1 },
        { type: 'external', href: 'https://example.com', line: 2 },
      ],
    }),
  })),
}));

// Mock file system
vi.mock('glob', () => ({
  glob: vi.fn().mockResolvedValue(['/test/file1.md', '/test/file2.md']),
}));

describe('Git Integration in Validate Command', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'validate-git-test-'));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('Git Diff Mode', () => {
    it('should validate only changed files when using git diff', async () => {
      const result = await validateLinks(['**/*.md'], {
        gitDiff: 'HEAD~1',
        verbose: true,
      });

      expect(result.filesProcessed).toBe(2); // changed.md and new.md
      expect(result.gitInfo?.enabled).toBe(true);
      expect(result.gitInfo?.baseRef).toBe('HEAD~1');
      expect(result.gitInfo?.changedFiles).toBe(2);
      expect(result.gitInfo?.currentCommit).toBe('abc123');
    });

    it('should handle git diff with specific range', async () => {
      const result = await validateLinks(['**/*.md'], {
        gitDiff: 'main..feature',
        verbose: true,
      });

      expect(result.gitInfo?.enabled).toBe(true);
      expect(result.gitInfo?.baseRef).toBe('main..feature');
    });

    it('should throw error for non-existent git reference', async () => {
      const { GitUtils } = await import('../utils/git-utils.js');
      const mockGitUtils = vi.mocked(GitUtils);
      mockGitUtils.mockImplementation(() => ({
        isGitRepository: vi.fn().mockReturnValue(true),
        refExists: vi.fn().mockReturnValue(false),
      } as any));

      await expect(validateLinks(['**/*.md'], {
        gitDiff: 'nonexistent-ref',
      })).rejects.toThrow("Git reference 'nonexistent-ref' does not exist");
    });

    it('should filter out deleted files from git diff', async () => {
      const { GitUtils } = await import('../utils/git-utils.js');
      const mockGitUtils = vi.mocked(GitUtils);
      mockGitUtils.mockImplementation(() => ({
        isGitRepository: vi.fn().mockReturnValue(true),
        getRepositoryRoot: vi.fn().mockReturnValue('/test/repo'),
        getStatus: vi.fn().mockReturnValue({
          branch: 'main',
          commit: 'abc123',
          isDirty: false,
          rootDir: '/test/repo',
        }),
        refExists: vi.fn().mockReturnValue(true),
        getChangedFiles: vi.fn().mockReturnValue([
          { path: '/test/repo/modified.md', status: 'modified' },
          { path: '/test/repo/deleted.md', status: 'deleted' },
          { path: '/test/repo/added.md', status: 'added' },
        ]),
      } as any));

      const result = await validateLinks(['**/*.md'], {
        gitDiff: 'HEAD~1',
      });

      // Should only process modified and added files, not deleted
      expect(result.filesProcessed).toBe(2);
    });
  });

  describe('Git Staged Mode', () => {
    it('should validate only staged files', async () => {
      const result = await validateLinks(['**/*.md'], {
        gitStaged: true,
        verbose: true,
      });

      expect(result.filesProcessed).toBe(1); // staged.md
      expect(result.gitInfo?.enabled).toBe(true);
      expect(result.gitInfo?.changedFiles).toBe(1);
      expect(result.gitInfo?.baseRef).toBeUndefined();
    });

    it('should handle empty staged files', async () => {
      const { GitUtils } = await import('../utils/git-utils.js');
      const mockGitUtils = vi.mocked(GitUtils);
      mockGitUtils.mockImplementation(() => ({
        isGitRepository: vi.fn().mockReturnValue(true),
        getRepositoryRoot: vi.fn().mockReturnValue('/test/repo'),
        getStatus: vi.fn().mockReturnValue({
          branch: 'main',
          commit: 'abc123',
          isDirty: false,
          rootDir: '/test/repo',
        }),
        getStagedFiles: vi.fn().mockReturnValue([]),
      } as any));

      const result = await validateLinks(['**/*.md'], {
        gitStaged: true,
      });

      expect(result.filesProcessed).toBe(0);
      expect(result.gitInfo?.changedFiles).toBe(0);
    });
  });

  describe('Cache Integration', () => {
    it('should use cache when enabled', async () => {
      const { ValidationCache } = await import('../utils/validation-cache.js');
      const mockCacheInstance = {
        isEnabled: vi.fn().mockResolvedValue(true),
        get: vi.fn().mockResolvedValue({
          filePath: '/test/cached.md',
          contentHash: 'cached-hash',
          result: {
            brokenLinks: [],
            totalLinks: 3,
          },
        }),
        set: vi.fn(),
      };
      vi.mocked(ValidationCache).mockImplementation(() => mockCacheInstance as any);

      const result = await validateLinks(['/test/cached.md'], {
        cache: true,
        verbose: true,
      });

      expect(mockCacheInstance.get).toHaveBeenCalled();
      expect(result.gitInfo?.cachedFiles).toBeGreaterThan(0);
    });

    it('should store results in cache when cache misses', async () => {
      const { ValidationCache } = await import('../utils/validation-cache.js');
      const mockCacheInstance = {
        isEnabled: vi.fn().mockResolvedValue(true),
        get: vi.fn().mockResolvedValue(undefined), // Cache miss
        set: vi.fn(),
      };
      vi.mocked(ValidationCache).mockImplementation(() => mockCacheInstance as any);

      await validateLinks(['/test/new.md'], {
        cache: true,
      });

      expect(mockCacheInstance.set).toHaveBeenCalled();
    });

    it('should disable cache gracefully when not accessible', async () => {
      const { ValidationCache } = await import('../utils/validation-cache.js');
      const mockCacheInstance = {
        isEnabled: vi.fn().mockResolvedValue(false),
      };
      vi.mocked(ValidationCache).mockImplementation(() => mockCacheInstance as any);

      // Should not throw error
      const result = await validateLinks(['/test/file.md'], {
        cache: true,
        verbose: true,
      });

      expect(result.gitInfo?.cachedFiles).toBe(0);
    });

    it('should calculate cache hit rate correctly', async () => {
      const { ValidationCache } = await import('../utils/validation-cache.js');
      let callCount = 0;
      const mockCacheInstance = {
        isEnabled: vi.fn().mockResolvedValue(true),
        get: vi.fn().mockImplementation(() => {
          callCount++;
          // Return cached result for first call, miss for second
          if (callCount === 1) {
            return Promise.resolve({
              result: { brokenLinks: [], totalLinks: 2 }
            });
          }
          return Promise.resolve(undefined);
        }),
        set: vi.fn(),
      };
      vi.mocked(ValidationCache).mockImplementation(() => mockCacheInstance as any);

      const result = await validateLinks(['/test/file1.md', '/test/file2.md'], {
        cache: true,
        gitDiff: 'HEAD~1',
      });

      expect(result.gitInfo?.cachedFiles).toBe(1);
      expect(result.gitInfo?.cacheHitRate).toBe(50); // 1 hit out of 2 files
    });
  });

  describe('Fail-Fast Mode', () => {
    it('should exit early when fail-fast is enabled and broken link found', async () => {
      const { LinkValidator } = await import('../core/link-validator.js');
      vi.mocked(LinkValidator).mockImplementation(() => ({
        validateLinks: vi.fn().mockResolvedValue({
          brokenLinks: [
            {
              link: { href: 'broken.md', type: 'internal', line: 1 },
              reason: 'File not found',
            },
          ],
        }),
        checkCircularReferences: vi.fn().mockResolvedValue({
          hasCircularReferences: false,
        }),
      } as any));

      const result = await validateLinks(['/test/file1.md', '/test/file2.md'], {
        failFast: true,
        gitDiff: 'HEAD~1',
      });

      // Should stop processing after first broken link
      expect(result.brokenLinks).toBeGreaterThan(0);
      // May not process all files due to fail-fast
      expect(result.filesProcessed).toBeLessThanOrEqual(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle git repository detection failure', async () => {
      const { GitUtils } = await import('../utils/git-utils.js');
      vi.mocked(GitUtils).mockImplementation(() => ({
        isGitRepository: vi.fn().mockReturnValue(false),
      } as any));

      await expect(validateLinks(['**/*.md'], {
        gitDiff: 'HEAD~1',
      })).rejects.toThrow('Git integration requires a git repository');
    });

    it('should gracefully disable git integration when not in repository but cache enabled', async () => {
      const { GitUtils } = await import('../utils/git-utils.js');
      vi.mocked(GitUtils).mockImplementation(() => ({
        isGitRepository: vi.fn().mockReturnValue(false),
      } as any));

      // Should not throw, just disable git integration
      const result = await validateLinks(['**/*.md'], {
        cache: true,
        verbose: true,
      });

      expect(result.gitInfo?.enabled).toBeFalsy();
    });

    it('should handle git command failures gracefully', async () => {
      const { GitUtils } = await import('../utils/git-utils.js');
      vi.mocked(GitUtils).mockImplementation(() => ({
        isGitRepository: vi.fn().mockReturnValue(true),
        refExists: vi.fn().mockReturnValue(true),
        getChangedFiles: vi.fn().mockImplementation(() => {
          throw new Error('Git command failed');
        }),
      } as any));

      await expect(validateLinks(['**/*.md'], {
        gitDiff: 'HEAD~1',
      })).rejects.toThrow('Git command failed');
    });

    it('should handle cache errors gracefully', async () => {
      const { ValidationCache } = await import('../utils/validation-cache.js');
      const mockCacheInstance = {
        isEnabled: vi.fn().mockResolvedValue(true),
        get: vi.fn().mockRejectedValue(new Error('Cache read error')),
        set: vi.fn().mockRejectedValue(new Error('Cache write error')),
      };
      vi.mocked(ValidationCache).mockImplementation(() => mockCacheInstance as any);

      // Should not throw, just continue without cache
      const result = await validateLinks(['/test/file.md'], {
        cache: true,
      });

      expect(result.filesProcessed).toBe(1);
    });
  });

  describe('Integration with Standard Validation', () => {
    it('should fall back to standard glob patterns when no git options', async () => {
      const result = await validateLinks(['**/*.md'], {
        verbose: true,
      });

      expect(result.filesProcessed).toBeGreaterThan(0);
      expect(result.gitInfo?.enabled).toBeFalsy();
    });

    it('should combine git integration with other validation options', async () => {
      const result = await validateLinks(['**/*.md'], {
        gitDiff: 'HEAD~1',
        checkExternal: true,
        linkTypes: ['internal', 'external'],
        includeContext: true,
        cache: true,
      });

      expect(result.gitInfo?.enabled).toBe(true);
      expect(result.filesProcessed).toBeGreaterThan(0);
    });

    it('should handle mixed git and non-git patterns', async () => {
      // This test verifies that when git integration is enabled,
      // it overrides the standard glob pattern resolution
      const result = await validateLinks(['docs/**/*.md', 'README.md'], {
        gitStaged: true,
      });

      // Should only process staged files, not the glob patterns
      expect(result.gitInfo?.enabled).toBe(true);
      expect(result.filesProcessed).toBe(1); // Only staged.md
    });
  });

  describe('Output Formatting', () => {
    it('should include git information in results', async () => {
      const result = await validateLinks(['**/*.md'], {
        gitDiff: 'HEAD~1',
        cache: true,
      });

      expect(result.gitInfo).toBeDefined();
      expect(result.gitInfo?.enabled).toBe(true);
      expect(result.gitInfo?.baseRef).toBe('HEAD~1');
      expect(result.gitInfo?.currentCommit).toBe('abc123');
      expect(result.gitInfo?.changedFiles).toBeGreaterThan(0);
    });

    it('should track cache performance metrics', async () => {
      const { ValidationCache } = await import('../utils/validation-cache.js');
      const mockCacheInstance = {
        isEnabled: vi.fn().mockResolvedValue(true),
        get: vi.fn().mockResolvedValue({
          result: { brokenLinks: [], totalLinks: 1 }
        }),
        set: vi.fn(),
      };
      vi.mocked(ValidationCache).mockImplementation(() => mockCacheInstance as any);

      const result = await validateLinks(['/test/file.md'], {
        cache: true,
        gitStaged: true,
      });

      expect(result.gitInfo?.cacheHitRate).toBe(100); // 1 hit out of 1 file
    });
  });
});