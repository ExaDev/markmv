import { readFile } from "node:fs/promises";
import type { LinkParser } from "../core/link-parser.js";
import type { LinkValidator } from "../core/link-validator.js";
import type { BrokenLink } from "../types/config.js";
import {
  calculateFileHash,
  type ValidationCache,
  type ValidationResult,
} from "../utils/validation-cache.js";
import type { GitUtils } from "../utils/git-utils.js";
import type { ResolvedValidateOptions } from "./validate-setup.js";
import type { ExtendedBrokenLink, ValidateResult } from "./validate.js";

/** Extract the field names defined in a file's leading YAML frontmatter block, if any */
function parseFrontmatterFields(content: string): Set<string> {
  // CRLF files must parse identically to LF files, so both delimiters are split on
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") {
    return new Set();
  }
  const fields = new Set<string>();
  for (const line of lines.slice(1)) {
    if (line === "---") break;
    const match = /^([A-Za-z][\w-]*):/.exec(line);
    if (match) {
      fields.add(match[1] || "");
    }
  }

  return fields;
}

/** Everything one file's validation reads from or writes to */
export interface FileValidationContext {
  /** Fully defaulted validation options */
  opts: ResolvedValidateOptions;
  /** Parser shared by every file */
  parser: LinkParser;
  /** Validator shared by every file */
  validator: LinkValidator;
  /** Result cache, when caching is on and accessible */
  cache: ValidationCache | undefined;
  /** Git helper used to stamp cache entries with the current commit */
  gitUtils: GitUtils | undefined;
  /** Hash of the options that influence validation, so a changed config invalidates the cache */
  configHash: string;
  /** Result being accumulated across files */
  result: ValidateResult;
  /** Cache lookups answered and missed so far */
  cacheStats: {
    /** Lookups answered from the cache */
    hits: number;
    /** Lookups that had to validate the file */
    misses: number;
  };
}

/** Record the required frontmatter fields a file does not define */
async function checkFrontmatter(
  context: FileValidationContext,
  filePath: string,
): Promise<void> {
  const required = context.opts.requireFrontmatter;
  if (required.length === 0) {
    return;
  }
  const content = await readFile(filePath, "utf-8");
  const present = parseFrontmatterFields(content);
  const missingFields = required.filter((field) => !present.has(field));
  if (missingFields.length > 0) {
    context.result.frontmatterViolations.push({
      file: filePath,
      missingFields,
    });
  }
}

/** Record the internal links whose href form violates the enforced link format */
async function checkLinkFormat(
  context: FileValidationContext,
  filePath: string,
): Promise<void> {
  const enforced = context.opts.enforceLinkFormat;
  if (enforced === "none") {
    return;
  }
  const parsed = await context.parser.parseFile(filePath);
  for (const link of parsed.links) {
    if (link.type !== "internal" && link.type !== "image") continue;
    /* The parser records drive-absolute and UNC forms as absolute too, which a leading-slash
       string test would miss on Windows */
    const violates = enforced === "relative" ? link.absolute : !link.absolute;
    if (violates) {
      context.result.formatViolations.push({
        file: filePath,
        href: link.href,
        line: link.line,
        expected: enforced,
      });
    }
  }
}

/** Link counts and broken links for one file, from the cache or from a fresh validation */
interface FileValidation {
  /** Broken links found in the file */
  brokenLinks: BrokenLink[];
  /** Links of the validated types the file contains */
  totalLinks: number;
  /**
   * External-link count for freshness statistics; a cache hit has no link list, so the
   * fresh-external total under-counts cached files by design.
   */
  externalLinkCount: number;
}

/** Look the file up in the cache; a failing cache read degrades to a miss rather than skipping the file */
async function readFromCache(
  context: FileValidationContext,
  filePath: string,
): Promise<FileValidation | undefined> {
  const { cache, opts, configHash, cacheStats } = context;
  if (cache === undefined) {
    return undefined;
  }
  const contentHash = await calculateFileHash(filePath);
  let cached;
  try {
    cached = await cache.get(filePath, contentHash, configHash);
  } catch (error) {
    if (opts.verbose) {
      console.warn(
        `  Cache read failed for ${filePath}, validating anyway:`,
        error,
      );
    }
  }

  if (cached === undefined) {
    cacheStats.misses++;

    return undefined;
  }
  cacheStats.hits++;
  if (opts.verbose) {
    console.log(`  ✓ Used cached result`);
  }

  return {
    brokenLinks: cached.result.brokenLinks,
    totalLinks: cached.result.totalLinks,
    externalLinkCount: 0,
  };
}

/** Store a file's validation in the cache; a failing write is reported but never fails the file */
async function writeToCache(
  context: FileValidationContext,
  filePath: string,
  entry: ValidationResult,
): Promise<void> {
  const { cache, gitUtils, opts, configHash } = context;
  if (cache === undefined) {
    return;
  }
  const contentHash = await calculateFileHash(filePath);
  const gitCommit = gitUtils?.getCurrentCommit();
  try {
    await cache.set({
      filePath,
      contentHash,
      result: entry,
      configHash,
      gitCommit,
    });
  } catch (error) {
    if (opts.verbose) {
      console.warn(`  Cache write failed for ${filePath}:`, error);
    }
  }
}

