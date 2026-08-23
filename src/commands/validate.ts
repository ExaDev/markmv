import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'glob';
import { statSync } from 'fs';
import { dirname, posix, resolve, sep } from 'path';
import { LinkValidator } from '../core/link-validator.js';
import { LinkParser } from '../core/link-parser.js';
import { createWikilinkResolver } from '../core/obsidian-vault.js';
import { suggestLinkFixes, type LinkSuggestion } from '../core/link-suggester.js';
import { FileUtils } from '../utils/file-utils.js';
import { PathUtils } from '../utils/path-utils.js';
import { GitUtils } from '../utils/git-utils.js';
import {
  ValidationCache,
  calculateFileHash,
  calculateConfigHash,
} from '../utils/validation-cache.js';
import type { LinkType } from '../types/links.js';
import type { BrokenLink } from '../types/config.js';
import type { OperationOptions } from '../types/operations.js';

/** Link types only validated in obsidian mode, where wikilinks resolve vault-wide */
const OBSIDIAN_LINK_TYPES: LinkType[] = ['wikilink', 'obsidian-transclusion'];

/**
 * Configuration options for link validation operations.
 *
 * Controls how broken link detection is performed across markdown files.
 *
 * @category Commands
 */
export interface ValidateOperationOptions extends OperationOptions {
  /** Types of links to validate (default: all types) */
  linkTypes?: LinkType[];
  /** Enable external HTTP/HTTPS link validation */
  checkExternal: boolean;
  /** Timeout for external link validation in milliseconds */
  externalTimeout: number;
  /** Treat missing internal files as errors */
  strictInternal: boolean;
  /** Validate Claude import paths */
  checkClaudeImports: boolean;
  /** Check for circular references in file dependencies */
  checkCircular: boolean;
  /** Maximum depth to traverse subdirectories when using glob patterns */
  maxDepth?: number | undefined;
  /** Show only broken links, not all validation results */
  onlyBroken: boolean;
  /** Group results by file or by link type */
  groupBy: 'file' | 'type';
  /** Include line numbers and context in output */
  includeContext: boolean;
  /** Git diff range for incremental validation */
  gitDiff?: string;
  /** Only validate staged files */
  gitStaged?: boolean;
  /** Enable validation result caching */
  cache?: boolean;
  /** Cache directory path */
  cacheDir?: string;
  /** Exit on first broken link found */
  failFast?: boolean;
  /** Include dependency tracking for changed files */
  includeDependencies?: boolean;
  /** Enable content freshness detection for external links */
  checkContentFreshness?: boolean;
  /** Default staleness threshold in days */
  freshnessThreshold?: number;
  /** Enable authentication-aware link validation */
  enableAuthDetection?: boolean;
  /** Treat auth-required links as valid (not broken) */
  allowAuthRequired?: boolean;
  /** API keys/credentials for authenticated requests */
  authCredentials?: Record<string, string>;
  /** Custom headers for specific domains */
  authHeaders?: Record<string, Record<string, string>>;
  /** Validate Obsidian wikilinks by resolving them against the whole vault */
  obsidian?: boolean;
  /** External-link hostnames excluded from checking entirely (comma-separated on the CLI) */
  skipDomains?: string[];
  /** Extra attempts for transient external failures (network errors, 5xx, 429) */
  externalRetries?: number;
  /** Frontmatter fields every validated file must define */
  requireFrontmatter?: string[];
  /** Internal-link href form to enforce: relative (no leading /), absolute (leading /), or none */
  enforceLinkFormat?: 'relative' | 'absolute' | 'none';
}

/**
 * CLI-specific options for the validate command.
 *
 * @category Commands
 */
export interface ValidateCliOptions extends Omit<ValidateOperationOptions, 'linkTypes'> {
  /** Comma-separated list of link types to validate */
  linkTypes?: string;
  /** Output results in JSON format */
  json?: boolean;
  /** Print the recorded parse-failure stack for the named file */
  explain?: string;
  /** Suggest and apply fixes for broken internal links */
  fix?: boolean;
}

/**
 * Extended broken link interface with additional validation context.
 *
 * @category Commands
 */
export interface ExtendedBrokenLink extends BrokenLink {
  /** Link type for grouping */
  type: LinkType;
  /** Link URL for display */
  url: string;
  /** Line number where the link was found */
  line?: number;
  /** File path (for context when grouping by type) */
  filePath?: string | undefined;
}

/**
 * Result of a validation operation containing all broken links found.
 *
 * @category Commands
 */
export interface ValidateResult {
  /** Total number of files processed */
  filesProcessed: number;
  /** Total number of links found */
  totalLinks: number;
  /** Total number of broken links found */
  brokenLinks: number;
  /** Broken links grouped by file */
  brokenLinksByFile: Record<string, ExtendedBrokenLink[]>;
  /** Broken links grouped by type */
  brokenLinksByType: Partial<Record<LinkType, ExtendedBrokenLink[]>>;
  /** Files that had processing errors */
  fileErrors: Array<{ file: string; error: string; stack?: string | undefined }>;
  /** Whether circular references were detected */
  hasCircularReferences: boolean;
  /** Circular reference details if found */
  circularReferences?: string[];
  /** Processing time in milliseconds */
  processingTime: number;
  /** Git integration information */
  gitInfo?: {
    /** Whether git integration was used */
    enabled: boolean;
    /** Files changed according to git */
    changedFiles: number;
    /** Files cached from previous validation */
    cachedFiles: number;
    /** Cache hit rate percentage */
    cacheHitRate: number;
    /** Base reference used for git diff */
    baseRef?: string;
    /** Current git commit */
    currentCommit?: string;
  };
  /** Number of stale links found */
  staleLinks?: number;
  /** Number of fresh links found */
  freshLinks?: number;
  /** Number of auth-required links found */
  authRequiredLinks?: number;
  /** Number of successfully authenticated links */
  authenticatedLinks?: number;
  /** Files missing required frontmatter fields */
  frontmatterViolations: Array<{ file: string; missingFields: string[] }>;
  /** Internal links whose href form violates the enforced link format */
  formatViolations: Array<{ file: string; href: string; line: number; expected: string }>;
}

