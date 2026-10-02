import { glob, type GlobOptionsWithFileTypesFalse } from "glob";
import { statSync } from "fs";
import { posix } from "path";
import { LinkValidator } from "../core/link-validator.js";
import { LinkParser } from "../core/link-parser.js";
import type { OperationOptions } from "../types/operations.js";
import type { MarkdownLink } from "../types/links.js";

/**
 * Configuration options for external link checking operations.
 *
 * Optimized specifically for external HTTP/HTTPS link validation with smart defaults for common use
 * cases.
 * @category Commands
 */
export interface CheckLinksOperationOptions extends OperationOptions {
  /** Timeout for external link validation in milliseconds (default: 10000) */
  timeout: number;
  /** Number of retry attempts for failed requests (default: 3) */
  retry: number;
  /** Delay between retry attempts in milliseconds (default: 1000) */
  retryDelay: number;
  /** Maximum concurrent requests (default: 10) */
  concurrency: number;
  /** HTTP method to use for checking links (default: 'HEAD') */
  method: "HEAD" | "GET";
  /** Follow redirects (default: true) */
  followRedirects: boolean;
  /** HTTP status codes to ignore (default: [403, 999]) */
  ignoreStatusCodes: number[];
  /** URL patterns to ignore (regex strings) */
  ignorePatterns: string[];
  /** Cache results to avoid re-checking recently validated URLs */
  useCache: boolean;
  /** Cache duration in minutes (default: 60) */
  cacheDuration: number;
  /** Show progress indicator for large operations */
  showProgress: boolean;
  /** Output format for results */
  format: "text" | "json" | "markdown" | "csv";
  /** Include response times in output */
  includeResponseTimes: boolean;
  /** Include HTTP headers in detailed output */
  includeHeaders: boolean;
  /** Maximum depth to traverse subdirectories */
  maxDepth?: number;
  /** Group results by file or by status code */
  groupBy: "file" | "status" | "domain";
}

/**
 * CLI-specific options for the check-links command.
 * @category Commands
 */
/**
 * Options as commander produces them for the check-links command: numeric options are already
 * parsed, negated flags appear as their positive boolean, and list options arrive as raw
 * comma-separated strings.
 * @category Commands
 */
export interface CheckLinksCliOptions {
  /** Show what would be checked without making requests */
  dryRun?: boolean;
  /** Show detailed output */
  verbose?: boolean;
  /** Timeout for external link validation in milliseconds */
  timeout?: number;
  /** Number of retry attempts for failed requests */
  retry?: number;
  /** Delay between retry attempts in milliseconds */
  retryDelay?: number;
  /** Maximum concurrent requests */
  concurrency?: number;
  /** HTTP method to use */
  method?: string;
  /** Follow HTTP redirects unless --no-follow-redirects is passed */
  followRedirects?: boolean;
  /** Comma-separated HTTP status codes to ignore */
  ignoreStatus?: string;
  /** Comma-separated regex patterns to ignore */
  ignorePatterns?: string;
  /** Cache results unless --no-cache is passed */
  cache?: boolean;
  /** Cache duration in minutes */
  cacheDuration?: number;
  /** Show progress unless --no-progress is passed */
  progress?: boolean;
  /** Output format */
  format?: string;
  /** Include response times in output */
  includeResponseTimes?: boolean;
  /** Include HTTP headers in detailed output */
  includeHeaders?: boolean;
  /** Maximum depth to traverse subdirectories */
  maxDepth?: number;
  /** Group results by file, status, or domain */
  groupBy?: string;
  /** Output file path for results */
  output?: string;
  /** Configuration file path */
  config?: string;
}

/**
 * External link validation result with detailed information.
 * @category Commands
 */
interface ExternalLinkResult {
  /** File containing the link */
  filePath: string;
  /** Line number where the link was found */
  line?: number;
  /** Link text */
  text: string;
  /** Link URL */
  href: string;
  /** Reason for failure (if broken) */
  reason: string;
  /** Whether the link is broken */
  isBroken: boolean;
  /** HTTP status code */
  statusCode?: number;
  /** Response time in milliseconds */
  responseTime?: number;
  /** Final URL after redirects */
  finalUrl?: string;
  /** Number of redirects followed */
  redirectCount?: number;
  /** HTTP headers (if includeHeaders is true) */
  headers?: Record<string, string>;
  /** Domain name for grouping */
  domain: string;
  /** Whether this was from cache */
  cached?: boolean;
  /** Retry attempt number (0 for first attempt) */
  retryAttempt?: number;
}

