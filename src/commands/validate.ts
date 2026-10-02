import { readFile, writeFile } from "node:fs/promises";
import { glob } from "glob";
import { statSync } from "fs";
import { dirname, posix, sep } from "path";
import { LinkParser } from "../core/link-parser.js";
import type { LinkValidator } from "../core/link-validator.js";
import {
  suggestLinkFixes,
  type LinkSuggestion,
} from "../core/link-suggester.js";
import { FileUtils } from "../utils/file-utils.js";
import { PathUtils } from "../utils/path-utils.js";
import { calculateConfigHash } from "../utils/validation-cache.js";
import type { LinkType } from "../types/links.js";
import type { BrokenLink } from "../types/config.js";
import type { OperationOptions } from "../types/operations.js";
import {
  printBrokenLinks,
  printCircularReferences,
  printFileErrors,
  printStandardsViolations,
  printSummary,
} from "./validate-report.js";
import { processFile, type FileValidationContext } from "./validate-file.js";
import {
  DEFAULT_LINK_TYPES,
  OBSIDIAN_LINK_TYPES,
  SCAN_IGNORE_PATTERNS,
  createCache,
  createGitUtils,
  createLinkValidator,
  resolveFiles,
  resolveValidateOptions,
  type ResolvedValidateOptions,
} from "./validate-setup.js";

/** Scale of the cache hit rate, which the result reports as a percentage */
const PERCENT = 100;

/** Link types the CLI accepts in a comma-separated `--link-types` value */
const CLI_LINK_TYPES: readonly string[] = [
  ...DEFAULT_LINK_TYPES,
  ...OBSIDIAN_LINK_TYPES,
];

/**
 * Configuration options for link validation operations.
 *
 * Controls how broken link detection is performed across markdown files.
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
  groupBy: "file" | "type";
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
  enforceLinkFormat?: "relative" | "absolute" | "none";
}

/**
 * CLI-specific options for the validate command.
 * @category Commands
 */
export interface ValidateCliOptions extends Omit<
  ValidateOperationOptions,
  "linkTypes"
> {
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
  fileErrors: {
    /** Path of the file that failed to process */
    file: string;
    /** Error message */
    error: string;
    /** Stack trace, when the error carried one */
    stack?: string | undefined;
  }[];
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
  frontmatterViolations: {
    /** Path of the file missing required fields */
    file: string;
    /** Required frontmatter fields the file does not define */
    missingFields: string[];
  }[];
  /** Internal links whose href form violates the enforced link format */
  formatViolations: {
    /** Path of the file containing the link */
    file: string;
    /** The link target as written */
    href: string;
    /** Line number of the link */
    line: number;
    /** The enforced form the link should take, `relative` or `absolute` */
    expected: string;
  }[];
}

/**
 * A broken internal link with ranked replacement candidates, ready to prompt about.
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
 * @category Commands
 */
export type FixPrompter = (fix: PlannedLinkFix) => Promise<number | undefined>;

/**
 * Plan fixes for the broken internal links in a validation result.
 *
 * Only internal file-not-found links are fixable this way -- an external or anchor failure has no
 * file to suggest. Broken links whose target resembles nothing known are left out rather than given
 * a wild guess.
 * @param result - A completed validation result
 * @param knownFiles - Absolute paths of every candidate file in the project
 * @returns One planned fix per broken internal link that has suggestions
 * @category Commands
 */