/** Extract the field names defined in a file's leading YAML frontmatter block, if any */
function parseFrontmatterFields(content: string): Set<string> {
  // CRLF files must parse identically to LF files, so both delimiters are split on
  const lines = content.split(/\r?\n/);
  if (lines[0] !== '---') {
    return new Set();
  }
  const fields = new Set<string>();
  for (const line of lines.slice(1)) {
    if (line === '---') break;
    const match = line.match(/^([A-Za-z][\w-]*):/);
    if (match) {
      fields.add(match[1] || '');
    }
  }
  return fields;
}

/**
 * A broken internal link with ranked replacement candidates, ready to prompt about.
 *
 * @category Commands
 */
export interface PlannedLinkFix {
  /** File containing the broken link */
  sourceFile: string;
  /** One-based line number of the link */
  line: number;
  /** The broken link target as written */
  brokenHref: string;
  /** Replacement candidates, best first */
  suggestions: LinkSuggestion[];
}

/**
 * Asks the user which suggestion to apply for one broken link.
 *
 * Returns the chosen zero-based suggestion index, or undefined to skip. Injectable so tests and
 * non-interactive callers can drive fix mode without a terminal.
 *
 * @category Commands
 */
export type FixPrompter = (fix: PlannedLinkFix) => Promise<number | undefined>;

/**
 * Plan fixes for the broken internal links in a validation result.
 *
 * Only internal file-not-found links are fixable this way -- an external or anchor failure has no
 * file to suggest. Broken links whose target resembles nothing known are left out rather than given
 * a wild guess.
 *
 * @param result - A completed validation result
 * @param knownFiles - Absolute paths of every candidate file in the project
 *
 * @returns One planned fix per broken internal link that has suggestions
 */
export function planLinkFixes(result: ValidateResult, knownFiles: string[]): PlannedLinkFix[] {
  const fixes: PlannedLinkFix[] = [];
  for (const [filePath, brokenLinks] of Object.entries(result.brokenLinksByFile)) {
    for (const broken of brokenLinks) {
      if (broken.type !== 'internal' || broken.reason !== 'file-not-found') continue;
      const suggestions = suggestLinkFixes(broken.url, filePath, knownFiles);
      if (suggestions.length === 0) continue;
      fixes.push({
        sourceFile: filePath,
        line: broken.line ?? 1,
        brokenHref: broken.url,
        suggestions,
      });
    }
  }
  return fixes;
}

/**
 * Apply one chosen suggestion to the linking file.
 *
 * Rewrites the markdown link form ](broken-href to ](replacement on the recorded line. A missing
 * line or a link text that no longer matches throws -- applying a fix to a file that changed under
 * the validator would silently corrupt the wrong span.
 *
 * @param fix - The planned fix being accepted
 * @param choiceIndex - Zero-based index into fix.suggestions
 */
export async function applyLinkFix(fix: PlannedLinkFix, choiceIndex: number): Promise<void> {
  const suggestion = fix.suggestions[choiceIndex];
  if (!suggestion) {
    throw new Error(`No suggestion ${choiceIndex} for ${fix.brokenHref} in ${fix.sourceFile}`);
  }
  // An anchored target keeps its anchor on the replacement; the anchor sits after the path
  const [pathPart, ...fragmentParts] = fix.brokenHref.split('#');
  const fragment = fragmentParts.length > 0 ? `#${fragmentParts.join('#')}` : '';
  const brokenSpan = `](${pathPart}`;

  const content = await readFile(fix.sourceFile, 'utf-8');
  const lines = content.split('\n');
  const lineIndex = fix.line - 1;
  const target = lines[lineIndex];
  if (target === undefined) {
    throw new Error(`Line ${fix.line} not found in ${fix.sourceFile}`);
  }
  if (!target.includes(brokenSpan)) {
    throw new Error(`Link ${fix.brokenHref} not found on line ${fix.line} of ${fix.sourceFile}`);
  }
  lines[lineIndex] = target.replace(brokenSpan, `](${suggestion.replacementHref}${fragment}`);
  await writeFile(fix.sourceFile, lines.join('\n'));
}

