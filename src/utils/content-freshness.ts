/**
 * Content freshness detection utilities for external links.
 *
 * @fileoverview Detects potentially stale external content even when links are valid
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Configuration for content freshness detection.
 */
export interface FreshnessConfig {
  /** Enable freshness detection */
  enabled: boolean;
  /** Default staleness threshold in milliseconds */
  defaultThreshold: number;
  /** Domain-specific thresholds */
  domainThresholds: Record<string, number>;
  /** Patterns that indicate stale or moved content */
  stalePatterns: string[];
  /** Cache directory for content tracking */
  cacheDir: string;
  /** Whether to perform content change detection */
  detectContentChanges: boolean;
}

/**
 * Information about content freshness.
 */
export interface ContentFreshnessInfo {
  /** URL being checked */
  url: string;
  /** Whether content is considered fresh */
  isFresh: boolean;
  /** Last modified date if available */
  lastModified?: Date;
  /** Age of content in milliseconds */
  ageMs?: number;
  /** Staleness threshold that was applied */
  thresholdMs: number;
  /** Detected stale patterns in content */
  stalePatterns: string[];
  /** Content hash for change detection */
  contentHash?: string;
  /** Previous content hash if available */
  previousContentHash?: string;
  /** Whether content has significantly changed */
  hasContentChanged?: boolean;
  /** Warning message if content appears stale */
  warning?: string;
  /** Suggestion for addressing staleness */
  suggestion?: string;
}

/**
 * Cached content information.
 */
interface CachedContentInfo {
  /** URL */
  url: string;
  /** Content hash */
  contentHash: string;
  /** Last check timestamp */
  lastChecked: number;
  /** Last modified date if available */
  lastModified?: number;
  /** Response headers */
  headers?: Record<string, string>;
}

/**
 * HTTP response information needed for freshness detection.
 */
export interface ResponseInfo {
  /** Response status code */
  status: number;
  /** Response headers */
  headers: Record<string, string>;
  /** Response body content */
  content: string;
  /** Final URL after redirects */
  finalUrl: string;
}

/**
 * Content freshness detector for external links.
 */
export class ContentFreshnessDetector {
  private config: FreshnessConfig;
  private cacheFile: string;

  constructor(config: Partial<FreshnessConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      defaultThreshold: config.defaultThreshold ?? 2 * 365 * 24 * 60 * 60 * 1000, // 2 years
      domainThresholds: config.domainThresholds ?? {
        'firebase.google.com': 1 * 365 * 24 * 60 * 60 * 1000, // 1 year
        'docs.github.com': 6 * 30 * 24 * 60 * 60 * 1000, // 6 months
        'api.github.com': 6 * 30 * 24 * 60 * 60 * 1000, // 6 months
        'developers.google.com': 1 * 365 * 24 * 60 * 60 * 1000, // 1 year
        'docs.aws.amazon.com': 1 * 365 * 24 * 60 * 60 * 1000, // 1 year
        'docs.microsoft.com': 1 * 365 * 24 * 60 * 60 * 1000, // 1 year
      },
      stalePatterns: config.stalePatterns ?? [
        'deprecated',
        'no longer supported',
        'this page has moved',
        'page not found',
        'content has moved',
        'redirected permanently',
        'legacy documentation',
        'archived',
        'end of life',
        'discontinued',
        'migration notice',
        'breaking changes',
        'version no longer maintained',
      ],
      cacheDir: config.cacheDir ?? '.markmv-cache',
      detectContentChanges: config.detectContentChanges ?? true,
    };