export function planLinkFixes(
  result: ValidateResult,
  knownFiles: readonly string[],
): PlannedLinkFix[] {
  const fixes: PlannedLinkFix[] = [];
  /* The suggester takes a mutable array, so it gets one copy for every broken link */
  const candidates = [...knownFiles];
  for (const [filePath, brokenLinks] of Object.entries(
    result.brokenLinksByFile,
  )) {
    for (const broken of brokenLinks) {
      if (broken.type !== "internal" || broken.reason !== "file-not-found")
        continue;
      const suggestions = suggestLinkFixes(broken.url, filePath, candidates);
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
 * @param fix - The planned fix being accepted
 * @param choiceIndex - Zero-based index into fix.suggestions
 * @category Commands
 */
export async function applyLinkFix(
  fix: PlannedLinkFix,
  choiceIndex: number,
): Promise<void> {
  if (choiceIndex < 0 || choiceIndex >= fix.suggestions.length) {
    throw new Error(
      `No suggestion ${String(choiceIndex)} for ${fix.brokenHref} in ${fix.sourceFile}`,
    );
  }
  const suggestion = fix.suggestions[choiceIndex];
  // An anchored target keeps its anchor on the replacement; the anchor sits after the path
  const [pathPart, ...fragmentParts] = fix.brokenHref.split("#");
  const fragment =
    fragmentParts.length > 0 ? `#${fragmentParts.join("#")}` : "";
  const brokenSpan = `](${pathPart}`;

  const content = await readFile(fix.sourceFile, "utf-8");
  const lines = content.split("\n");
  const lineIndex = fix.line - 1;
  const target = lines.at(lineIndex);
  if (target === undefined) {
    throw new Error(`Line ${String(fix.line)} not found in ${fix.sourceFile}`);
  }
  if (!target.includes(brokenSpan)) {
    throw new Error(
      `Link ${fix.brokenHref} not found on line ${String(fix.line)} of ${fix.sourceFile}`,
    );
  }
  lines[lineIndex] = target.replace(
    brokenSpan,
    `](${suggestion.replacementHref}${fragment}`,
  );
  await writeFile(fix.sourceFile, lines.join("\n"));
}

/** Prompt on the terminal for which suggestion to apply, returning a zero-based index or skip */
async function promptFixChoice(
  fix: PlannedLinkFix,
): Promise<number | undefined> {
  const { createInterface } = await import("node:readline/promises");
  const readlineInterface = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    console.log(
      `\n🔧 ${fix.sourceFile}:${String(fix.line)} broken link ${fix.brokenHref}`,
    );
    fix.suggestions.forEach((suggestion, index) => {
      console.log(
        `  ${String(index + 1)}. ${suggestion.replacementHref} (${suggestion.reason})`,
      );
    });
    console.log("  s. skip");
    const answer = await readlineInterface.question("Choice [1-s]: ");
    const trimmed = answer.trim().toLowerCase();
    if (trimmed === "" || trimmed === "s") {
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
async function scanKnownFiles(patterns: readonly string[]): Promise<string[]> {
  const perPattern = await Promise.all(
    patterns.map(async (pattern) => {
      const normalizedPattern = pattern.replace(/\\/g, "/");
      const matches = await glob(normalizedPattern, {
        absolute: true,
        ignore: SCAN_IGNORE_PATTERNS,
      });

      return matches.filter((filePath) => filePath.endsWith(".md"));
    }),
  );
  const matched = perPattern.flat();
  if (matched.length === 0) {
    return [];
  }
  let scanRoot = PathUtils.findCommonBase(matched);
  if (scanRoot === sep || /^[A-Za-z]:$/.test(scanRoot)) {
    // Disjoint matched trees would anchor the scan at a filesystem root and walk the disk
    scanRoot = dirname(matched[0] || "");
  }
  if (!scanRoot) {
    return matched;
  }
  const scanned = await FileUtils.findMarkdownFiles(scanRoot, true);

  return scanned.length > 0 ? scanned : matched;
}

/** Create the empty result that file processing accumulates into */
function createEmptyResult(
  opts: ResolvedValidateOptions,
  gitInfo: ValidateResult["gitInfo"] | undefined,
): ValidateResult {
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
  for (const linkType of opts.linkTypes) {
    result.brokenLinksByType[linkType] = [];
  }

  return result;
}

/** Detect circular references among the files; a failing check yields nothing and is reported only when verbose */
async function findCircularReferences(
  validator: LinkValidator,
  files: readonly string[],
  verbose: boolean,
): Promise<
  { hasCircularReferences: boolean; circularPaths?: string[] } | undefined
> {
  try {
    /* The validator's overload takes a mutable array, so it gets its own copy */
    const circularCheck = await validator.checkCircularReferences([...files]);

    return circularCheck.circularPaths === undefined
      ? { hasCircularReferences: circularCheck.hasCircularReferences }
      : {
          hasCircularReferences: circularCheck.hasCircularReferences,
          circularPaths: circularCheck.circularPaths,
        };
  } catch (error) {
    if (verbose) {
      console.error("Error checking circular references:", error);
    }

    return undefined;
  }
}

/**
 * Validates markdown files for broken links of all types.
 *
 * Searches through markdown files to find broken internal links, external HTTP/HTTPS links, missing
 * images, invalid anchors, and other link integrity issues.
 * @example
 * Basic validation
 * ```typescript
 * const result = await validateLinks(['**\/*.md'], {
 *   checkExternal: true,
 *   onlyBroken: true
 * });
 *
 * console.log('Found ' + result.brokenLinks + ' broken links in ' + result.filesProcessed + ' files');
 * ```
 * @example
 * Validate specific link types only
 * ```typescript
 * const result = await validateLinks(['docs\/*.md'], {
 *   linkTypes: ['internal', 'image'],
 *   strictInternal: true,
 *   includeContext: true
 * });
 * ```
 * @param patterns - File patterns to validate (supports globs)
 * @param options - Validation configuration options
 * @returns Promise resolving to validation results
 * @category Commands
 */
export async function validateLinks(
  patterns: readonly string[],
  options: Partial<ValidateOperationOptions> = {},
): Promise<ValidateResult> {
  const startTime = Date.now();
  const opts = resolveValidateOptions(options);

  const gitUtils = createGitUtils(opts);
  const cache = await createCache(opts);
  const resolved = await resolveFiles(patterns, opts, gitUtils);
  const { files } = resolved;

  /* Cache statistics are reported through gitInfo, so initialise it for any cache run rather than
     only in the git modes, which supply their own richer payload. */
  const gitInfo =
    resolved.gitInfo ??
    (opts.cache
      ? { enabled: false, changedFiles: 0, cachedFiles: 0, cacheHitRate: 0 }
      : undefined);

  const validator = await createLinkValidator(opts, files);

  const result = createEmptyResult(opts, gitInfo);
  const context: FileValidationContext = {
    opts,
    parser: new LinkParser(),
    validator,
    cache,
    gitUtils,
    configHash: calculateConfigHash({
      linkTypes: opts.linkTypes,
      checkExternal: opts.checkExternal,
      externalTimeout: opts.externalTimeout,
      strictInternal: opts.strictInternal,
      checkClaudeImports: opts.checkClaudeImports,
    }),
    result,
    cacheStats: { hits: 0, misses: 0 },
  };

  /* Files are processed one after another: fail-fast must stop at the first file that fails, and
     the result's per-file ordering and the verbose progress output follow the input order. */
  for (const filePath of files) {
    const shouldStop = await processFile(context, filePath);
    if (shouldStop) {
      break;
    }
  }

  if (result.gitInfo !== undefined && cache !== undefined) {
    const { hits, misses } = context.cacheStats;
    const totalRequests = hits + misses;
    result.gitInfo.cachedFiles = hits;
    result.gitInfo.cacheHitRate =
      totalRequests > 0 ? Math.round((hits / totalRequests) * PERCENT) : 0;
  }

  if (opts.checkCircular && files.length > 0) {
    const circular = await findCircularReferences(
      validator,
      files,
      opts.verbose,
    );
    if (circular !== undefined) {
      result.hasCircularReferences = circular.hasCircularReferences;
      if (
        circular.hasCircularReferences &&
        circular.circularPaths !== undefined
      ) {
        result.circularReferences = circular.circularPaths;
      }
    }
  }

  result.processingTime = Date.now() - startTime;

  return result;
}

/** Convert directory arguments to markdown globs and default to the current directory */
function toGlobPatterns(patterns: readonly string[]): string[] {
  const requested = patterns.length === 0 ? ["."] : patterns;

  return requested.map((pattern) => {
    // Always normalise paths for cross-platform compatibility
    const normalizedPattern = pattern.replace(/\\/g, "/");

    try {
      if (statSync(pattern).isDirectory()) {
        // Use posix-style paths for glob patterns to ensure cross-platform compatibility
        return posix.join(normalizedPattern, "**/*.md");
      }

      return normalizedPattern;
    } catch {
      // If stat fails, treat as a file pattern (could be a glob)
      return normalizedPattern;
    }
  });
}

/** Convert CLI options to the options the validation API takes */
function toOperationOptions(
  cliOptions: ValidateCliOptions,
): ValidateOperationOptions {
  const linkTypes =
    cliOptions.linkTypes === undefined || cliOptions.linkTypes === ""
      ? [
          ...DEFAULT_LINK_TYPES,
          ...(cliOptions.obsidian === true ? OBSIDIAN_LINK_TYPES : []),
        ]
      : cliOptions.linkTypes
          .split(",")
          .map((t) => t.trim())
          .filter((t): t is LinkType => CLI_LINK_TYPES.includes(t));

  return { ...cliOptions, linkTypes };
}

/**
 * Suggest, and where possible apply, replacements for the broken internal links in a result.
 *
 * Interactive when a prompter is injected or stdout is a terminal; otherwise suggestions are
 * printed only.
 */
async function runFixMode(
  result: ValidateResult,
  patterns: readonly string[],
  prompter: FixPrompter | undefined,
): Promise<void> {
  const knownFiles = await scanKnownFiles(patterns);
  const fixes = planLinkFixes(result, knownFiles);
  if (fixes.length === 0) {
    console.log("\n🔧 No fix suggestions available for the broken links found");

    return;
  }

  if (prompter === undefined && !process.stdout.isTTY) {
    console.log(
      "\n🔧 Suggested fixes (rerun on a terminal, or use the API, to apply):",
    );
    for (const fix of fixes) {
      console.log(`  ${fix.sourceFile}:${String(fix.line)} ${fix.brokenHref}`);
      for (const suggestion of fix.suggestions) {
        console.log(
          `    Did you mean ${suggestion.replacementHref} (${suggestion.reason})`,
        );
      }
    }

    return;
  }

  /* Fixes are offered and applied one at a time: each choice is a prompt the user answers in
     turn, and a later fix may target a line an earlier one just rewrote. */
  let applied = 0;
  for (const fix of fixes) {
    const choice = await (prompter ?? promptFixChoice)(fix);
    if (choice === undefined) {
      continue;
    }
    await applyLinkFix(fix, choice);
    applied++;
  }
  console.log(`\n🔧 Applied ${String(applied)} fix(es)`);
}

/** What the human-readable report needs from the command run */
interface HumanReport {
  /** Completed validation result */
  result: ValidateResult;
  /** Operation options the validation ran with */
  options: ValidateOperationOptions;
  /** Options as given on the command line */
  cliOptions: ValidateCliOptions;
  /** Glob patterns the validation scanned, reused to find fix candidates */
  patterns: readonly string[];
  /** Fix chooser injected by the caller, if any */
  prompter: FixPrompter | undefined;
}

/** Print the full human-readable report and set the exit code for it */
async function reportForHumans(input: HumanReport): Promise<void> {
  const { result, options, cliOptions, patterns, prompter } = input;
  printSummary(result, options);

  if (
    result.frontmatterViolations.length > 0 ||
    result.formatViolations.length > 0
  ) {
    /* Standards violations fail the run exactly like broken links, including when no links are
       broken (the clean-links early return below would otherwise swallow this) */
    process.exitCode = 1;
  }
  printStandardsViolations(result);

  if (result.fileErrors.length > 0) {
    /* A file that fails to parse cannot have its links validated, so the run cannot guarantee link integrity; fail the exit code regardless of the broken-link count. */
    process.exitCode = 1;
  }
  printFileErrors(result, cliOptions.explain);
  printCircularReferences(result);

  if (result.brokenLinks === 0) {
    console.log(`✅ No broken links found!`);

    return;
  }

  printBrokenLinks(result, options);

  if (cliOptions.fix === true) {
    await runFixMode(result, patterns, prompter);
  }

  process.exitCode = 1;
}

/**
 * CLI command handler for validate operations.
 *
 * Processes markdown files to find broken links of all types. Supports various output formats and
 * filtering options.
 * @example
 * ```bash
 * # Validate all markdown files including external links
 * markmv validate "**\/*.md" --check-external --verbose
 *
 * # Check only internal links and images
 * markmv validate docs/ --link-types internal,image --strict-internal
 *
 * # Find broken links with context information
 * markmv validate README.md --include-context --group-by type
 * ```
 * @param patterns - File patterns to validate
 * @param cliOptions - CLI-specific options
 * @param prompter - Chooses a suggestion for each broken link in fix mode; defaults to a terminal prompt
 * @category Commands
 */
export async function validateCommand(
  patterns: readonly string[],
  cliOptions: ValidateCliOptions,
  prompter?: FixPrompter,
): Promise<void> {
  const finalPatterns = toGlobPatterns(patterns);
  const options = toOperationOptions(cliOptions);

  try {
    const result = await validateLinks(finalPatterns, options);

    if (cliOptions.json === true) {
      /* JSON and human output must agree on the exit code, so the failure condition is computed
         once here and mirrors everything the human path reports */
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
      if (cliOptions.fix === true) {
        const knownFiles = await scanKnownFiles(finalPatterns);
        for (const fix of planLinkFixes(result, knownFiles)) {
          console.error(
            `Did you mean one of: ${fix.suggestions.map((sg) => sg.replacementHref).join(", ")} for ${fix.brokenHref} (${fix.sourceFile}:${String(fix.line)})`,
          );
        }
      }

      return;
    }

    await reportForHumans({
      result,
      options,
      cliOptions,
      patterns: finalPatterns,
      prompter,
    });
  } catch (error) {
    console.error("Validation failed:", error);
    process.exitCode = 1;
  }
}