/** Prompt on the terminal for which suggestion to apply, returning a zero-based index or skip */
async function promptFixChoice(fix: PlannedLinkFix): Promise<number | undefined> {
  const { createInterface } = await import('node:readline/promises');
  const readlineInterface = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`\n🔧 ${fix.sourceFile}:${fix.line} broken link ${fix.brokenHref}`);
    fix.suggestions.forEach((suggestion, index) => {
      console.log(`  ${index + 1}. ${suggestion.replacementHref} (${suggestion.reason})`);
    });
    console.log('  s. skip');
    const answer = await readlineInterface.question('Choice [1-s]: ');
    const trimmed = answer.trim().toLowerCase();
    if (trimmed === '' || trimmed === 's') {
      return undefined;
    }
    const index = Number.parseInt(trimmed, 10) - 1;
    if (Number.isNaN(index) || index < 0 || index >= fix.suggestions.length) {
      return undefined;
    }
    return index;
  } finally {
    readlineInterface.close();
  }
}

/** Collect every markdown file matching the validation patterns as fix candidates */
async function scanKnownFiles(patterns: string[]): Promise<string[]> {
  const matched: string[] = [];
  for (const pattern of patterns) {
    const normalizedPattern = pattern.replace(/\\/g, '/');
    const matches = await glob(normalizedPattern, {
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
    });
    matched.push(...matches.filter((filePath) => filePath.endsWith('.md')));
  }
  if (matched.length === 0) {
    return [];
  }
  let scanRoot = PathUtils.findCommonBase(matched);
  if (scanRoot === sep || /^[A-Za-z]:$/.test(scanRoot)) {
    // Disjoint matched trees would anchor the scan at a filesystem root and walk the disk
    scanRoot = dirname(matched[0] || '');
  }
  if (!scanRoot) {
    return matched;
  }
  const scanned = await FileUtils.findMarkdownFiles(scanRoot, true);
  return scanned.length > 0 ? scanned : matched;
}

/**
 * Validates markdown files for broken links of all types.
 *
 * Searches through markdown files to find broken internal links, external HTTP/HTTPS links, missing
 * images, invalid anchors, and other link integrity issues.
 *
 * @example
 *   Basic validation
 *   ```typescript
 *   const result = await validateLinks(['**\/*.md'], {
 *   checkExternal: true,
 *   onlyBroken: true
 *   });
 *
 *   console.log('Found ' + result.brokenLinks + ' broken links in ' + result.filesProcessed + ' files');
 *   ```
 *
 * @example
 *   Validate specific link types only
 *   ```typescript
 *   const result = await validateLinks(['docs\/*.md'], {
 *   linkTypes: ['internal', 'image'],
 *   strictInternal: true,
 *   includeContext: true
 *   });
 *   ```
 *
 * @param patterns - File patterns to validate (supports globs)
 * @param options - Validation configuration options
 *
 * @returns Promise resolving to validation results
 */
