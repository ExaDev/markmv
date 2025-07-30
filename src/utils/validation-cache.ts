/**
 * Validation result caching system for incremental validation.
 *
 * @fileoverview Provides caching capabilities for link validation results to improve performance
 * @category Utils
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import type { ValidationResult } from '../types/operations.js';

/**
 * Cached validation result for a file.
 *
 * @category Utils
 */
export interface CachedValidationResult {
  /** File path that was validated */
  filePath: string;
  /** Hash of file content when validated */
  contentHash: string;
  /** Git commit hash when validated */
  gitCommit?: string;
  /** Timestamp when validation was performed */
  timestamp: number;
  /** TTL for external link checks (milliseconds) */
  externalLinksTtl: number;
  /** Validation result */
  result: ValidationResult;
  /** Markmv version used for validation */
  version: string;
  /** Configuration hash used for validation */
  configHash: string;
}

/**
 * Cache metadata and statistics.
 *
 * @category Utils
 */
export interface CacheMetadata {
  /** Total number of cached files */
  totalFiles: number;
  /** Total number of cached links */
  totalLinks: number;
  /** Cache hit rate percentage */
  hitRate: number;
  /** Size of cache in bytes */
  sizeBytes: number;
  /** Last cleanup timestamp */
  lastCleanup: number;
  /** Cache version */
  version: string;
}

/**
 * Cache configuration options.
 *
 * @category Utils
 */
export interface CacheConfig {
  /** Cache directory path */
  cacheDir: string;
  /** TTL for external links in milliseconds */
  externalLinksTtl: number;
  /** Maximum cache size in bytes */
  maxSizeBytes: number;
  /** Enable cache compression */
  compression: boolean;
  /** Cleanup interval in milliseconds */
  cleanupInterval: number;
}

/**
 * Default cache configuration.
 */
