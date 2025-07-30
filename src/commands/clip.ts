/**
 * Web clipper command for converting web pages to markdown.
 *
 * @fileoverview Implements comprehensive web page to markdown conversion with multiple extraction strategies
 * @category Commands
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { WebClipper, type WebClipperOptions } from '../core/web-clipper.js';
import type { OperationResult } from '../types/operations.js';

/**
 * CLI-specific options for the clip command.
 *
 * @category Commands
 */
export interface ClipCliOptions {
  /** Output file path */
  output?: string;
  /** Output directory for clipped files */
  outputDir?: string;
  /** Output results in JSON format */
  json?: boolean;
  /** Process multiple URLs from a file */
  batch?: boolean;
  /** Custom selectors as comma-separated string */
  selectors?: string;
  /** Custom headers as JSON string */
  headers?: string;
  /** Cookies file path */
  cookies?: string;
  /** Don't follow redirects */
  followRedirects?: boolean;
  /** Include frontmatter */
  frontmatter?: boolean;
  // Inherit from WebClipperOptions but as individual properties
  /** Extraction strategy to use */
  strategy?: WebClipperOptions['strategy'];
  /** How to handle images */
  imageStrategy?: WebClipperOptions['imageStrategy'];
  /** Directory to save downloaded images */
  imageDir?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Custom User-Agent string */
  userAgent?: string;
  /** Maximum redirects to follow */
  maxRedirects?: number;
  /** Show detailed output */
  verbose?: boolean;
  /** Show what would be done without doing it */
  dryRun?: boolean;
}

/**
 * Result of a web clipping operation.
 *
 * @category Commands
 */
export interface ClipResult extends OperationResult {
  /** URLs that were successfully clipped */
  clippedUrls: string[];
  /** Generated markdown files */
  generatedFiles: string[];
  /** URLs that failed to clip */
  failedUrls: Array<{
    url: string;
    error: string;
  }>;
  /** Metadata extracted from pages */
  metadata: Array<{
    url: string;
    title?: string;
    author?: string;
    publishedDate?: string;
    extractionStrategy: string;
  }>;
}

/**
 * Clip web pages to markdown files.
 *
 * @param urls - URLs to clip or paths to files containing URLs
 * @param options - Clipping options
 *
 * @returns Promise resolving to clipping results
 *
 * @category Commands
 *
 * @example
 *   Basic usage
 *   ```typescript
 *   await clipCommand(['https://example.com/article'], {
 *     output: 'article.md',
 *     strategy: 'readability'
 *   });
 *   ```
 *
 * @example
 *   Batch processing
 *   ```typescript
 *   await clipCommand(['urls.txt'], {
 *     batch: true,
 *     outputDir: './clipped',
 *     downloadImages: true
 *   });
 *   ```
 */
export async function clipCommand(urls: string[], options: ClipCliOptions = {}): Promise<void> {
  try {
    // Validate input
    if (urls.length === 0) {
      console.error('💥 Error: At least one URL must be specified');
      process.exit(1);
    }

    // Parse CLI options into WebClipperOptions
    const webClipperOptions: WebClipperOptions = {};
    
    if (options.strategy) webClipperOptions.strategy = options.strategy;
    if (options.imageStrategy) webClipperOptions.imageStrategy = options.imageStrategy;
    if (options.imageDir) webClipperOptions.imageDir = options.imageDir;
    if (options.frontmatter !== undefined) webClipperOptions.includeFrontmatter = options.frontmatter;
    if (options.timeout) webClipperOptions.timeout = options.timeout;
    if (options.userAgent) webClipperOptions.userAgent = options.userAgent;
    if (options.followRedirects !== undefined) webClipperOptions.followRedirects = options.followRedirects;
    if (options.maxRedirects) webClipperOptions.maxRedirects = options.maxRedirects;
    if (options.verbose) webClipperOptions.verbose = options.verbose;
    if (options.dryRun) webClipperOptions.dryRun = options.dryRun;

    // Parse selectors if provided
    if (options.selectors) {
      webClipperOptions.selectors = options.selectors.split(',').map(s => s.trim());
    }

    // Parse headers if provided
    if (options.headers) {
      try {
        webClipperOptions.headers = JSON.parse(options.headers);
      } catch {
        console.error('💥 Error: Invalid JSON format for headers');
        process.exit(1);
      }
    }

    // Set cookies file if provided
    if (options.cookies) {
      webClipperOptions.cookiesFile = options.cookies;
    }

    // Initialize web clipper
    const clipper = new WebClipper(webClipperOptions);
    
    // Process URLs
    const result = await processUrls(urls, options, clipper);

    // Output results
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatClipResults(result, options));
    }

    // Exit with error code if there were failures
    if (result.failedUrls.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`💥 Clip command failed: ${errorMessage}`);
    process.exit(1);
  }
}

/**
 * Process URLs for clipping.
 *
 * @private
 */