/**
 * Result of an external link checking operation.
 * @category Commands
 */
export interface CheckLinksResult {
  /** Total number of files processed */
  filesProcessed: number;
  /** Total number of external links found */
  totalExternalLinks: number;
  /** Number of broken external links */
  brokenLinks: number;
  /** Number of working external links */
  workingLinks: number;
  /** Number of links with warnings (redirects, slow response, etc.) */
  warningLinks: number;
  /** Detailed results for each link */
  linkResults: ExternalLinkResult[];
  /** Results grouped by file */
  resultsByFile: Partial<Record<string, ExternalLinkResult[]>>;
  /** Results grouped by status code */
  resultsByStatus: Partial<Record<number, ExternalLinkResult[]>>;
  /** Results grouped by domain */
  resultsByDomain: Partial<Record<string, ExternalLinkResult[]>>;
  /** Files that had processing errors */
  fileErrors: { file: string; error: string }[];
  /** Processing time in milliseconds */
  processingTime: number;
  /** Cache hit rate (percentage) */
  cacheHitRate?: number;
  /** Average response time in milliseconds */
  averageResponseTime?: number;
}

/** HTTP status that servers commonly return to automated clients (bot detection). */
const HTTP_FORBIDDEN = 403;

/** Non-standard status that LinkedIn returns to automated clients. */
const LINKEDIN_BLOCKED_STATUS = 999;

/** First status code of the redirect class. */
const HTTP_REDIRECT_START = 300;

/** First status code of the client error class, which ends the redirect class. */
const HTTP_CLIENT_ERROR_START = 400;

/** Status assumed for a link that validated without error. */
const HTTP_OK = 200;

/** Divisor-to-percentage factor. */
const PERCENT = 100;

/** Width of the rule under the main text report heading. */
const TITLE_RULE_WIDTH = 50;

/** Width of the rule under each text report section heading. */
const SECTION_RULE_WIDTH = 30;

/**
 * Whether a status code belongs to the redirect class.
 * @param statusCode - Status code, if one was observed
 */
function isRedirectStatus(statusCode: number | undefined): boolean {
  return (
    statusCode !== undefined &&
    statusCode >= HTTP_REDIRECT_START &&
    statusCode < HTTP_CLIENT_ERROR_START
  );
}

/** Default configuration for external link checking. */
const DEFAULT_CHECK_LINKS_OPTIONS: CheckLinksOperationOptions = {
  dryRun: false,
  verbose: false,
  timeout: 10000,
  retry: 3,
  retryDelay: 1000,
  concurrency: 10,
  method: "HEAD",
  followRedirects: true,
  // Common bot-detection status codes
  ignoreStatusCodes: [HTTP_FORBIDDEN, LINKEDIN_BLOCKED_STATUS],
  ignorePatterns: [],
  useCache: true,
  cacheDuration: 60,
  showProgress: true,
  format: "text",
  includeResponseTimes: false,
  includeHeaders: false,
  groupBy: "file",
};

/** Outcome of resolving one input pattern: the files it names, or the error that stopped resolution. */
type PatternResolution = { files: string[] } | { file: string; error: string };

/**
 * Expands a directory, glob pattern or file path into the markdown files it names.
 * @param filePattern - Directory, glob pattern or file path
 * @param options - Operation options supplying the traversal depth limit
 */