const DEFAULT_CACHE_CONFIG: CacheConfig = {
  cacheDir: '.markmv-cache',
  externalLinksTtl: 24 * 60 * 60 * 1000, // 24 hours
  maxSizeBytes: 100 * 1024 * 1024, // 100MB
  compression: true,
  cleanupInterval: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Validation result caching system.
 *
 * Provides efficient caching of validation results with content-based invalidation,
 * TTL for external links, and automatic cleanup of stale entries.
 *
 * @category Utils
 *
 * @example
 *   Basic usage
 *   ```typescript
 *   const cache = new ValidationCache();
 *   
 *   // Check for cached result
 *   const cached = await cache.get('/path/to/file.md', contentHash);
 *   if (cached) {
 *     console.log('Using cached validation result');
 *     return cached.result;
 *   }
 *   
 *   // Perform validation and cache result
 *   const result = await validateFile('/path/to/file.md');
 *   await cache.set('/path/to/file.md', contentHash, result);
 *   ```
 *
 * @example
 *   Configuration
 *   ```typescript
 *   const cache = new ValidationCache({
 *     cacheDir: '.custom-cache',
 *     externalLinksTtl: 12 * 60 * 60 * 1000, // 12 hours
 *     maxSizeBytes: 50 * 1024 * 1024, // 50MB
 *   });
 *   ```
 */
export class ValidationCache {
  private config: CacheConfig;
  private metadata: CacheMetadata | undefined;
  private hits = 0;
  private misses = 0;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Get cached validation result for a file.
   *
   * @param filePath - Path to the file
   * @param contentHash - Hash of current file content
   * @param configHash - Hash of current validation configuration
   * @param gitCommit - Current git commit hash
   * @returns Cached result if valid, undefined otherwise
   */
  async get(
    filePath: string,
    contentHash: string,
    configHash: string,
    gitCommit?: string
  ): Promise<CachedValidationResult | undefined> {
    try {
      const cacheFile = this.getCacheFilePath(filePath);
      if (!existsSync(cacheFile)) {
        this.misses++;
        return undefined;
      }

      const cached = await this.readCacheFile(cacheFile);
      if (!cached) {
        this.misses++;
        return undefined;
      }

      // Validate cache entry
      if (!this.isCacheValid(cached, contentHash, configHash, gitCommit)) {
        this.misses++;
        return undefined;
      }

      this.hits++;
      return cached;
    } catch {
      this.misses++;
      return undefined;
    }
  }

  /**
   * Store validation result in cache.
   *
   * @param filePath - Path to the file
   * @param contentHash - Hash of file content
   * @param result - Validation result to cache
   * @param configHash - Hash of validation configuration
   * @param gitCommit - Current git commit hash
   */
  async set(
    filePath: string,
    contentHash: string,
    result: ValidationResult,
    configHash: string,
    gitCommit?: string
  ): Promise<void> {
    try {
      const cacheFile = this.getCacheFilePath(filePath);
      await mkdir(dirname(cacheFile), { recursive: true });

      const cached: CachedValidationResult = {
        filePath,
        contentHash,
        gitCommit,
        timestamp: Date.now(),
        externalLinksTtl: this.config.externalLinksTtl,
        result,
        version: this.getVersion(),
        configHash,
      };

      await this.writeCacheFile(cacheFile, cached);
    } catch (error) {
      // Cache write failures should not break validation
      console.warn(`Failed to write cache for ${filePath}:`, error);
    }
  }

  /**
   * Invalidate cache entry for a file.
   *
   * @param filePath - Path to the file
   */
  async invalidate(filePath: string): Promise<void> {
    try {
      const cacheFile = this.getCacheFilePath(filePath);
      if (existsSync(cacheFile)) {
        const { unlink } = await import('node:fs/promises');
        await unlink(cacheFile);
      }
    } catch {
      // Ignore errors when invalidating
    }
  }

  /**
   * Clear entire cache.
   */
  async clear(): Promise<void> {
    try {
      if (existsSync(this.config.cacheDir)) {
        const { rm } = await import('node:fs/promises');
        await rm(this.config.cacheDir, { recursive: true, force: true });
      }
    } catch (error) {
      throw new Error(`Failed to clear cache: ${error}`);
    }
  }

  /**
   * Get cache metadata and statistics.
   *
   * @returns Cache metadata
   */
  async getMetadata(): Promise<CacheMetadata> {
    if (this.metadata) {
      return this.metadata;
    }

    try {
      let totalFiles = 0;
      let totalLinks = 0;
      let sizeBytes = 0;

      if (existsSync(this.config.cacheDir)) {
        const { readdir } = await import('node:fs/promises');
        const files = await readdir(this.config.cacheDir, { recursive: true });
        
        for (const file of files) {
          if (typeof file === 'string' && file.endsWith('.json')) {
            const filePath = join(this.config.cacheDir, file);
            try {
              const stats = await stat(filePath);
              sizeBytes += stats.size;
              
              const cached = await this.readCacheFile(filePath);
              if (cached) {
                totalFiles++;
                // Count links from validation result
                const linkCount = this.countLinksInResult(cached.result);
                totalLinks += linkCount;
              }
            } catch {
              // Skip invalid cache files
            }
          }
        }
      }

      const totalRequests = this.hits + this.misses;
      const hitRate = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;

      this.metadata = {
        totalFiles,
        totalLinks,
        hitRate: Math.round(hitRate * 10) / 10,
        sizeBytes,
        lastCleanup: 0,
        version: this.getVersion(),
      };

      return this.metadata;
    } catch (error) {
      throw new Error(`Failed to get cache metadata: ${error}`);
    }
  }

  /**
   * Perform cache cleanup - remove expired and invalid entries.
   *
   * @returns Number of entries removed
   */
  async cleanup(): Promise<number> {
    try {
      let removedCount = 0;

      if (!existsSync(this.config.cacheDir)) {
        return removedCount;
      }

      const { readdir } = await import('node:fs/promises');
      const files = await readdir(this.config.cacheDir, { recursive: true });
      
      for (const file of files) {
        if (typeof file === 'string' && file.endsWith('.json')) {
          const filePath = join(this.config.cacheDir, file);
          try {
            const cached = await this.readCacheFile(filePath);
            if (cached && this.shouldRemoveFromCache(cached)) {
              const { unlink } = await import('node:fs/promises');
              await unlink(filePath);
              removedCount++;
            }
          } catch {
            // Remove invalid cache files
            try {
              const { unlink } = await import('node:fs/promises');
              await unlink(filePath);
              removedCount++;
            } catch {
              // Ignore cleanup errors
            }
          }
        }
      }

      // Reset metadata after cleanup
      this.metadata = undefined;

      return removedCount;
    } catch (error) {
      throw new Error(`Failed to cleanup cache: ${error}`);
    }
  }

  /**
   * Check if cache is enabled and accessible.
   *
   * @returns True if cache can be used
   */
  async isEnabled(): Promise<boolean> {
    try {
      await mkdir(this.config.cacheDir, { recursive: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get cache file path for a given source file.
   *
   * @private
   */
  private getCacheFilePath(filePath: string): string {
    const hash = createHash('sha256').update(filePath).digest('hex');
    return join(this.config.cacheDir, `${hash}.json`);
  }

  /**
   * Read and parse cache file.
   *
   * @private
   */
  private async readCacheFile(cacheFile: string): Promise<CachedValidationResult | undefined> {
    try {
      const content = await readFile(cacheFile, 'utf-8');
      const parsed = JSON.parse(content) as CachedValidationResult;
      
      // Validate structure
      if (!parsed.filePath || !parsed.contentHash || !parsed.result) {
        return undefined;
      }
      
      return parsed;
    } catch {
      return undefined;
    }
  }

  /**
   * Write cache file.
   *
   * @private
   */
  private async writeCacheFile(cacheFile: string, cached: CachedValidationResult): Promise<void> {
    const content = JSON.stringify(cached, null, this.config.compression ? 0 : 2);
    await writeFile(cacheFile, content, 'utf-8');
  }

  /**
   * Check if cached result is still valid.
   *
   * @private
   */
  private isCacheValid(
    cached: CachedValidationResult,
    contentHash: string,
    configHash: string,
    gitCommit?: string
  ): boolean {
    // Check content hash
    if (cached.contentHash !== contentHash) {
      return false;
    }

    // Check configuration hash
    if (cached.configHash !== configHash) {
      return false;
    }

    // Check version compatibility
    if (cached.version !== this.getVersion()) {
      return false;
    }

    // Check external links TTL
    const now = Date.now();
    const age = now - cached.timestamp;
    if (age > cached.externalLinksTtl) {
      // Only invalid if there are external links that need re-checking
      const hasExternalLinks = this.hasExternalLinks(cached.result);
      if (hasExternalLinks) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if cache entry should be removed during cleanup.
   *
   * @private
   */
  private shouldRemoveFromCache(cached: CachedValidationResult): boolean {
    const now = Date.now();
    const age = now - cached.timestamp;
    
    // Remove if older than 7 days
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    if (age > maxAge) {
      return true;
    }

    // Remove if version mismatch
    if (cached.version !== this.getVersion()) {
      return true;
    }

    // Remove if source file no longer exists
    if (!existsSync(cached.filePath)) {
      return true;
    }

    return false;
  }

  /**
   * Check if validation result contains external links.
   *
   * @private
   */
  private hasExternalLinks(result: ValidationResult): boolean {
    // This would need to be implemented based on the actual ValidationResult structure
    // For now, assume it might have external links
    return true;
  }

  /**
   * Count links in validation result.
   *
   * @private
   */
  private countLinksInResult(result: ValidationResult): number {
    // This would need to be implemented based on the actual ValidationResult structure
    // For now, return a placeholder
    return 0;
  }

  /**
   * Get current markmv version.
   *
   * @private
   */
  private getVersion(): string {
    // This would typically read from package.json
    return '1.29.0';
  }
}

/**
 * Calculate hash of file content.
 *
 * @param filePath - Path to the file
 * @returns SHA-256 hash of file content
 *
 * @category Utils
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return createHash('sha256').update(content).digest('hex');
  } catch (error) {
    throw new Error(`Failed to calculate hash for ${filePath}: ${error}`);
  }
}

/**
 * Calculate hash of configuration object.
 *
 * @param config - Configuration object
 * @returns SHA-256 hash of configuration
 *
 * @category Utils
 */
export function calculateConfigHash(config: Record<string, unknown>): string {
  const configString = JSON.stringify(config, Object.keys(config).sort());
  return createHash('sha256').update(configString).digest('hex');
}