/**
 * Validate one file's links, consulting the cache first.
 *
 * Returns undefined when the file has no links of the validated types.
 */
async function validateFile(
  context: FileValidationContext,
  filePath: string,
): Promise<FileValidation | undefined> {
  const cached = await readFromCache(context, filePath);
  if (cached !== undefined) {
    return cached;
  }

  const parsedFile = await context.parser.parseFile(filePath);
  const relevantLinks = parsedFile.links.filter((link) =>
    context.opts.linkTypes.includes(link.type),
  );
  const hasExternalLinks = relevantLinks.some(
    (link) => link.type === "external",
  );

  if (relevantLinks.length === 0) {
    await writeToCache(context, filePath, {
      brokenLinks: [],
      totalLinks: 0,
      hasExternalLinks: false,
    });

    return undefined;
  }

  const validation = await context.validator.validateLinks(
    relevantLinks,
    filePath,
  );
  await writeToCache(context, filePath, {
    brokenLinks: validation.brokenLinks,
    totalLinks: relevantLinks.length,
    hasExternalLinks,
  });

  return {
    brokenLinks: validation.brokenLinks,
    totalLinks: relevantLinks.length,
    externalLinkCount: relevantLinks.filter((link) => link.type === "external")
      .length,
  };
}

/** Add one file's freshness and authentication counts to the result */
function recordStatistics(
  context: FileValidationContext,
  validation: FileValidation,
): void {
  const { opts, result } = context;
  const { brokenLinks } = validation;

  if (opts.checkContentFreshness) {
    const staleLinks = brokenLinks.filter(
      (bl) => bl.reason === "content-stale",
    ).length;
    const freshExternalLinks = validation.externalLinkCount - staleLinks;

    result.staleLinks = (result.staleLinks ?? 0) + staleLinks;
    if (freshExternalLinks > 0) {
      result.freshLinks = (result.freshLinks ?? 0) + freshExternalLinks;
    }
  }

  if (opts.enableAuthDetection && brokenLinks.length > 0) {
    const authRequiredCount = brokenLinks.filter(
      (bl) => bl.reason === "auth-required",
    ).length;
    const authenticatedCount = brokenLinks.filter(
      (bl) =>
        bl.authInfo?.authAttempted === true &&
        bl.authInfo.authSucceeded === true,
    ).length;

    result.authRequiredLinks =
      (result.authRequiredLinks ?? 0) + authRequiredCount;
    result.authenticatedLinks =
      (result.authenticatedLinks ?? 0) + authenticatedCount;
  }
}

/** Add one file's broken links to the result, grouped by file and by type */
function recordBrokenLinks(
  context: FileValidationContext,
  filePath: string,
  brokenLinks: readonly BrokenLink[],
): void {
  const { opts, result } = context;
  result.brokenLinks += brokenLinks.length;

  // Convert to extended broken links with additional context
  const extendedBrokenLinks: ExtendedBrokenLink[] = brokenLinks.map(
    (brokenLink) => ({
      ...brokenLink,
      type: brokenLink.link.type,
      url: brokenLink.link.href,
      line: brokenLink.link.line,
      filePath: opts.includeContext ? filePath : undefined,
    }),
  );

  result.brokenLinksByFile[filePath] = extendedBrokenLinks;

  for (const extendedBrokenLink of extendedBrokenLinks) {
    const typeArray = (result.brokenLinksByType[extendedBrokenLink.type] ??=
      []);
    typeArray.push(extendedBrokenLink);
  }
}

/**
 * Validate one file and fold its outcome into the result.
 *
 * Returns whether the scan should stop because fail-fast is on and this file was the first to
 * produce a broken link or an error.
 */
export async function processFile(
  context: FileValidationContext,
  filePath: string,
): Promise<boolean> {
  const { opts, result } = context;
  try {
    if (opts.verbose) {
      console.log(`Validating: ${filePath}`);
    }

    /* Standards enforcement runs for every file up front, independent of caching and of whether
       the file has any links at all */
    await checkFrontmatter(context, filePath);
    await checkLinkFormat(context, filePath);

    const validation = await validateFile(context, filePath);
    result.filesProcessed++;
    if (validation === undefined) {
      return false;
    }

    result.totalLinks += validation.totalLinks;
    recordStatistics(context, validation);

    if (validation.brokenLinks.length > 0) {
      recordBrokenLinks(context, filePath, validation.brokenLinks);

      return opts.failFast;
    }

    return false;
  } catch (error) {
    result.fileErrors.push({
      file: filePath,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (opts.verbose) {
      console.error(`Error processing ${filePath}:`, error);
    }

    return opts.failFast;
  }
}