    this.cacheFile = join(this.config.cacheDir, 'content-freshness.json');
  }

  /**
   * Check if freshness detection is enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Analyze content freshness for a given URL response.
   */
  async analyzeContentFreshness(url: string, response: ResponseInfo): Promise<ContentFreshnessInfo> {
    if (!this.config.enabled) {
      return {
        url,
        isFresh: true,
        thresholdMs: 0,
        stalePatterns: [],
      };
    }

    const domain = this.extractDomain(url);
    const thresholdMs = this.config.domainThresholds[domain] ?? this.config.defaultThreshold;
    
    // Initialize result
    const result: ContentFreshnessInfo = {
      url,
      isFresh: true,
      thresholdMs,
      stalePatterns: [],
    };

    // Check last-modified header
    const lastModified = this.parseLastModified(response.headers);
    if (lastModified) {
      result.lastModified = lastModified;
      result.ageMs = Date.now() - lastModified.getTime();
      
      if (result.ageMs > thresholdMs) {
        result.isFresh = false;
        result.warning = `Content is ${this.formatAge(result.ageMs)} old`;
        result.suggestion = 'Check for newer version or updated documentation';
      }
    }

    // Detect stale patterns in content
    const detectedPatterns = this.detectStalePatterns(response.content);
    if (detectedPatterns.length > 0) {
      result.stalePatterns = detectedPatterns;
      result.isFresh = false;
      result.warning = result.warning || 'Content contains staleness indicators';
      result.suggestion = result.suggestion || 'Review content for updates or alternatives';
    }

    // Content change detection
    if (this.config.detectContentChanges) {
      const contentHash = this.calculateContentHash(response.content);
      result.contentHash = contentHash;

      const cached = await this.getCachedContent(url);
      if (cached && cached.contentHash !== contentHash) {
        result.previousContentHash = cached.contentHash;
        result.hasContentChanged = true;
        
        if (!result.warning) {
          result.warning = 'Content has changed since last validation';
          result.suggestion = 'Review changes to ensure links are still relevant';
        }
      }

      // Update cache
      await this.updateCachedContent(url, contentHash, response.headers, lastModified);
    }

    return result;
  }

  /**
   * Extract domain from URL.
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  /**
   * Parse Last-Modified header.
   */
  private parseLastModified(headers: Record<string, string>): Date | undefined {
    const lastModified = headers['last-modified'] || headers['Last-Modified'];
    if (!lastModified) {
      return undefined;
    }

    try {
      return new Date(lastModified);
    } catch {
      return undefined;
    }
  }

  /**
   * Detect stale patterns in content.
   */
  private detectStalePatterns(content: string): string[] {
    const lowerContent = content.toLowerCase();
    const detected: string[] = [];

    for (const pattern of this.config.stalePatterns) {
      if (lowerContent.includes(pattern.toLowerCase())) {
        detected.push(pattern);
      }
    }

    return detected;
  }

  /**
   * Calculate content hash for change detection.
   */
  private calculateContentHash(content: string): string {
    // Normalize content to reduce false positives
    const normalized = content
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/<!--.*?-->/gs, '') // Remove HTML comments
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '') // Remove styles
      .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE') // Replace dates
      .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, 'TIME') // Replace times
      .trim();

    return createHash('sha256').update(normalized, 'utf8').digest('hex');
  }

  /**
   * Format age in human-readable format.
   */
  private formatAge(ageMs: number): string {
    const years = Math.floor(ageMs / (365 * 24 * 60 * 60 * 1000));
    const months = Math.floor((ageMs % (365 * 24 * 60 * 60 * 1000)) / (30 * 24 * 60 * 60 * 1000));
    const days = Math.floor((ageMs % (30 * 24 * 60 * 60 * 1000)) / (24 * 60 * 60 * 1000));

    if (years > 0) {
      return months > 0 ? `${years} year${years > 1 ? 's' : ''}, ${months} month${months > 1 ? 's' : ''}` : `${years} year${years > 1 ? 's' : ''}`;
    }
    if (months > 0) {
      return days > 0 ? `${months} month${months > 1 ? 's' : ''}, ${days} day${days > 1 ? 's' : ''}` : `${months} month${months > 1 ? 's' : ''}`;
    }
    return `${days} day${days > 1 ? 's' : ''}`;
  }

  /**
   * Get cached content information.
   */
  private async getCachedContent(url: string): Promise<CachedContentInfo | undefined> {
    try {
      if (!existsSync(this.cacheFile)) {
        return undefined;
      }

      const cacheData = JSON.parse(await readFile(this.cacheFile, 'utf8'));
      return cacheData[url];
    } catch {
      return undefined;
    }
  }

  /**
   * Update cached content information.
   */
  private async updateCachedContent(
    url: string,
    contentHash: string,
    headers: Record<string, string>,
    lastModified?: Date
  ): Promise<void> {
    try {
      // Ensure cache directory exists
      await mkdir(dirname(this.cacheFile), { recursive: true });

      let cacheData: Record<string, CachedContentInfo> = {};
      
      if (existsSync(this.cacheFile)) {
        try {
          cacheData = JSON.parse(await readFile(this.cacheFile, 'utf8'));
        } catch {
          // Invalid cache file, start fresh
        }
      }

      cacheData[url] = {
        url,
        contentHash,
        lastChecked: Date.now(),
        ...(lastModified && { lastModified: lastModified.getTime() }),
        headers: {
          'last-modified': headers['last-modified'] || headers['Last-Modified'] || '',
          'etag': headers['etag'] || headers['ETag'] || '',
          'cache-control': headers['cache-control'] || headers['Cache-Control'] || '',
        },
      };

      await writeFile(this.cacheFile, JSON.stringify(cacheData, null, 2), 'utf8');
    } catch (error) {
      // Fail silently for cache updates
      if (process.env.NODE_ENV !== 'test') {
        console.warn(`Warning: Failed to update content freshness cache: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Clear the content freshness cache.
   */
  async clearCache(): Promise<void> {
    try {
      if (existsSync(this.cacheFile)) {
        await writeFile(this.cacheFile, '{}', 'utf8');
      }
    } catch (error) {
      throw new Error(`Failed to clear content freshness cache: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get cache statistics.
   */
  async getCacheStats(): Promise<{ totalEntries: number; oldestEntry?: Date; newestEntry?: Date }> {
    try {
      if (!existsSync(this.cacheFile)) {
        return { totalEntries: 0 };
      }

      const cacheData = JSON.parse(await readFile(this.cacheFile, 'utf8'));
      const entries = Object.values(cacheData) as CachedContentInfo[];
      
      if (entries.length === 0) {
        return { totalEntries: 0 };
      }

      const timestamps = entries.map(entry => entry.lastChecked);
      return {
        totalEntries: entries.length,
        oldestEntry: new Date(Math.min(...timestamps)),
        newestEntry: new Date(Math.max(...timestamps)),
      };
    } catch {
      return { totalEntries: 0 };
    }
  }
}

/**
 * Default freshness configuration.
 */
export const DEFAULT_FRESHNESS_CONFIG: FreshnessConfig = {
  enabled: true,
  defaultThreshold: 2 * 365 * 24 * 60 * 60 * 1000, // 2 years
  domainThresholds: {
    'firebase.google.com': 1 * 365 * 24 * 60 * 60 * 1000, // 1 year
    'docs.github.com': 6 * 30 * 24 * 60 * 60 * 1000, // 6 months
    'api.github.com': 6 * 30 * 24 * 60 * 60 * 1000, // 6 months
    'developers.google.com': 1 * 365 * 24 * 60 * 60 * 1000, // 1 year
    'docs.aws.amazon.com': 1 * 365 * 24 * 60 * 60 * 1000, // 1 year
    'docs.microsoft.com': 1 * 365 * 24 * 60 * 60 * 1000, // 1 year
  },
  stalePatterns: [
    'deprecated',
    'no longer supported',
    'this page has moved',
    'page not found',
    'content has moved',
    'redirected permanently',
    'legacy documentation',
    'archived',
    'end of life',
    'discontinued',
    'migration notice',
    'breaking changes',
    'version no longer maintained',
  ],
  cacheDir: '.markmv-cache',
  detectContentChanges: true,
};