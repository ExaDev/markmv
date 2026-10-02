/**
 * Validation result caching system for incremental validation, caching link validation results to improve performance.
 * @category Utilities
 */

import { createHash } from "node:crypto";
import {
  readFile,
  writeFile,
  mkdir,
  stat,
  readdir,
  unlink,
  rm,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import type { BrokenLink } from "../types/config.js";

/**
 * The per-file validation outcome stored in the cache.
 * @category Utilities
 */
export interface ValidationResult {
  /** Broken links found in the file */
  brokenLinks: BrokenLink[];
  /** Total number of links checked in the file */
  totalLinks: number;
  /** Whether any of the checked links were external, which the TTL gate re-checks over time */
  hasExternalLinks: boolean;
}

/**
 * Cached validation result for a file.
 * @category Utilities
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
 * The caller-supplied fields of a cache entry stored with `ValidationCache.set`.
 * @category Utilities
 */
export type ValidationCacheSetEntry = Pick<
  CachedValidationResult,
  "filePath" | "contentHash" | "result" | "configHash"
> & {
  /** Git commit hash when validated; absent when the file is not in a git repository */
  gitCommit?: string | undefined;
};

/**
 * Cache metadata and statistics.
 * @category Utilities
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
 * @category Utilities
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
 * Narrow untrusted cache-file JSON into a CachedValidationResult. Structure beyond the marker
 * fields is not deeply validated; the content/config/version checks in isCacheValid reject stale or
 * incompatible entries.
 */
function isCachedValidationResult(
  value: unknown,
): value is CachedValidationResult {
  if (typeof value !== "object" || value === null) return false;
  if (!("filePath" in value) || typeof value.filePath !== "string")
    return false;
  if (!("contentHash" in value) || typeof value.contentHash !== "string")
    return false;
  if (
    !("result" in value) ||
    typeof value.result !== "object" ||
    value.result === null
  ) {
    return false;
  }

  return true;
}

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;
const BYTES_PER_KIBIBYTE = 1024;
const KIBIBYTES_PER_MEBIBYTE = 1024;

const MILLISECONDS_PER_DAY =
  HOURS_PER_DAY *
  MINUTES_PER_HOUR *
  SECONDS_PER_MINUTE *
  MILLISECONDS_PER_SECOND;

const BYTES_PER_MEBIBYTE = BYTES_PER_KIBIBYTE * KIBIBYTES_PER_MEBIBYTE;

/** Default maximum cache size, in mebibytes */
const DEFAULT_MAX_SIZE_MEBIBYTES = 100;

/** Entries older than this are removed during cleanup, whatever their content */
const CLEANUP_MAX_AGE_DAYS = 7;

/** Converts a fraction to a percentage */
const PERCENT = 100;

/** Hit rates are reported to one decimal place, so they are rounded at this scale */
const HIT_RATE_DECIMAL_SCALE = 10;

/** Default cache configuration. */
const DEFAULT_CACHE_CONFIG: CacheConfig = {
  cacheDir: ".markmv-cache",
  externalLinksTtl: MILLISECONDS_PER_DAY,
  maxSizeBytes: DEFAULT_MAX_SIZE_MEBIBYTES * BYTES_PER_MEBIBYTE,
  compression: true,
  cleanupInterval: MILLISECONDS_PER_DAY,
};

/**
 * Validation result caching system.
 *
 * Provides efficient caching of validation results with content-based invalidation, TTL for
 * external links, and automatic cleanup of stale entries.
 * @category Utilities
 * @example Basic usage
 * ```typescript
 *   const cache = new ValidationCache();
 *
 *   // Check for cached result
 *   const cached = await cache.get('/path/to/file.md', contentHash, configHash);
 *   if (cached) {
 *     console.log('Using cached validation result');
 *     return cached.result;
 *   }
 *
 *   // Perform validation and cache result
 *   const result = await validateFile('/path/to/file.md');
 *   await cache.set({ filePath: '/path/to/file.md', contentHash, result, configHash });
 * ```
 * @example Configuration
 * ```typescript
 *   const cache = new ValidationCache({
 *     cacheDir: '.custom-cache',
 *     externalLinksTtl: 12 * 60 * 60 * 1000, // 12 hours
 *     maxSizeBytes: 50 * 1024 * 1024, // 50MB
 *   });
 * ```
 */
export class ValidationCache {
  private readonly config: CacheConfig;

  private metadata: CacheMetadata | undefined;

  private hits = 0;

  private misses = 0;

  constructor(config: Readonly<Partial<CacheConfig>> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Get cached validation result for a file.
   * @param filePath - Path to the file
   * @param contentHash - Hash of current file content
   * @param configHash - Hash of current validation configuration
   * @returns Cached result if valid, undefined otherwise
   */
  async get(
    filePath: string,
    contentHash: string,
    configHash: string,
  ): Promise<CachedValidationResult | undefined> {
    try {
      const cacheFile = this.getCacheFilePath(filePath);
      if (!existsSync(cacheFile)) {
        this.misses++;

        return undefined;
      }

      const cached = await this.readCacheFile(cacheFile);
      if (cached === undefined) {
        this.misses++;

        return undefined;
      }

      // Validate cache entry
      if (!this.isCacheValid(cached, contentHash, configHash)) {
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
   * @param entry - The cache entry to store: the file path, the hash of its content, the validation result, the hash of the validation configuration and, when the file is in a git repository, the current commit hash
   */
  async set(entry: ValidationCacheSetEntry): Promise<void> {
    const { filePath, contentHash, result, configHash, gitCommit } = entry;
    try {
      const cacheFile = this.getCacheFilePath(filePath);
      await mkdir(dirname(cacheFile), { recursive: true });

      const cached: CachedValidationResult = {
        filePath,
        contentHash,
        timestamp: Date.now(),
        externalLinksTtl: this.config.externalLinksTtl,
        result,
        version: this.getVersion(),
        configHash,
      };
      if (gitCommit !== undefined) {
        cached.gitCommit = gitCommit;
      }

      await this.writeCacheFile(cacheFile, cached);
    } catch (error) {
      // Cache write failures should not break validation
      console.warn(`Failed to write cache for ${filePath}:`, error);
    }
  }

  /**
   * Invalidate cache entry for a file.
   * @param filePath - Path to the file
   */
  async invalidate(filePath: string): Promise<void> {
    try {
      const cacheFile = this.getCacheFilePath(filePath);
      if (existsSync(cacheFile)) {
        await unlink(cacheFile);
      }
    } catch {
      // Ignore errors when invalidating
    }
  }

  /** Clear entire cache. */
  async clear(): Promise<void> {
    try {
      if (existsSync(this.config.cacheDir)) {
        await rm(this.config.cacheDir, { recursive: true, force: true });
      }
    } catch (error) {
      throw new Error(
        `Failed to clear cache: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  /**
   * Get cache metadata and statistics.
   * @returns Cache metadata
   */
  async getMetadata(): Promise<CacheMetadata> {
    if (this.metadata !== undefined) {
      return this.metadata;
    }

    try {
      const measurements = existsSync(this.config.cacheDir)
        ? await Promise.all(
            (await this.listCacheFiles()).map(async (filePath) =>
              this.measureCacheFile(filePath),
            ),
          )
        : [];

      const totalFiles = measurements.filter(
        (measurement) => measurement?.counted === true,
      ).length;
      const totalLinks = measurements.reduce(
        (sum, measurement) => sum + (measurement?.links ?? 0),
        0,
      );
      const sizeBytes = measurements.reduce(
        (sum, measurement) => sum + (measurement?.sizeBytes ?? 0),
        0,
      );

      const totalRequests = this.hits + this.misses;
      const hitRate =
        totalRequests > 0 ? (this.hits / totalRequests) * PERCENT : 0;

      this.metadata = {
        totalFiles,
        totalLinks,
        hitRate:
          Math.round(hitRate * HIT_RATE_DECIMAL_SCALE) / HIT_RATE_DECIMAL_SCALE,
        sizeBytes,
        lastCleanup: 0,
        version: this.getVersion(),
      };

      return this.metadata;
    } catch (error) {
      throw new Error(
        `Failed to get cache metadata: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  /**
   * Perform cache cleanup - remove expired and invalid entries.
   * @returns Number of entries removed
   */
  async cleanup(): Promise<number> {
    try {
      if (!existsSync(this.config.cacheDir)) {
        return 0;
      }

      const removals = await Promise.all(
        (await this.listCacheFiles()).map(async (filePath) =>
          this.removeIfStale(filePath),
        ),
      );
      const removedCount = removals.filter((removed) => removed).length;

      // Reset metadata after cleanup
      this.metadata = undefined;

      return removedCount;
    } catch (error) {
      throw new Error(
        `Failed to cleanup cache: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  /**
   * List the cache entry files under the cache directory.
   * @private
   */
  private async listCacheFiles(): Promise<string[]> {
    const files = await readdir(this.config.cacheDir, { recursive: true });

    return files
      .filter((file) => file.endsWith(".json"))
      .map((file) => join(this.config.cacheDir, file));
  }

  /**
   * Measure one cache entry file, or return undefined when it cannot be inspected.
   * @private
   */
  private async measureCacheFile(
    filePath: string,
  ): Promise<
    { sizeBytes: number; links: number; counted: boolean } | undefined
  > {
    try {
      const stats = await stat(filePath);
      const cached = await this.readCacheFile(filePath);

      return {
        sizeBytes: stats.size,
        links:
          cached === undefined ? 0 : this.countLinksInResult(cached.result),
        counted: cached !== undefined,
      };
    } catch {
      // Skip invalid cache files
      return undefined;
    }
  }

  /**
   * Remove a cache entry file when it is stale or unreadable.
   * @returns Whether the file was removed
   * @private
   */
  private async removeIfStale(filePath: string): Promise<boolean> {
    try {
      const cached = await this.readCacheFile(filePath);
      if (cached === undefined || !this.shouldRemoveFromCache(cached)) {
        return false;
      }
      await unlink(filePath);

      return true;
    } catch {
      // Ignore cleanup errors
      return false;
    }
  }

  /**
   * Check if cache is enabled and accessible.
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
   * @private
   */
  private getCacheFilePath(filePath: string): string {
    const hash = createHash("sha256").update(filePath).digest("hex");

    return join(this.config.cacheDir, `${hash}.json`);
  }

  /**
   * Read and parse cache file.
   * @private
   */
  private async readCacheFile(
    cacheFile: string,
  ): Promise<CachedValidationResult | undefined> {
    try {
      const content = await readFile(cacheFile, "utf-8");
      const parsed: unknown = JSON.parse(content);
      if (!isCachedValidationResult(parsed)) {
        return undefined;
      }

      return parsed;
    } catch {
      return undefined;
    }
  }

  /**
   * Write cache file.
   * @private
   */
  private async writeCacheFile(
    cacheFile: string,
    cached: CachedValidationResult,
  ): Promise<void> {
    const content = JSON.stringify(
      cached,
      null,
      this.config.compression ? 0 : 2,
    );
    await writeFile(cacheFile, content, "utf-8");
  }

  /**
   * Check if cached result is still valid.
   * @private
   */
  private isCacheValid(
    cached: CachedValidationResult,
    contentHash: string,
    configHash: string,
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
   * @private
   */
  private shouldRemoveFromCache(cached: CachedValidationResult): boolean {
    const now = Date.now();
    const age = now - cached.timestamp;

    // Remove if older than 7 days
    const maxAge = CLEANUP_MAX_AGE_DAYS * MILLISECONDS_PER_DAY;
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
   * @private
   */
  private hasExternalLinks(result: ValidationResult): boolean {
    return result.hasExternalLinks;
  }

  /**
   * Count links in validation result.
   * @private
   */
  private countLinksInResult(result: ValidationResult): number {
    return result.totalLinks;
  }

  /**
   * Get current markmv version.
   * @private
   */
  private getVersion(): string {
    // This would typically read from package.json
    return "1.29.0";
  }
}

/**
 * Calculate hash of file content.
 * @category Utilities
 * @param filePath - Path to the file
 * @returns SHA-256 hash of file content
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  try {
    const content = await readFile(filePath, "utf-8");

    return createHash("sha256").update(content).digest("hex");
  } catch (error) {
    throw new Error(
      `Failed to calculate hash for ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/**
 * Calculate hash of configuration object.
 * @category Utilities
 * @param config - Configuration object
 * @returns SHA-256 hash of configuration
 */
export function calculateConfigHash(config: Record<string, unknown>): string {
  const configString = JSON.stringify(config, Object.keys(config).sort());

  return createHash("sha256").update(configString).digest("hex");
}