async function processUrls(
  urls: string[],
  options: ClipCliOptions,
  clipper: WebClipper
): Promise<ClipResult> {
  const result: ClipResult = {
    success: true,
    modifiedFiles: [],
    createdFiles: [],
    deletedFiles: [],
    errors: [],
    warnings: [],
    changes: [],
    clippedUrls: [],
    generatedFiles: [],
    failedUrls: [],
    metadata: [],
  };

  // Determine if batch processing
  const urlsToProcess = options.batch 
    ? await loadUrlsFromFiles(urls)
    : urls.filter(url => isValidUrl(url));

  if (urlsToProcess.length === 0) {
    throw new Error('No valid URLs found to process');
  }

  // Create output directory if specified
  if (options.outputDir) {
    await mkdir(options.outputDir, { recursive: true });
  }

  // Process each URL
  for (const url of urlsToProcess) {
    try {
      if (options.verbose) {
        console.log(`🌐 Clipping: ${url}`);
      }

      // Clip the URL
      const clipResult = await clipper.clip(url);
      
      // Determine output file path
      const outputPath = determineOutputPath(url, options, clipResult.title);
      
      // Ensure output directory exists
      await mkdir(dirname(outputPath), { recursive: true });
      
      // Write markdown file
      if (!options.dryRun) {
        await writeFile(outputPath, clipResult.markdown, 'utf-8');
        result.createdFiles.push(outputPath);
      }

      // Track success
      result.clippedUrls.push(url);
      result.generatedFiles.push(outputPath);
      
      const metadata: {
        url: string;
        title?: string;
        author?: string;
        publishedDate?: string;
        extractionStrategy: string;
      } = { url, extractionStrategy: clipResult.strategy };
      
      if (clipResult.title) metadata.title = clipResult.title;
      if (clipResult.author) metadata.author = clipResult.author;
      if (clipResult.publishedDate) metadata.publishedDate = clipResult.publishedDate;
      
      result.metadata.push(metadata);

      if (options.verbose) {
        console.log(`✅ Clipped to: ${outputPath} (strategy: ${clipResult.strategy})`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.failedUrls.push({
        url,
        error: errorMessage,
      });
      result.errors.push(`Failed to clip ${url}: ${errorMessage}`);
      result.success = false;

      if (options.verbose) {
        console.error(`❌ Failed to clip ${url}: ${errorMessage}`);
      }
    }
  }

  return result;
}

/**
 * Load URLs from files for batch processing.
 *
 * @private
 */
async function loadUrlsFromFiles(filePaths: string[]): Promise<string[]> {
  const urls: string[] = [];
  
  for (const filePath of filePaths) {
    try {
      const { readFile } = await import('node:fs/promises');
      const content = await readFile(filePath, 'utf-8');
      const fileUrls = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#') && isValidUrl(line));
      
      urls.push(...fileUrls);
    } catch (error) {
      console.warn(`⚠️ Could not read URL file ${filePath}: ${error}`);
    }
  }

  return urls;
}

/**
 * Check if a string is a valid URL.
 *
 * @private
 */
function isValidUrl(string: string): boolean {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Determine output file path for a clipped URL.
 *
 * @private
 */
function determineOutputPath(url: string, options: ClipCliOptions, title?: string): string {
  // If specific output file specified
  if (options.output && !options.batch) {
    return options.output;
  }

  // Generate filename from title or URL
  let filename: string;
  if (title) {
    filename = sanitizeFilename(title) + '.md';
  } else {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname === '/' ? 'index' : basename(urlObj.pathname);
    filename = sanitizeFilename(pathname) + '.md';
  }

  // Use output directory if specified
  if (options.outputDir) {
    return join(options.outputDir, filename);
  }

  return filename;
}

/**
 * Sanitize a string for use as a filename.
 *
 * @private
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '-') // Replace invalid characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .toLowerCase()
    .substring(0, 100); // Limit length
}

/**
 * Format clipping results for display.
 *
 * @private
 */
function formatClipResults(result: ClipResult, options: ClipCliOptions): string {
  const lines: string[] = [];

  // Header
  lines.push('🕷️  Web Clipper Results');
  lines.push(''.padEnd(40, '='));

  // Summary
  lines.push(`\n📊 Summary:`);
  lines.push(`   Successfully clipped: ${result.clippedUrls.length}`);
  lines.push(`   Failed: ${result.failedUrls.length}`);
  lines.push(`   Files generated: ${result.generatedFiles.length}`);

  if (options.dryRun) {
    lines.push('\n🔍 Dry run - no files were actually created');
  }

  // Successful clips
  if (result.clippedUrls.length > 0) {
    lines.push('\n✅ Successfully Clipped:');
    lines.push(''.padEnd(30, '-'));
    
    result.metadata.forEach(meta => {
      lines.push(`\n🌐 ${meta.url}`);
      if (meta.title) {
        lines.push(`   📄 Title: ${meta.title}`);
      }
      if (meta.author) {
        lines.push(`   ✍️  Author: ${meta.author}`);
      }
      if (meta.publishedDate) {
        lines.push(`   📅 Published: ${meta.publishedDate}`);
      }
      lines.push(`   🔧 Strategy: ${meta.extractionStrategy}`);
      
      const outputFile = result.generatedFiles[result.metadata.indexOf(meta)];
      if (outputFile) {
        lines.push(`   💾 Saved to: ${outputFile}`);
      }
    });
  }

  // Failed clips
  if (result.failedUrls.length > 0) {
    lines.push('\n❌ Failed to Clip:');
    lines.push(''.padEnd(30, '-'));
    
    result.failedUrls.forEach(failed => {
      lines.push(`\n🌐 ${failed.url}`);
      lines.push(`   💥 Error: ${failed.error}`);
    });
  }

  // Warnings
  if (result.warnings.length > 0) {
    lines.push('\n⚠️  Warnings:');
    lines.push(''.padEnd(30, '-'));
    result.warnings.forEach(warning => {
      lines.push(`   ⚠️  ${warning}`);
    });
  }

  return lines.join('\n');
}