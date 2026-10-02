/**
 * Content freshness detection utilities for external links, detecting potentially stale external content even when links are valid.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MS_PER_DAY =
  HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;
const DAYS_PER_YEAR = 365;
/** A month is approximated as thirty days, which is accurate enough for a staleness threshold. */
const DAYS_PER_MONTH = 30;
const MONTHS_IN_HALF_YEAR = 6;
const MS_PER_MONTH = DAYS_PER_MONTH * MS_PER_DAY;
const MS_PER_YEAR = DAYS_PER_YEAR * MS_PER_DAY;

const TWO_YEARS_MS = 2 * MS_PER_YEAR;
const SIX_MONTHS_MS = MONTHS_IN_HALF_YEAR * MS_PER_MONTH;

/**
 * Configuration for content freshness detection.
 * @category Types
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
 * @category Types
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

/** Cached content information. */
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

/** HTTP response information needed for freshness detection. */
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

/** Content freshness detector for external links. */

/** Narrow untrusted cache-file JSON entries into CachedContentInfo values. */
function isCachedContentInfo(value: unknown): value is CachedContentInfo {
  if (typeof value !== "object" || value === null) return false;

  return "url" in value && "contentHash" in value && "lastChecked" in value;
}

/** Type guard for a plain object (not an array, not null) parsed from JSON. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class ContentFreshnessDetector {
  private readonly config: FreshnessConfig;

  private readonly cacheFile: string;

  constructor(config: Partial<FreshnessConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      defaultThreshold: config.defaultThreshold ?? TWO_YEARS_MS,
      domainThresholds: config.domainThresholds ?? {
        "firebase.google.com": MS_PER_YEAR,
        "docs.github.com": SIX_MONTHS_MS,
        "api.github.com": SIX_MONTHS_MS,
        "developers.google.com": MS_PER_YEAR,
        "docs.aws.amazon.com": MS_PER_YEAR,
        "docs.microsoft.com": MS_PER_YEAR,
      },
      stalePatterns: config.stalePatterns ?? [
        "deprecated",
        "no longer supported",
        "this page has moved",
        "page not found",
        "content has moved",
        "redirected permanently",
        "legacy documentation",
        "archived",
        "end of life",
        "discontinued",
        "migration notice",
        "breaking changes",
        "version no longer maintained",
      ],
      cacheDir: config.cacheDir ?? ".markmv-cache",
      detectContentChanges: config.detectContentChanges ?? true,
    };

    this.cacheFile = join(this.config.cacheDir, "content-freshness.json");
  }

  /** Check if freshness detection is enabled. */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /** Analyze content freshness for a given URL response. */
  async analyzeContentFreshness(
    url: string,
    response: ResponseInfo,
  ): Promise<ContentFreshnessInfo> {
    if (!this.config.enabled) {
      return {
        url,
        isFresh: true,
        thresholdMs: 0,
        stalePatterns: [],
      };
    }

    const domain = this.extractDomain(url);
    const thresholdMs =
      this.config.domainThresholds[domain] ?? this.config.defaultThreshold;

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
        result.suggestion = "Check for newer version or updated documentation";
      }
    }

    // Detect stale patterns in content
    const detectedPatterns = this.detectStalePatterns(response.content);
    if (detectedPatterns.length > 0) {
      result.stalePatterns = detectedPatterns;
      result.isFresh = false;
      result.warning =
        result.warning ?? "Content contains staleness indicators";
      result.suggestion =
        result.suggestion ?? "Review content for updates or alternatives";
    }

    // Content change detection
    if (this.config.detectContentChanges) {
      const contentHash = this.calculateContentHash(response.content);
      result.contentHash = contentHash;

      const cached = await this.getCachedContent(url);
      if (cached && cached.contentHash !== contentHash) {
        result.previousContentHash = cached.contentHash;
        result.hasContentChanged = true;

        if (result.warning === undefined) {
          result.warning = "Content has changed since last validation";
          result.suggestion =
            "Review changes to ensure links are still relevant";
        }
      }

      // Update cache
      await this.updateCachedContent(
        url,
        contentHash,
        response.headers,
        lastModified,
      );
    }

    return result;
  }

  /** Extract domain from URL. */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  }

  /** Parse Last-Modified header. */
  private parseLastModified(
    headers: Readonly<Record<string, string>>,
  ): Date | undefined {
    const lastModified = headers["last-modified"] || headers["Last-Modified"];
    if (!lastModified) {
      return undefined;
    }

    try {
      return new Date(lastModified);
    } catch {
      return undefined;
    }
  }

  /** Detect stale patterns in content. */
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

  /** Calculate content hash for change detection. */
  private calculateContentHash(content: string): string {
    // Normalise content to reduce false positives: collapse whitespace, then strip HTML comments, scripts and styles, then replace dates and times with placeholders.
    const normalized = content
      .replace(/\s+/g, " ")
      .replace(/<!--.*?-->/gs, "")
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/\d{4}-\d{2}-\d{2}/g, "DATE")
      .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, "TIME")
      .trim();

    return createHash("sha256").update(normalized, "utf8").digest("hex");
  }

  /** Format age in human-readable format. */
  private formatAge(ageMs: number): string {
    const years = Math.floor(ageMs / MS_PER_YEAR);
    const months = Math.floor((ageMs % MS_PER_YEAR) / MS_PER_MONTH);
    const days = Math.floor((ageMs % MS_PER_MONTH) / MS_PER_DAY);

    if (years > 0) {
      return months > 0
        ? `${String(years)} year${years > 1 ? "s" : ""}, ${String(months)} month${months > 1 ? "s" : ""}`
        : `${String(years)} year${years > 1 ? "s" : ""}`;
    }
    if (months > 0) {
      return days > 0
        ? `${String(months)} month${months > 1 ? "s" : ""}, ${String(days)} day${days > 1 ? "s" : ""}`
        : `${String(months)} month${months > 1 ? "s" : ""}`;
    }

    return `${String(days)} day${days > 1 ? "s" : ""}`;
  }

  /** Get cached content information. */
  private async getCachedContent(
    url: string,
  ): Promise<CachedContentInfo | undefined> {
    try {
      if (!existsSync(this.cacheFile)) {
        return undefined;
      }

      const cacheData: unknown = JSON.parse(
        await readFile(this.cacheFile, "utf8"),
      );
      if (!isPlainRecord(cacheData) || !(url in cacheData)) {
        return undefined;
      }

      const entry = cacheData[url];

      return isCachedContentInfo(entry) ? entry : undefined;
    } catch {
      return undefined;
    }
  }

  /** Read every well-formed entry from the cache file, treating a missing or invalid file as empty. */
  private async readValidEntries(): Promise<Record<string, CachedContentInfo>> {
    const entries: Record<string, CachedContentInfo> = {};

    if (!existsSync(this.cacheFile)) {
      return entries;
    }

    try {
      const parsed: unknown = JSON.parse(
        await readFile(this.cacheFile, "utf8"),
      );
      if (!isPlainRecord(parsed)) {
        return entries;
      }

      for (const [key, value] of Object.entries(parsed)) {
        if (isCachedContentInfo(value)) {
          entries[key] = value;
        }
      }
    } catch {
      // Invalid cache file, start fresh
    }

    return entries;
  }

  /** Update cached content information. */
  private async updateCachedContent(
    url: string,
    contentHash: string,
    headers: Readonly<Record<string, string>>,
    lastModified?: Date,
  ): Promise<void> {
    try {
      // Ensure cache directory exists
      await mkdir(dirname(this.cacheFile), { recursive: true });

      const cacheData = await this.readValidEntries();

      cacheData[url] = {
        url,
        contentHash,
        lastChecked: Date.now(),
        ...(lastModified && { lastModified: lastModified.getTime() }),
        headers: {
          "last-modified":
            headers["last-modified"] || headers["Last-Modified"] || "",
          etag: headers.etag || headers.ETag || "",
          "cache-control":
            headers["cache-control"] || headers["Cache-Control"] || "",
        },
      };

      await writeFile(
        this.cacheFile,
        JSON.stringify(cacheData, null, 2),
        "utf8",
      );
    } catch (error) {
      // Fail silently for cache updates
      if (process.env.NODE_ENV !== "test") {
        console.warn(
          `Warning: Failed to update content freshness cache: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /** Clear the content freshness cache. */
  async clearCache(): Promise<void> {
    try {
      if (existsSync(this.cacheFile)) {
        await writeFile(this.cacheFile, "{}", "utf8");
      }
    } catch (error) {
      throw new Error(
        `Failed to clear content freshness cache: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  /** Get cache statistics. */
  async getCacheStats(): Promise<{
    totalEntries: number;
    oldestEntry?: Date;
    newestEntry?: Date;
  }> {
    try {
      if (!existsSync(this.cacheFile)) {
        return { totalEntries: 0 };
      }

      const cacheData: unknown = JSON.parse(
        await readFile(this.cacheFile, "utf8"),
      );
      if (typeof cacheData !== "object" || cacheData === null) {
        return { totalEntries: 0 };
      }
      const entries = Object.values(cacheData).filter(isCachedContentInfo);

      if (entries.length === 0) {
        return { totalEntries: 0 };
      }

      const timestamps = entries.map((entry) => entry.lastChecked);

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

/** Default freshness configuration. */
export const DEFAULT_FRESHNESS_CONFIG: FreshnessConfig = {
  enabled: true,
  defaultThreshold: TWO_YEARS_MS,
  domainThresholds: {
    "firebase.google.com": MS_PER_YEAR,
    "docs.github.com": SIX_MONTHS_MS,
    "api.github.com": SIX_MONTHS_MS,
    "developers.google.com": MS_PER_YEAR,
    "docs.aws.amazon.com": MS_PER_YEAR,
    "docs.microsoft.com": MS_PER_YEAR,
  },
  stalePatterns: [
    "deprecated",
    "no longer supported",
    "this page has moved",
    "page not found",
    "content has moved",
    "redirected permanently",
    "legacy documentation",
    "archived",
    "end of life",
    "discontinued",
    "migration notice",
    "breaking changes",
    "version no longer maintained",
  ],
  cacheDir: ".markmv-cache",
  detectContentChanges: true,
};