async function resolveFilePattern(
  filePattern: string,
  options: Readonly<CheckLinksOperationOptions>,
): Promise<PatternResolution> {
  try {
    const isDirectory = statSync(filePattern).isDirectory();

    if (!isDirectory && !filePattern.includes("*")) {
      // It's a specific file
      return { files: [filePattern] };
    }

    // A directory is searched for markdown files; anything else is already a glob pattern
    const pattern = isDirectory
      ? posix.join(filePattern, "**/*.md")
      : filePattern;
    const globOptions: GlobOptionsWithFileTypesFalse = {
      ignore: ["node_modules/**", ".git/**"],
    };
    if (options.maxDepth !== undefined) {
      globOptions.maxDepth = options.maxDepth;
    }

    return { files: await glob(pattern, globOptions) };
  } catch (error) {
    return {
      file: filePattern,
      error: `Failed to resolve file pattern: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Whether a parsed link points at an external HTTP(S) resource.
 * @param link - Link to classify
 */
function isExternalHttpLink(link: Readonly<MarkdownLink>): boolean {
  return (
    link.type === "external" ||
    (link.type === "image" &&
      (link.href.startsWith("http://") || link.href.startsWith("https://")))
  );
}

/** Findings from checking a single file. */
interface FileCheckOutcome {
  /** Number of external links that were not ignored. */
  totalExternalLinks: number;
  /** Validation outcome per checked link, in document order. */
  linkResults: ExternalLinkResult[];
  /** Links that could not be validated at all. */
  fileErrors: { file: string; error: string }[];
}

/**
 * Groups link results by a key, keeping each group in input order.
 * @param linkResults - Results to group
 * @param keyOf - Group key for a result, or undefined to leave the result out
 */
function groupLinkResults<Key extends string | number>(
  linkResults: readonly ExternalLinkResult[],
  keyOf: (linkResult: ExternalLinkResult) => Key | undefined,
): Partial<Record<Key, ExternalLinkResult[]>> {
  const groups: Partial<Record<Key, ExternalLinkResult[]>> = {};

  for (const linkResult of linkResults) {
    const key = keyOf(linkResult);
    if (key !== undefined) {
      (groups[key] ??= []).push(linkResult);
    }
  }

  return groups;
}

/**
 * Parses one file and validates each external link in it.
 * @param filePath - Markdown file to check
 * @param validator - Validator used for every link
 * @param options - Operation options
 * @returns Per-link outcomes and the links that could not be validated
 */
async function checkFile(
  filePath: string,
  validator: LinkValidator,
  options: Readonly<CheckLinksOperationOptions>,
): Promise<FileCheckOutcome> {
  const verbose = options.verbose === true;

  // Parse links from the file
  const parser = new LinkParser();
  const parseResult = await parser.parseFile(filePath);

  // Filter to only external links, then drop ignored ones
  const externalLinks = parseResult.links.filter(isExternalHttpLink);
  const filteredExternalLinks = externalLinks.filter((link) => {
    const shouldIgnore = options.ignorePatterns.some((pattern) => {
      const regex = new RegExp(pattern);

      return regex.test(link.href);
    });

    if (shouldIgnore && verbose) {
      console.log(`  ⏭️  Ignoring ${link.href} (matches ignore pattern)`);
    }

    return !shouldIgnore;
  });

  if (verbose && filteredExternalLinks.length > 0) {
    console.log(
      `\n📄 ${filePath}: found ${String(filteredExternalLinks.length)} external links (after filtering)`,
    );
  }

  const linkResults: ExternalLinkResult[] = [];
  const fileErrors: FileCheckOutcome["fileErrors"] = [];

  // Links are validated in order so that retries and delays for one link never overlap requests for the next
  for (const link of filteredExternalLinks) {
    try {
      const linkResult = await validateExternalLinkWithRetry(
        validator,
        link,
        filePath,
        options,
      );

      if (linkResult) {
        linkResults.push(linkResult);
      }
    } catch (error) {
      fileErrors.push({
        file: filePath,
        error: `Failed to validate link ${link.href}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return {
    totalExternalLinks: filteredExternalLinks.length,
    linkResults,
    fileErrors,
  };
}

/**
 * Validates external links in markdown files with optimized defaults and advanced features.
 *
 * This command is specifically designed for checking HTTP/HTTPS URLs with features like:
 *
 * - Smart retry logic for temporary failures
 * - Configurable concurrency for parallel checking
 * - Response caching to avoid re-checking recently validated URLs
 * - Multiple output formats (text, JSON, markdown, CSV)
 * - Progress indicators for large documentation sets
 * - Bot-detection handling (ignores 403s by default)
 * - Response time measurement and statistics
 * @example
 * ```typescript
 *   // Check all external links in current directory
 *   const result = await checkLinks(['.'], {
 *     ...DEFAULT_CHECK_LINKS_OPTIONS,
 *     verbose: true
 *   });
 *
 *   // Check with custom timeout and retry logic
 *   const result = await checkLinks(['docs/**\/*.md'], {
 *     ...DEFAULT_CHECK_LINKS_OPTIONS,
 *     timeout: 15000,
 *     retry: 5,
 *     retryDelay: 2000
 *   });
 * ```
 * @param files - Array of file paths or glob patterns to check
 * @param options - Configuration options for the checking operation
 * @returns Promise resolving to detailed results of the link checking operation
 */
export async function checkLinks(
  files: readonly string[],
  options: CheckLinksOperationOptions = DEFAULT_CHECK_LINKS_OPTIONS,
): Promise<CheckLinksResult> {
  const startTime = Date.now();

  if (options.verbose === true) {
    console.log("🔗 Starting external link validation...");
    console.log(`📋 Configuration:
  - Timeout: ${String(options.timeout)}ms
  - Retries: ${String(options.retry)}
  - Concurrency: ${String(options.concurrency)}
  - Method: ${options.method}
  - Cache: ${options.useCache ? "enabled" : "disabled"}
  - Ignore status codes: [${options.ignoreStatusCodes.join(", ")}]`);
  }

  // Initialize result structure
  const result: CheckLinksResult = {
    filesProcessed: 0,
    totalExternalLinks: 0,
    brokenLinks: 0,
    workingLinks: 0,
    warningLinks: 0,
    linkResults: [],
    resultsByFile: {},
    resultsByStatus: {},
    resultsByDomain: {},
    fileErrors: [],
    processingTime: 0,
    cacheHitRate: 0,
    averageResponseTime: 0,
  };

  // Resolve file patterns
  const resolvedFiles = new Set<string>();
  const resolutions = await Promise.all(
    files.map(async (filePattern) => resolveFilePattern(filePattern, options)),
  );
  for (const resolution of resolutions) {
    if ("error" in resolution) {
      result.fileErrors.push(resolution);
    } else {
      for (const file of resolution.files) {
        resolvedFiles.add(file);
      }
    }
  }

  const fileList = Array.from(resolvedFiles);
  result.filesProcessed = fileList.length;

  if (options.verbose === true) {
    console.log(
      `📁 Found ${String(fileList.length)} markdown files to process`,
    );
  }

  // Progress tracking
  let processedFiles = 0;
  const updateProgress = () => {
    if (options.showProgress && fileList.length > 1) {
      const percent = Math.round((processedFiles / fileList.length) * PERCENT);
      process.stdout.write(
        `\r🔍 Processing files: ${String(processedFiles)}/${String(fileList.length)} (${String(percent)}%)`,
      );
    }
  };

  // Initialize link validator with external-only settings
  const validator = new LinkValidator({
    checkExternal: true,
    externalTimeout: options.timeout,
    // We only care about external links
    strictInternal: false,
    checkClaudeImports: false,
  });

  const linkResults: ExternalLinkResult[] = [];

  // Files are checked one after another so that progress output stays ordered and the validator is never hit by concurrent bursts from several files at once
  for (const filePath of fileList) {
    try {
      const outcome = await checkFile(filePath, validator, options);
      result.totalExternalLinks += outcome.totalExternalLinks;
      linkResults.push(...outcome.linkResults);
      result.fileErrors.push(...outcome.fileErrors);
    } catch (error) {
      result.fileErrors.push({
        file: filePath,
        error: `Failed to process file: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    processedFiles++;
    updateProgress();
  }

  result.linkResults = linkResults;
  result.resultsByFile = groupLinkResults(linkResults, (r) => r.filePath);
  result.resultsByStatus = groupLinkResults(linkResults, (r) => r.statusCode);
  result.resultsByDomain = groupLinkResults(linkResults, (r) => r.domain);
  result.brokenLinks = linkResults.filter((r) => r.isBroken).length;
  result.warningLinks = linkResults.filter(
    (r) => !r.isBroken && isRedirectStatus(r.statusCode),
  ).length;
  result.workingLinks =
    linkResults.length - result.brokenLinks - result.warningLinks;

  if (options.showProgress && fileList.length > 1) {
    // New line after progress
    console.log("\n");
  }

  // Calculate statistics
  result.processingTime = Date.now() - startTime;

  if (result.linkResults.length > 0) {
    const responseTimes = result.linkResults
      .filter((r) => r.responseTime !== undefined)
      .map((r) => r.responseTime)
      .filter((time): time is number => time !== undefined);

    if (responseTimes.length > 0) {
      result.averageResponseTime = Math.round(
        responseTimes.reduce((sum, time) => sum + time, 0) /
          responseTimes.length,
      );
    }

    const cachedResults = result.linkResults.filter(
      (r) => r.cached === true,
    ).length;
    result.cacheHitRate = Math.round(
      (cachedResults / result.linkResults.length) * PERCENT,
    );
  }

  if (options.verbose === true) {
    console.log(`✅ Completed in ${String(result.processingTime)}ms`);
    console.log(
      `📊 Summary: ${String(result.workingLinks)} working, ${String(result.brokenLinks)} broken, ${String(result.warningLinks)} warnings`,
    );
    if ((result.averageResponseTime ?? 0) > 0) {
      console.log(
        `⚡ Average response time: ${String(result.averageResponseTime)}ms`,
      );
    }
    if (result.cacheHitRate !== undefined && result.cacheHitRate > 0) {
      console.log(`🗄️  Cache hit rate: ${String(result.cacheHitRate)}%`);
    }
  }

  return result;
}

/** Validates a single external link with retry logic and detailed error handling. */
async function validateExternalLinkWithRetry(
  validator: LinkValidator,
  link: Readonly<MarkdownLink>,
  filePath: string,
  options: CheckLinksOperationOptions,
): Promise<ExternalLinkResult | null> {
  const domain = extractDomain(link.href);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= options.retry; attempt++) {
    try {
      const startTime = Date.now();
      const validationResult = await validator.validateLink(link, filePath);
      const responseTime = Date.now() - startTime;

      if (validationResult) {
        // Convert to ExternalLinkResult
        const result: ExternalLinkResult = {
          filePath,
          line: link.line,
          text: link.text ?? "",
          href: link.href,
          reason: validationResult.reason,
          isBroken: true,
          responseTime,
          domain,
          retryAttempt: attempt,
          // TODO: Implement caching
          cached: false,
        };

        /* Extract additional details if available
           This would require extending the validator to return more details
           For now, we'll infer some information */
        const statusMatch = /HTTP (\d+)/.exec(validationResult.details ?? "");
        if (statusMatch) {
          result.statusCode = parseInt(statusMatch[1], 10);
        }

        return result;
      } else {
        // Link is valid
        return {
          filePath,
          line: link.line,
          text: link.text ?? "",
          href: link.href,
          reason: "",
          isBroken: false,
          responseTime: Date.now() - startTime,
          domain,
          retryAttempt: attempt,
          // Assume 200 if no error
          statusCode: HTTP_OK,
          cached: false,
        };
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < options.retry) {
        if (options.verbose === true) {
          console.log(
            `  ⚠️  Attempt ${String(attempt + 1)} failed for ${link.href}, retrying in ${String(options.retryDelay)}ms...`,
          );
        }
        // Retries are sequential by design: each waits for the previous failure and its delay
        await new Promise<void>((resolve) => {
          setTimeout(resolve, options.retryDelay);
        });
      }
    }
  }

  // All retries failed
  return {
    filePath,
    line: link.line,
    text: link.text ?? "",
    href: link.href,
    reason: lastError?.message ?? "Failed after all retry attempts",
    isBroken: true,
    domain,
    retryAttempt: options.retry,
    cached: false,
  };
}

/** Extracts domain name from a URL. */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);

    return urlObj.hostname;
  } catch {
    return "invalid-url";
  }
}

/** Formats the check-links results for display. */
export function formatCheckLinksResults(
  result: CheckLinksResult,
  options: CheckLinksOperationOptions,
): string {
  switch (options.format) {
    case "json":
      return JSON.stringify(result, null, 2);

    case "markdown":
      return formatAsMarkdown(result, options);

    case "csv":
      return formatAsCSV(result);

    case "text":
    default:
      return formatAsText(result, options);
  }
}

/** Formats results as human-readable text. */
function formatAsText(
  result: CheckLinksResult,
  options: CheckLinksOperationOptions,
): string {
  const lines: string[] = [];

  lines.push("🔗 External Link Check Results");
  lines.push("".padEnd(TITLE_RULE_WIDTH, "="));
  lines.push("");

  // Summary
  lines.push(`📊 Summary:`);
  lines.push(`  Files processed: ${String(result.filesProcessed)}`);
  lines.push(`  External links found: ${String(result.totalExternalLinks)}`);
  lines.push(`  Working links: ${String(result.workingLinks)}`);
  lines.push(`  Broken links: ${String(result.brokenLinks)}`);
  lines.push(`  Warning links: ${String(result.warningLinks)}`);
  lines.push(`  Processing time: ${String(result.processingTime)}ms`);

  if ((result.averageResponseTime ?? 0) > 0) {
    lines.push(
      `  Average response time: ${String(result.averageResponseTime)}ms`,
    );
  }

  if (result.cacheHitRate !== undefined && result.cacheHitRate > 0) {
    lines.push(`  Cache hit rate: ${String(result.cacheHitRate)}%`);
  }

  lines.push("");

  // Show broken links only if any exist
  if (result.brokenLinks > 0) {
    lines.push("❌ Broken Links:");
    lines.push("".padEnd(SECTION_RULE_WIDTH, "-"));

    if (options.groupBy === "file") {
      Object.entries(result.resultsByFile).forEach(([file, links]) => {
        const brokenInFile = (links ?? []).filter((l) => l.isBroken);
        if (brokenInFile.length > 0) {
          lines.push(`\n📄 ${file}:`);
          brokenInFile.forEach((link) => {
            lines.push(`  ❌ ${link.href}`);
            if (link.line !== undefined)
              lines.push(`     Line ${String(link.line)}`);
            if (link.statusCode !== undefined)
              lines.push(`     Status: ${String(link.statusCode)}`);
            if (link.reason !== "") lines.push(`     Reason: ${link.reason}`);
            if (
              options.includeResponseTimes &&
              link.responseTime !== undefined
            ) {
              lines.push(`     Response time: ${String(link.responseTime)}ms`);
            }
          });
        }
      });
    } else if (options.groupBy === "status") {
      Object.entries(result.resultsByStatus).forEach(([status, links]) => {
        const brokenLinks = (links ?? []).filter((l) => l.isBroken);
        if (brokenLinks.length > 0) {
          lines.push(`\n🔢 Status ${status}:`);
          brokenLinks.forEach((link) => {
            lines.push(`  ❌ ${link.href} (${link.filePath})`);
            if (link.reason !== "") lines.push(`     ${link.reason}`);
          });
        }
      });
    } else {
      Object.entries(result.resultsByDomain).forEach(([domain, links]) => {
        const brokenLinks = (links ?? []).filter((l) => l.isBroken);
        if (brokenLinks.length > 0) {
          lines.push(`\n🌐 ${domain}:`);
          brokenLinks.forEach((link) => {
            lines.push(`  ❌ ${link.href} (${link.filePath})`);
            if (link.statusCode !== undefined)
              lines.push(`     Status: ${String(link.statusCode)}`);
          });
        }
      });
    }
  }

  // Show warnings if any
  if (result.warningLinks > 0) {
    lines.push("\n⚠️  Warnings:");
    lines.push("".padEnd(SECTION_RULE_WIDTH, "-"));

    const warningLinks = result.linkResults.filter(
      (l) => !l.isBroken && isRedirectStatus(l.statusCode),
    );

    warningLinks.forEach((link) => {
      lines.push(`  ⚠️  ${link.href} (${link.filePath})`);
      lines.push(`     Status: ${String(link.statusCode)} (redirect)`);
      if (link.finalUrl !== undefined && link.finalUrl !== link.href) {
        lines.push(`     Final URL: ${link.finalUrl}`);
      }
    });
  }

  // Show errors if any
  if (result.fileErrors.length > 0) {
    lines.push("\n💥 Errors:");
    lines.push("".padEnd(SECTION_RULE_WIDTH, "-"));
    result.fileErrors.forEach((error) => {
      lines.push(`  💥 ${error.file}: ${error.error}`);
    });
  }

  return lines.join("\n");
}

/** Formats results as markdown. */
function formatAsMarkdown(
  result: CheckLinksResult,
  options: CheckLinksOperationOptions,
): string {
  const lines: string[] = [];

  lines.push("# 🔗 External Link Check Results");
  lines.push("");

  // Summary table
  lines.push("## 📊 Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Files processed | ${String(result.filesProcessed)} |`);
  lines.push(`| External links found | ${String(result.totalExternalLinks)} |`);
  lines.push(`| Working links | ${String(result.workingLinks)} |`);
  lines.push(`| Broken links | ${String(result.brokenLinks)} |`);
  lines.push(`| Warning links | ${String(result.warningLinks)} |`);
  lines.push(`| Processing time | ${String(result.processingTime)}ms |`);

  if ((result.averageResponseTime ?? 0) > 0) {
    lines.push(
      `| Average response time | ${String(result.averageResponseTime)}ms |`,
    );
  }

  if (result.cacheHitRate !== undefined && result.cacheHitRate > 0) {
    lines.push(`| Cache hit rate | ${String(result.cacheHitRate)}% |`);
  }

  lines.push("");

  // Broken links section
  if (result.brokenLinks > 0) {
    lines.push("## ❌ Broken Links");
    lines.push("");

    if (options.groupBy === "file") {
      Object.entries(result.resultsByFile).forEach(([file, links]) => {
        const brokenInFile = (links ?? []).filter((l) => l.isBroken);
        if (brokenInFile.length > 0) {
          lines.push(`### 📄 ${file}`);
          lines.push("");
          brokenInFile.forEach((link) => {
            lines.push(`- ❌ **${link.href}**`);
            if (link.line !== undefined)
              lines.push(`  - Line: ${String(link.line)}`);
            if (link.statusCode !== undefined)
              lines.push(`  - Status: ${String(link.statusCode)}`);
            if (link.reason !== "") lines.push(`  - Reason: ${link.reason}`);
          });
          lines.push("");
        }
      });
    }
  }

  return lines.join("\n");
}

/** Formats results as CSV. */
function formatAsCSV(result: CheckLinksResult): string {
  const lines: string[] = [];

  // CSV headers
  const headers = [
    "File",
    "URL",
    "Status",
    "Status Code",
    "Response Time",
    "Domain",
    "Line",
    "Reason",
  ];

  lines.push(headers.join(","));

  // Data rows
  result.linkResults.forEach((link) => {
    const row = [
      `"${link.filePath}"`,
      `"${link.href}"`,
      link.isBroken ? "BROKEN" : "OK",
      link.statusCode?.toString() ?? "",
      link.responseTime?.toString() ?? "",
      `"${link.domain}"`,
      link.line?.toString() ?? "",
      `"${link.reason}"`,
    ];
    lines.push(row.join(","));
  });

  return lines.join("\n");
}

function isOutputFormat(
  value: string,
): value is CheckLinksOperationOptions["format"] {
  return ["text", "json", "markdown", "csv"].some((valid) => valid === value);
}

function isGroupingMethod(
  value: string,
): value is CheckLinksOperationOptions["groupBy"] {
  return ["file", "status", "domain"].some((valid) => valid === value);
}

/** Command handler for the check-links CLI command. */
export async function checkLinksCommand(
  files: readonly string[] = ["."],
  options: Readonly<CheckLinksCliOptions>,
): Promise<void> {
  try {
    // Validate string-typed options before they enter the operation options
    const format = options.format ?? DEFAULT_CHECK_LINKS_OPTIONS.format;
    if (!isOutputFormat(format)) {
      console.error(
        `Invalid format: ${format}. Valid formats: text, json, markdown, csv`,
      );
      process.exitCode = 1;

      return;
    }

    const groupBy = options.groupBy ?? DEFAULT_CHECK_LINKS_OPTIONS.groupBy;
    if (!isGroupingMethod(groupBy)) {
      console.error(
        `Invalid grouping: ${groupBy}. Valid groupings: file, status, domain`,
      );
      process.exitCode = 1;

      return;
    }

    const method = options.method ?? DEFAULT_CHECK_LINKS_OPTIONS.method;
    if (method !== "HEAD" && method !== "GET") {
      console.error(`Invalid method: ${method}. Valid methods: HEAD, GET`);
      process.exitCode = 1;

      return;
    }

    // Parse CLI options into CheckLinksOperationOptions
    const operationOptions: CheckLinksOperationOptions = {
      dryRun: options.dryRun ?? false,
      verbose: options.verbose ?? false,
      timeout: options.timeout ?? DEFAULT_CHECK_LINKS_OPTIONS.timeout,
      retry: options.retry ?? DEFAULT_CHECK_LINKS_OPTIONS.retry,
      retryDelay: options.retryDelay ?? DEFAULT_CHECK_LINKS_OPTIONS.retryDelay,
      concurrency:
        options.concurrency ?? DEFAULT_CHECK_LINKS_OPTIONS.concurrency,
      method,
      followRedirects: options.followRedirects !== false,
      ignoreStatusCodes:
        options.ignoreStatus !== undefined && options.ignoreStatus !== ""
          ? options.ignoreStatus
              .split(",")
              .map((code) => parseInt(code.trim(), 10))
          : DEFAULT_CHECK_LINKS_OPTIONS.ignoreStatusCodes,
      ignorePatterns:
        options.ignorePatterns !== undefined && options.ignorePatterns !== ""
          ? options.ignorePatterns.split(",").map((pattern) => pattern.trim())
          : DEFAULT_CHECK_LINKS_OPTIONS.ignorePatterns,
      useCache: options.cache !== false,
      cacheDuration:
        options.cacheDuration ?? DEFAULT_CHECK_LINKS_OPTIONS.cacheDuration,
      showProgress: options.progress !== false,
      format,
      includeResponseTimes: options.includeResponseTimes ?? false,
      includeHeaders: options.includeHeaders ?? false,
      groupBy,
    };
    if (options.maxDepth !== undefined) {
      operationOptions.maxDepth = options.maxDepth;
    }

    // Show dry-run information if requested
    if (operationOptions.dryRun === true) {
      console.log("🔍 Dry run mode - no actual HTTP requests will be made");
      console.log(`📋 Configuration:
  - Files: ${files.join(", ")}
  - Timeout: ${String(operationOptions.timeout)}ms
  - Retries: ${String(operationOptions.retry)}
  - Concurrency: ${String(operationOptions.concurrency)}
  - Method: ${operationOptions.method}
  - Format: ${operationOptions.format}
  - Group by: ${operationOptions.groupBy}`);

      if (operationOptions.ignoreStatusCodes.length > 0) {
        console.log(
          `  - Ignore status codes: [${operationOptions.ignoreStatusCodes.join(", ")}]`,
        );
      }

      if (operationOptions.ignorePatterns.length > 0) {
        console.log(
          `  - Ignore patterns: [${operationOptions.ignorePatterns.join(", ")}]`,
        );
      }

      return;
    }

    // Run the check-links operation
    const result = await checkLinks(files, operationOptions);

    // Format and display results
    const formattedOutput = formatCheckLinksResults(result, operationOptions);

    if (options.output !== undefined && options.output !== "") {
      // Write to file
      const fs = await import("fs/promises");
      await fs.writeFile(options.output, formattedOutput, "utf-8");
      console.log(`📄 Results written to ${options.output}`);
    } else {
      // Print to console
      console.log(formattedOutput);
    }

    // Exit with error code if broken links found (for CI/CD integration)
    if (result.brokenLinks > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("💥 Error running check-links command:");
    console.error(error instanceof Error ? error.message : String(error));

    if (
      options.verbose === true &&
      error instanceof Error &&
      error.stack !== undefined
    ) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }

    process.exit(1);
  }
}

export { DEFAULT_CHECK_LINKS_OPTIONS };