export async function validateLinks(
  patterns: string[],
  options: Partial<ValidateOperationOptions> = {}
): Promise<ValidateResult> {
  const startTime = Date.now();

  const opts: Required<
    Omit<ValidateOperationOptions, 'maxDepth' | 'authCredentials' | 'authHeaders'>
  > & {
    maxDepth?: number;
    authCredentials?: Record<string, string>;
    authHeaders?: Record<string, Record<string, string>>;
  } = {
    linkTypes: options.linkTypes || [
      'internal',
      'external',
      'anchor',
      'image',
      'reference',
      'claude-import',
      ...(options.obsidian ? OBSIDIAN_LINK_TYPES : []),
    ],
    checkExternal: options.checkExternal ?? false,
    externalTimeout: options.externalTimeout ?? 5000,
    strictInternal: options.strictInternal ?? true,
    checkClaudeImports: options.checkClaudeImports ?? true,
    checkCircular: options.checkCircular ?? false,
    onlyBroken: options.onlyBroken ?? true,
    groupBy: options.groupBy ?? 'file',
    includeContext: options.includeContext ?? false,
    checkContentFreshness: options.checkContentFreshness ?? false,
    freshnessThreshold: options.freshnessThreshold ?? 730, // 2 years in days
    enableAuthDetection: options.enableAuthDetection ?? false,
    allowAuthRequired: options.allowAuthRequired ?? true,
    dryRun: options.dryRun ?? false,
    verbose: options.verbose ?? false,
    force: options.force ?? false,
    gitDiff: options.gitDiff ?? '',
    gitStaged: options.gitStaged ?? false,
    obsidian: options.obsidian ?? false,
    skipDomains: options.skipDomains ?? [],
    externalRetries: options.externalRetries ?? 2,
    requireFrontmatter: options.requireFrontmatter ?? [],
    enforceLinkFormat: options.enforceLinkFormat ?? 'none',
    cache: options.cache ?? false,
    cacheDir: options.cacheDir ?? '.markmv-cache',
    failFast: options.failFast ?? false,
    includeDependencies: options.includeDependencies ?? true,
  };
  if (options.maxDepth !== undefined) {
    opts.maxDepth = options.maxDepth;
  }
  if (options.authCredentials !== undefined) {
    opts.authCredentials = options.authCredentials;
  }
  if (options.authHeaders !== undefined) {
    opts.authHeaders = options.authHeaders;
  }

  // Initialize git utils and cache if needed
  let gitUtils: GitUtils | undefined;
  let cache: ValidationCache | undefined;
  let gitInfo: ValidateResult['gitInfo'] | undefined;

  if (opts.gitDiff || opts.gitStaged || opts.cache) {
    gitUtils = new GitUtils();

    if (!gitUtils.isGitRepository()) {
      if (opts.gitDiff || opts.gitStaged) {
        throw new Error('Git integration requires a git repository');
      }
      if (opts.verbose) {
        console.warn('Not in a git repository, disabling git integration');
      }
      gitUtils = undefined;
    }
  }

  if (opts.cache) {
    cache = new ValidationCache({ cacheDir: opts.cacheDir });
    if (!(await cache.isEnabled())) {
      if (opts.verbose) {
        console.warn('Cache is not accessible, disabling caching');
      }
      cache = undefined;
    }

    // Cache statistics are reported through gitInfo, so initialise it here rather than only in
    // the git branches; the git modes overwrite this with their own richer payload below.
    gitInfo ??= {
      enabled: false,
      changedFiles: 0,
      cachedFiles: 0,
      cacheHitRate: 0,
    };
  }

  // Resolve file patterns to actual file paths
  let files: string[] = [];

  if (opts.gitDiff && gitUtils) {
    // Git diff mode - only validate changed files
    const baseRef = opts.gitDiff;

    if (!gitUtils.refExists(baseRef)) {
      throw new Error(`Git reference '${baseRef}' does not exist`);
    }

    const changedFiles = gitUtils.getChangedFiles(baseRef);
    files = changedFiles
      .filter((change) => change.status !== 'deleted')
      .map((change) => change.path)
      .filter((path) => path.endsWith('.md'));

    const status = gitUtils.getStatus();
    gitInfo = {
      enabled: true,
      changedFiles: files.length,
      cachedFiles: 0,
      cacheHitRate: 0,
      baseRef,
      currentCommit: status.commit,
    };

    if (opts.verbose) {
      console.log(
        `🔍 Git Integration: Found ${files.length} changed markdown files since ${baseRef}`
      );
    }
  } else if (opts.gitStaged && gitUtils) {
    // Git staged mode - only validate staged files
    const stagedFiles = gitUtils.getStagedFiles();
    files = stagedFiles
      .filter((change) => change.status !== 'deleted')
      .map((change) => change.path)
      .filter((path) => path.endsWith('.md'));

    const status = gitUtils.getStatus();
    gitInfo = {
      enabled: true,
      changedFiles: files.length,
      cachedFiles: 0,
      cacheHitRate: 0,
      currentCommit: status.commit,
    };

    if (opts.verbose) {
      console.log(`🔍 Git Integration: Found ${files.length} staged markdown files`);
    }
  } else {
    // Standard mode - resolve glob patterns. Glob patterns use forward slashes on every
    // platform -- backslashes are pattern escapes, not separators -- so library callers passing
    // host-native joined paths get them normalised exactly as the CLI already does.
    for (const pattern of patterns) {
      try {
        const globOptions: { absolute: boolean; ignore: string[]; maxDepth?: number } = {
          absolute: true,
          ignore: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
        };
        if (typeof opts.maxDepth === 'number') {
          globOptions.maxDepth = opts.maxDepth;
        }

        const normalizedPattern = pattern.replace(/\\/g, '/');
        const matches = await glob(normalizedPattern, globOptions);
        files.push(...matches.filter((f) => f.endsWith('.md')));
      } catch (error) {
        if (opts.verbose) {
          console.error(`Error processing pattern "${pattern}":`, error);
        }
      }
    }

    if (opts.verbose) {
      console.log(`Found ${files.length} markdown files to validate`);
    }
  }

  // In obsidian mode a wikilink resolves against the whole vault, so the resolver indexes every
  // markdown file under the scan root, not only the files the patterns matched
  let wikilinkResolver: ReturnType<typeof createWikilinkResolver> | undefined = undefined;
  if (opts.obsidian && files.length > 0) {
    let vaultRoot = PathUtils.findCommonBase(files);
    if (vaultRoot === sep || /^[A-Za-z]:$/.test(vaultRoot)) {
      vaultRoot = dirname(files[0] || '');
    }
    if (vaultRoot) {
      // The index covers every vault file, not only notes -- embeds target images and PDFs by
      // bare filename too
      const vaultFilePaths = await FileUtils.listFiles(vaultRoot, { recursive: true });
      wikilinkResolver = createWikilinkResolver(vaultRoot, vaultFilePaths);
    }
  }

  // Initialize validator and parser
  const validator = new LinkValidator({
    checkExternal: opts.checkExternal,
    externalTimeout: opts.externalTimeout,
    strictInternal: opts.strictInternal,
    checkClaudeImports: opts.checkClaudeImports,
    checkContentFreshness: opts.checkContentFreshness,
    freshnessConfig: {
      defaultThreshold: opts.freshnessThreshold * 24 * 60 * 60 * 1000, // Convert days to milliseconds
    },
    enableAuthDetection: opts.enableAuthDetection,
    allowAuthRequired: opts.allowAuthRequired,
    authConfig: {
      credentials: opts.authCredentials || {},
      customHeaders: opts.authHeaders || {},
    },
    ...(wikilinkResolver ? { checkWikilinks: true, wikilinkResolver } : {}),
    skipDomains: opts.skipDomains,
    externalRetries: opts.externalRetries,
  });

  const parser = new LinkParser();

  const result: ValidateResult = {
    filesProcessed: 0,
    totalLinks: 0,
    brokenLinks: 0,
    brokenLinksByFile: {},
    brokenLinksByType: {},
    fileErrors: [],
    hasCircularReferences: false,
    processingTime: 0,
    staleLinks: 0,
    freshLinks: 0,
    authRequiredLinks: 0,
    authenticatedLinks: 0,
    frontmatterViolations: [],
    formatViolations: [],
  };
  if (gitInfo !== undefined) {
    result.gitInfo = gitInfo;
  }

  // Initialize broken links by type
  for (const linkType of opts.linkTypes) {
    result.brokenLinksByType[linkType] = [];
  }

  // Calculate configuration hash for cache validation
  const configHash = calculateConfigHash({
    linkTypes: opts.linkTypes,
    checkExternal: opts.checkExternal,
    externalTimeout: opts.externalTimeout,
    strictInternal: opts.strictInternal,
    checkClaudeImports: opts.checkClaudeImports,
  });

  let cacheHits = 0;
  let cacheMisses = 0;

  // Process each file
  for (const filePath of files) {
    try {
      if (opts.verbose) {
        console.log(`Validating: ${filePath}`);
      }

      // Standards enforcement runs for every file up front, independent of caching and of whether
      // the file has any links at all
      if (opts.requireFrontmatter.length > 0) {
        const content = await readFile(filePath, 'utf-8');
        const present = parseFrontmatterFields(content);
        const missingFields = opts.requireFrontmatter.filter((field) => !present.has(field));
        if (missingFields.length > 0) {
          result.frontmatterViolations.push({ file: filePath, missingFields });
        }
      }
      if (opts.enforceLinkFormat !== 'none') {
        const parsedForFormat = await parser.parseFile(filePath);
        for (const link of parsedForFormat.links) {
          if (link.type !== 'internal' && link.type !== 'image') continue;
          // The parser records drive-absolute and UNC forms as absolute too, which a
          // leading-slash string test would miss on Windows
          const absoluteForm = link.absolute;
          if (opts.enforceLinkFormat === 'relative' && absoluteForm) {
            result.formatViolations.push({
              file: filePath,
              href: link.href,
              line: link.line,
              expected: 'relative',
            });
          } else if (opts.enforceLinkFormat === 'absolute' && !absoluteForm) {
            result.formatViolations.push({
              file: filePath,
              href: link.href,
              line: link.line,
              expected: 'absolute',
            });
          }
        }
      }

      let validation: { brokenLinks: BrokenLink[] } | undefined;
      let totalLinksForFile = 0;
      // External-link count for freshness statistics; a cache hit has no link list, so the
      // fresh-external total under-counts cached files by design
      let externalLinkCount = 0;

      // Try to get from cache first; a failing cache read degrades to a miss rather than
      // skipping the file
      if (cache) {
        const contentHash = await calculateFileHash(filePath);
        let cached;
        try {
          cached = await cache.get(filePath, contentHash, configHash);
        } catch (error) {
          if (opts.verbose) {
            console.warn(`  Cache read failed for ${filePath}, validating anyway:`, error);
          }
        }

        if (cached) {
          validation = { brokenLinks: cached.result.brokenLinks || [] };
          totalLinksForFile = cached.result.totalLinks || 0;
          cacheHits++;

          if (opts.verbose) {
            console.log(`  ✓ Used cached result`);
          }
        } else {
          cacheMisses++;
        }
      }

      if (!validation) {
        // Parse links from file
        const parsedFile = await parser.parseFile(filePath);
        const relevantLinks = parsedFile.links.filter((link) => opts.linkTypes.includes(link.type));
        totalLinksForFile = relevantLinks.length;
        externalLinkCount = relevantLinks.filter((link) => link.type === 'external').length;

        if (relevantLinks.length === 0) {
          // Store empty result in cache
          if (cache) {
            const contentHash = await calculateFileHash(filePath);
            const gitCommit = gitUtils?.getCurrentCommit();
            try {
              await cache.set(
                filePath,
                contentHash,
                { brokenLinks: [], totalLinks: 0, hasExternalLinks: false },
                configHash,
                gitCommit
              );
            } catch (error) {
              if (opts.verbose) {
                console.warn(`  Cache write failed for ${filePath}:`, error);
              }
            }
          }

          result.filesProcessed++;
          continue;
        }

        // Validate links
        validation = await validator.validateLinks(relevantLinks, filePath);

        // Store result in cache
        if (cache) {
          const contentHash = await calculateFileHash(filePath);
          const gitCommit = gitUtils?.getCurrentCommit();
          try {
            await cache.set(
              filePath,
              contentHash,
              {
                brokenLinks: validation.brokenLinks,
                totalLinks: totalLinksForFile,
                hasExternalLinks: relevantLinks.some((link) => link.type === 'external'),
              },
              configHash,
              gitCommit
            );
          } catch (error) {
            if (opts.verbose) {
              console.warn(`  Cache write failed for ${filePath}:`, error);
            }
          }
        }
      }

      result.totalLinks += totalLinksForFile;
      result.filesProcessed++;

      const brokenLinks = validation.brokenLinks;

      // Count freshness statistics
      if (opts.checkContentFreshness) {
        const staleLinks = brokenLinks.filter((bl) => bl.reason === 'content-stale').length;
        const freshExternalLinks = externalLinkCount - staleLinks;

        result.staleLinks = (result.staleLinks || 0) + staleLinks;
        if (freshExternalLinks > 0) {
          result.freshLinks = (result.freshLinks || 0) + freshExternalLinks;
        }
      }

      // Count authentication statistics if auth detection is enabled
      if (opts.enableAuthDetection) {
        if (brokenLinks.length > 0) {
          // Count auth-required links
          const authRequiredCount = brokenLinks.filter(
            (bl) => bl.reason === 'auth-required'
          ).length;
          const authenticatedCount = brokenLinks.filter(
            (bl) => bl.authInfo?.authAttempted && bl.authInfo?.authSucceeded
          ).length;

          result.authRequiredLinks = (result.authRequiredLinks || 0) + authRequiredCount;
          result.authenticatedLinks = (result.authenticatedLinks || 0) + authenticatedCount;
        }
      }

      if (brokenLinks.length > 0) {
        result.brokenLinks += brokenLinks.length;

        // Convert to extended broken links with additional context
        const extendedBrokenLinks: ExtendedBrokenLink[] = brokenLinks.map((brokenLink) => ({
          ...brokenLink,
          type: brokenLink.link.type,
          url: brokenLink.link.href,
          line: brokenLink.link.line,
          filePath: opts.includeContext ? filePath : undefined,
        }));

        result.brokenLinksByFile[filePath] = extendedBrokenLinks;

        // Group by type
        for (const extendedBrokenLink of extendedBrokenLinks) {
          if (!result.brokenLinksByType[extendedBrokenLink.type]) {
            result.brokenLinksByType[extendedBrokenLink.type] = [];
          }
          const typeArray = result.brokenLinksByType[extendedBrokenLink.type];
          if (typeArray) {
            typeArray.push(extendedBrokenLink);
          }
        }

        // Exit early if fail-fast is enabled
        if (opts.failFast) {
          break;
        }
      }
    } catch (error) {
      result.fileErrors.push({
        file: filePath,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (opts.verbose) {
        console.error(`Error processing ${filePath}:`, error);
      }

      // Exit early if fail-fast is enabled
      if (opts.failFast) {
        break;
      }
    }
  }

  // Update git info with cache statistics
  if (result.gitInfo && cache) {
    const totalRequests = cacheHits + cacheMisses;
    result.gitInfo.cachedFiles = cacheHits;
    result.gitInfo.cacheHitRate =
      totalRequests > 0 ? Math.round((cacheHits / totalRequests) * 100) : 0;
  }

  // Check for circular references if requested
  if (opts.checkCircular && files.length > 0) {
    try {
      const circularCheck = await validator.checkCircularReferences(files);
      result.hasCircularReferences = circularCheck.hasCircularReferences;
      if (circularCheck.hasCircularReferences && circularCheck.circularPaths) {
        result.circularReferences = circularCheck.circularPaths;
      }
    } catch (error) {
      if (opts.verbose) {
        console.error('Error checking circular references:', error);
      }
    }
  }

  result.processingTime = Date.now() - startTime;
  return result;
}

/**
 * CLI command handler for validate operations.
 *
 * Processes markdown files to find broken links of all types. Supports various output formats and
 * filtering options.
 *
 * @example
 *   ```bash
 *   # Validate all markdown files including external links
 *   markmv validate "**\/*.md" --check-external --verbose
 *
 *   # Check only internal links and images
 *   markmv validate docs/ --link-types internal,image --strict-internal
 *
 *   # Find broken links with context information
 *   markmv validate README.md --include-context --group-by type
 *   ```;
 *
 * @param patterns - File patterns to validate
 * @param cliOptions - CLI-specific options
 */
export async function validateCommand(
  patterns: string[],
  cliOptions: ValidateCliOptions,
  prompter?: FixPrompter
): Promise<void> {
  // Default to current directory if no patterns provided
  let finalPatterns = patterns.length === 0 ? ['.'] : patterns;

  // Convert directories to glob patterns
  finalPatterns = finalPatterns.map((pattern) => {
    // Always normalize paths for cross-platform compatibility
    const normalizedPattern = pattern.replace(/\\/g, '/');

    try {
      const stat = statSync(pattern);
      if (stat.isDirectory()) {
        // Use posix-style paths for glob patterns to ensure cross-platform compatibility
        return posix.join(normalizedPattern, '**/*.md');
      }
      return normalizedPattern;
    } catch {
      // If stat fails, treat as a file pattern (could be a glob)
      return normalizedPattern;
    }
  });

  // Convert CLI options to internal options
  const options: ValidateOperationOptions = {
    ...cliOptions,
    linkTypes: cliOptions.linkTypes
      ? cliOptions.linkTypes
          .split(',')
          .map((t) => t.trim())
          .filter((t): t is LinkType =>
            [
              'internal',
              'external',
              'anchor',
              'image',
              'reference',
              'claude-import',
              'wikilink',
              'obsidian-transclusion',
            ].includes(t)
          )
      : [
          'internal',
          'external',
          'anchor',
          'image',
          'reference',
          'claude-import',
          ...(cliOptions.obsidian ? OBSIDIAN_LINK_TYPES : []),
        ],
  };

  try {
    const result = await validateLinks(finalPatterns, options);

    if (cliOptions.json) {
      // JSON and human output must agree on the exit code, so the failure condition is
      // computed once here and mirrors everything the human path reports
      if (
        result.brokenLinks > 0 ||
        result.fileErrors.length > 0 ||
        result.frontmatterViolations.length > 0 ||
        result.formatViolations.length > 0
      ) {
        process.exitCode = 1;
      }
      console.log(JSON.stringify(result, null, 2));
      // Fix suggestions go to stderr so machine consumers keep a clean JSON stream on stdout
      if (cliOptions.fix) {
        const knownFiles = await scanKnownFiles(finalPatterns);
        for (const fix of planLinkFixes(result, knownFiles)) {
          console.error(
            `Did you mean one of: ${fix.suggestions.map((sg) => sg.replacementHref).join(', ')} for ${fix.brokenHref} (${fix.sourceFile}:${fix.line})`
          );
        }
      }
      return;
    }

    // Format output for human consumption
    if (result.gitInfo?.enabled) {
      console.log(`\n🔍 Git Integration`);
      if (result.gitInfo.baseRef) {
        console.log(
          `Changed since ${result.gitInfo.baseRef}: ${result.gitInfo.changedFiles} files`
        );
      } else {
        console.log(`Staged files: ${result.gitInfo.changedFiles} files`);
      }
      if (result.gitInfo.cachedFiles > 0) {
        console.log(
          `Cache hits: ${result.gitInfo.cachedFiles} files (${result.gitInfo.cacheHitRate}% hit rate)`
        );
      }
      console.log();
    }

    console.log(`📊 Validation Summary`);
    console.log(`Files processed: ${result.filesProcessed}`);
    console.log(`Total links found: ${result.totalLinks}`);
    console.log(`Broken links: ${result.brokenLinks}`);
    console.log(`Processing time: ${result.processingTime}ms`);

    if (result.gitInfo?.enabled && options.cache) {
      const savedTime =
        result.gitInfo.cacheHitRate > 0
          ? ` (${Math.round(result.processingTime * (result.gitInfo.cacheHitRate / 100))}ms saved by cache)`
          : '';
      console.log(`Cache performance: ${result.gitInfo.cacheHitRate}% hit rate${savedTime}`);
    }
    console.log();

    // Show freshness information if enabled
    if (options.checkContentFreshness) {
      const staleCount = result.staleLinks || 0;
      const freshCount = result.freshLinks || 0;
      const externalTotal = staleCount + freshCount;

      if (externalTotal > 0) {
        console.log(`Fresh external links: ${freshCount}`);
        console.log(`Stale external links: ${staleCount}`);
      }
    }

    // Show authentication information if enabled
    if (options.enableAuthDetection) {
      const authRequiredCount = result.authRequiredLinks || 0;
      const authenticatedCount = result.authenticatedLinks || 0;
      const realBrokenCount = result.brokenLinks - authRequiredCount;

      if (authRequiredCount > 0) {
        console.log(`🔒 Authentication-protected links: ${authRequiredCount}`);
      }
      if (authenticatedCount > 0) {
        console.log(`✅ Successfully authenticated links: ${authenticatedCount}`);
      }
      if (realBrokenCount > 0) {
        console.log(`❌ Truly broken links: ${realBrokenCount}`);
      }
    }

    console.log(`Processing time: ${result.processingTime}ms\n`);

    if (result.frontmatterViolations.length > 0 || result.formatViolations.length > 0) {
      // Standards violations fail the run exactly like broken links, including when no links
      // are broken (the clean-links early return below would otherwise swallow this)
      process.exitCode = 1;
    }

    if (result.frontmatterViolations.length > 0) {
      console.log(`📋 Frontmatter Violations (${result.frontmatterViolations.length}):`);
      for (const violation of result.frontmatterViolations) {
        console.log(`  ${violation.file}: missing ${violation.missingFields.join(', ')}`);
      }
      console.log();
    }

    if (result.formatViolations.length > 0) {
      console.log(`📐 Link Format Violations (${result.formatViolations.length}):`);
      for (const violation of result.formatViolations) {
        console.log(
          `  ${violation.file}:${violation.line} ${violation.href} (expected ${violation.expected})`
        );
      }
      console.log();
    }

    if (result.fileErrors.length > 0) {
      console.log(`⚠️  File Errors (${result.fileErrors.length}):`);
      for (const error of result.fileErrors) {
        console.log(`  ${error.file}: ${error.error}`);
      }
      // A file that fails to parse cannot have its links validated, so the run cannot guarantee link integrity; fail the exit code regardless of the broken-link count.
      process.exitCode = 1;

      if (cliOptions.explain) {
        const explainTarget = resolve(cliOptions.explain);
        const entry = result.fileErrors.find((fileError) => fileError.file === explainTarget);
        if (entry) {
          console.log(`\n🔍 Parse failure stack for ${entry.file}:`);
          console.log(entry.stack ?? `${entry.error} (no stack recorded)`);
        } else {
          console.log(`\nNo parse failure recorded for ${explainTarget}`);
        }
      }
      console.log();
    } else if (cliOptions.explain) {
      console.log(`No parse failure recorded for ${resolve(cliOptions.explain)}\n`);
    }

    if (result.hasCircularReferences) {
      console.log(`🔄 Circular References Detected:`);
      if (result.circularReferences) {
        for (const cycle of result.circularReferences) {
          console.log(`  ${cycle}`);
        }
      }
      console.log();
    }

    if (result.brokenLinks === 0) {
      console.log(`✅ No broken links found!`);
      return;
    }

    console.log(`🔗 Broken Links Found:`);

    if (options.groupBy === 'type') {
      // Group by link type
      for (const [linkType, brokenLinks] of Object.entries(result.brokenLinksByType)) {
        if (brokenLinks.length > 0) {
          console.log(`\n  ${linkType.toUpperCase()} (${brokenLinks.length}):`);
          for (const brokenLink of brokenLinks) {
            const context =
              options.includeContext && brokenLink.line ? ` (line ${brokenLink.line})` : '';
            const file = brokenLink.filePath ? ` in ${brokenLink.filePath}` : '';
            const freshness = brokenLink.reason === 'content-stale' ? ' [STALE]' : '';
            const authIndicator = brokenLink.reason === 'auth-required' ? ' 🔒' : '';
            console.log(`    ❌ ${brokenLink.url}${context}${file}${freshness}${authIndicator}`);
            if (brokenLink.reason && options.verbose) {
              console.log(`       Reason: ${brokenLink.reason}`);
            }
            if (
              brokenLink.freshnessInfo &&
              (options.verbose || brokenLink.reason === 'content-stale')
            ) {
              const info = brokenLink.freshnessInfo;
              if (info.warning) {
                console.log(`       Warning: ${info.warning}`);
              }
              if (info.suggestion && options.verbose) {
                console.log(`       Suggestion: ${info.suggestion}`);
              }
              if (info.lastModified && options.verbose) {
                console.log(`       Last Modified: ${info.lastModified.toDateString()}`);
              }
              if (info.stalePatterns.length > 0 && options.verbose) {
                console.log(`       Detected patterns: ${info.stalePatterns.join(', ')}`);
              }
            }
            if (brokenLink.authInfo && (options.verbose || brokenLink.reason === 'auth-required')) {
              const info = brokenLink.authInfo;
              if (info.warning) {
                console.log(`       Auth: ${info.warning}`);
              }
              if (info.authProvider && options.verbose) {
                console.log(`       Provider: ${info.authProvider}`);
              }
              if (info.suggestion) {
                console.log(`       Suggestion: ${info.suggestion}`);
              }
            }
          }
        }
      }
    } else {
      // Group by file
      for (const [filePath, brokenLinks] of Object.entries(result.brokenLinksByFile)) {
        console.log(`\n  📄 ${filePath} (${brokenLinks.length} broken):`);
        for (const brokenLink of brokenLinks) {
          const context =
            options.includeContext && brokenLink.line ? ` (line ${brokenLink.line})` : '';
          const freshness = brokenLink.reason === 'content-stale' ? ' [STALE]' : '';
          const authIndicator = brokenLink.reason === 'auth-required' ? ' 🔒' : '';
          console.log(
            `    ❌ [${brokenLink.type}] ${brokenLink.url}${context}${freshness}${authIndicator}`
          );
          if (brokenLink.reason && options.verbose) {
            console.log(`       Reason: ${brokenLink.reason}`);
          }
          if (
            brokenLink.freshnessInfo &&
            (options.verbose || brokenLink.reason === 'content-stale')
          ) {
            const info = brokenLink.freshnessInfo;
            if (info.warning) {
              console.log(`       Warning: ${info.warning}`);
            }
            if (info.suggestion && options.verbose) {
              console.log(`       Suggestion: ${info.suggestion}`);
            }
            if (info.lastModified && options.verbose) {
              console.log(`       Last Modified: ${info.lastModified.toDateString()}`);
            }
            if (info.stalePatterns.length > 0 && options.verbose) {
              console.log(`       Detected patterns: ${info.stalePatterns.join(', ')}`);
            }
          }
          if (brokenLink.authInfo && (options.verbose || brokenLink.reason === 'auth-required')) {
            const info = brokenLink.authInfo;
            if (info.warning) {
              console.log(`       Auth: ${info.warning}`);
            }
            if (info.authProvider && options.verbose) {
              console.log(`       Provider: ${info.authProvider}`);
            }
            if (info.suggestion) {
              console.log(`       Suggestion: ${info.suggestion}`);
            }
          }
        }
      }
    }

    // Fix mode: suggest and apply replacements for broken internal links. Interactive when a
    // prompter is injected or stdout is a terminal; otherwise suggestions are printed only.
    if (cliOptions.fix) {
      const knownFiles = await scanKnownFiles(finalPatterns);
      const fixes = planLinkFixes(result, knownFiles);
      if (fixes.length === 0) {
        console.log('\n🔧 No fix suggestions available for the broken links found');
      } else if (prompter || process.stdout.isTTY) {
        let applied = 0;
        for (const fix of fixes) {
          const choice = prompter ? await prompter(fix) : await promptFixChoice(fix);
          if (choice === undefined) {
            continue;
          }
          await applyLinkFix(fix, choice);
          applied++;
        }
        console.log(`\n🔧 Applied ${applied} fix(es)`);
      } else {
        console.log('\n🔧 Suggested fixes (rerun on a terminal, or use the API, to apply):');
        for (const fix of fixes) {
          console.log(`  ${fix.sourceFile}:${fix.line} ${fix.brokenHref}`);
          for (const suggestion of fix.suggestions) {
            console.log(`    Did you mean ${suggestion.replacementHref} (${suggestion.reason})`);
          }
        }
      }
    }

    // Exit with error code if broken links found
    if (result.brokenLinks > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Validation failed:', error);
    process.exitCode = 1;
  }
}
