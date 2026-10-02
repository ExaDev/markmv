import { glob } from "glob";
import { dirname, sep } from "path";
import { LinkValidator } from "../core/link-validator.js";
import { createWikilinkResolver } from "../core/obsidian-vault.js";
import { FileUtils } from "../utils/file-utils.js";
import { PathUtils } from "../utils/path-utils.js";
import { GitUtils, type GitFileChange } from "../utils/git-utils.js";
import { ValidationCache } from "../utils/validation-cache.js";
import type { LinkType } from "../types/links.js";
import type { ValidateOperationOptions, ValidateResult } from "./validate.js";

/** Glob ignore patterns applied to every validation scan */
export const SCAN_IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/coverage/**",
];

/** Link types only validated in obsidian mode, where wikilinks resolve vault-wide */
export const OBSIDIAN_LINK_TYPES: LinkType[] = [
  "wikilink",
  "obsidian-transclusion",
];

/** Default timeout for external link checks, in milliseconds */
const DEFAULT_EXTERNAL_TIMEOUT_MS = 5000;

/** Default content staleness threshold of two years, expressed in days */
const DEFAULT_FRESHNESS_THRESHOLD_DAYS = 730;

/** Hours in a day, for converting the day-based freshness threshold */
const HOURS_PER_DAY = 24;

/** Minutes in an hour, for converting the day-based freshness threshold */
const MINUTES_PER_HOUR = 60;

/** Seconds in a minute, for converting the day-based freshness threshold */
const SECONDS_PER_MINUTE = 60;

/** Milliseconds in a second, for converting the day-based freshness threshold */
const MS_PER_SECOND = 1000;

/** Milliseconds in a day, the unit the link validator's freshness threshold uses */
const MS_PER_DAY =
  HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;

/** Link types validated when the caller does not narrow the set */
export const DEFAULT_LINK_TYPES: readonly LinkType[] = [
  "internal",
  "external",
  "anchor",
  "image",
  "reference",
  "claude-import",
];

/** Validation options after every default has been applied */
export type ResolvedValidateOptions = Required<
  Omit<ValidateOperationOptions, "maxDepth" | "authCredentials" | "authHeaders">
> & {
  maxDepth?: number;
  authCredentials?: Record<string, string>;
  authHeaders?: Record<string, Record<string, string>>;
};

/** Apply every default to the caller's partial validation options */
export function resolveValidateOptions(
  options: Partial<ValidateOperationOptions>,
): ResolvedValidateOptions {
  const opts: ResolvedValidateOptions = {
    linkTypes: options.linkTypes ?? [
      ...DEFAULT_LINK_TYPES,
      ...(options.obsidian === true ? OBSIDIAN_LINK_TYPES : []),
    ],
    checkExternal: options.checkExternal ?? false,
    externalTimeout: options.externalTimeout ?? DEFAULT_EXTERNAL_TIMEOUT_MS,
    strictInternal: options.strictInternal ?? true,
    checkClaudeImports: options.checkClaudeImports ?? true,
    checkCircular: options.checkCircular ?? false,
    onlyBroken: options.onlyBroken ?? true,
    groupBy: options.groupBy ?? "file",
    includeContext: options.includeContext ?? false,
    checkContentFreshness: options.checkContentFreshness ?? false,
    freshnessThreshold:
      options.freshnessThreshold ?? DEFAULT_FRESHNESS_THRESHOLD_DAYS,
    enableAuthDetection: options.enableAuthDetection ?? false,
    allowAuthRequired: options.allowAuthRequired ?? true,
    dryRun: options.dryRun ?? false,
    verbose: options.verbose ?? false,
    force: options.force ?? false,
    gitDiff: options.gitDiff ?? "",
    gitStaged: options.gitStaged ?? false,
    obsidian: options.obsidian ?? false,
    skipDomains: options.skipDomains ?? [],
    externalRetries: options.externalRetries ?? 2,
    requireFrontmatter: options.requireFrontmatter ?? [],
    enforceLinkFormat: options.enforceLinkFormat ?? "none",
    cache: options.cache ?? false,
    cacheDir: options.cacheDir ?? ".markmv-cache",
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

  return opts;
}

/**
 * Create the git helper when any option needs git or the cache.
 *
 * Git-only options fail when the working directory is not a repository; the cache alone merely
 * loses its git commit stamp.
 */
export function createGitUtils(
  opts: ResolvedValidateOptions,
): GitUtils | undefined {
  const needsGit = opts.gitDiff !== "" || opts.gitStaged;
  if (!needsGit && !opts.cache) {
    return undefined;
  }

  const gitUtils = new GitUtils();
  if (gitUtils.isGitRepository()) {
    return gitUtils;
  }
  if (needsGit) {
    throw new Error("Git integration requires a git repository");
  }
  if (opts.verbose) {
    console.warn("Not in a git repository, disabling git integration");
  }

  return undefined;
}

/** Create the validation cache when requested and accessible */
export async function createCache(
  opts: ResolvedValidateOptions,
): Promise<ValidationCache | undefined> {
  if (!opts.cache) {
    return undefined;
  }
  const cache = new ValidationCache({ cacheDir: opts.cacheDir });
  if (await cache.isEnabled()) {
    return cache;
  }
  if (opts.verbose) {
    console.warn("Cache is not accessible, disabling caching");
  }

  return undefined;
}

/** The markdown files git reports as changed, excluding deletions */
function markdownPathsOf(changes: readonly GitFileChange[]): string[] {
  return changes
    .filter((change) => change.status !== "deleted")
    .map((change) => change.path)
    .filter((path) => path.endsWith(".md"));
}

/** Expand the validation glob patterns to markdown files, each pattern independently */
async function globMarkdownFiles(
  patterns: readonly string[],
  opts: ResolvedValidateOptions,
): Promise<string[]> {
  /* Glob patterns use forward slashes on every platform (backslashes are pattern escapes, not
     separators), so library callers passing host-native joined paths get them normalised exactly
     as the CLI already does. */
  const perPattern = await Promise.all(
    patterns.map(async (pattern) => {
      try {
        const globOptions: {
          absolute: boolean;
          ignore: string[];
          maxDepth?: number;
        } = {
          absolute: true,
          ignore: SCAN_IGNORE_PATTERNS,
        };
        if (typeof opts.maxDepth === "number") {
          globOptions.maxDepth = opts.maxDepth;
        }

        const normalizedPattern = pattern.replace(/\\/g, "/");
        const matches = await glob(normalizedPattern, globOptions);

        return matches.filter((f) => f.endsWith(".md"));
      } catch (error) {
        if (opts.verbose) {
          console.error(`Error processing pattern "${pattern}":`, error);
        }

        return [];
      }
    }),
  );

  return perPattern.flat();
}

/** The files to validate and, in git mode, the git summary that describes them */
interface ResolvedFiles {
  /** Absolute or repository-relative markdown paths to validate */
  files: string[];
  /** Git integration summary when git diff or staged mode selected the files */
  gitInfo?: ValidateResult["gitInfo"];
}

/** Resolve the files to validate from git state or from the glob patterns */
export async function resolveFiles(
  patterns: readonly string[],
  opts: ResolvedValidateOptions,
  gitUtils: GitUtils | undefined,
): Promise<ResolvedFiles> {
  if (opts.gitDiff !== "" && gitUtils) {
    const baseRef = opts.gitDiff;

    if (!gitUtils.refExists(baseRef)) {
      throw new Error(`Git reference '${baseRef}' does not exist`);
    }

    const files = markdownPathsOf(gitUtils.getChangedFiles(baseRef));
    if (opts.verbose) {
      console.log(
        `🔍 Git Integration: Found ${String(files.length)} changed markdown files since ${baseRef}`,
      );
    }

    return {
      files,
      gitInfo: {
        enabled: true,
        changedFiles: files.length,
        cachedFiles: 0,
        cacheHitRate: 0,
        baseRef,
        currentCommit: gitUtils.getStatus().commit,
      },
    };
  }

  if (opts.gitStaged && gitUtils) {
    const files = markdownPathsOf(gitUtils.getStagedFiles());
    if (opts.verbose) {
      console.log(
        `🔍 Git Integration: Found ${String(files.length)} staged markdown files`,
      );
    }

    return {
      files,
      gitInfo: {
        enabled: true,
        changedFiles: files.length,
        cachedFiles: 0,
        cacheHitRate: 0,
        currentCommit: gitUtils.getStatus().commit,
      },
    };
  }

  const files = await globMarkdownFiles(patterns, opts);
  if (opts.verbose) {
    console.log(`Found ${String(files.length)} markdown files to validate`);
  }

  return { files };
}

/**
 * In obsidian mode a wikilink resolves against the whole vault, so the resolver indexes every
 * file under the scan root, not only the files the patterns matched.
 */
async function createVaultResolver(
  files: readonly string[],
): Promise<ReturnType<typeof createWikilinkResolver> | undefined> {
  if (files.length === 0) {
    return undefined;
  }
  let vaultRoot = PathUtils.findCommonBase([...files]);
  if (vaultRoot === sep || /^[A-Za-z]:$/.test(vaultRoot)) {
    vaultRoot = dirname(files[0] ?? "");
  }
  if (vaultRoot === "") {
    return undefined;
  }

  /* The index covers every vault file, not only notes: embeds target images and PDFs by bare
     filename too */
  const vaultFilePaths = await FileUtils.listFiles(vaultRoot, {
    recursive: true,
  });

  return createWikilinkResolver(vaultRoot, vaultFilePaths);
}

/** Build the link validator the options describe, indexing the vault first in obsidian mode */
export async function createLinkValidator(
  opts: ResolvedValidateOptions,
  files: readonly string[],
): Promise<LinkValidator> {
  const wikilinkResolver = opts.obsidian
    ? await createVaultResolver(files)
    : undefined;

  return new LinkValidator({
    checkExternal: opts.checkExternal,
    externalTimeout: opts.externalTimeout,
    strictInternal: opts.strictInternal,
    checkClaudeImports: opts.checkClaudeImports,
    checkContentFreshness: opts.checkContentFreshness,
    freshnessConfig: {
      defaultThreshold: opts.freshnessThreshold * MS_PER_DAY,
    },
    enableAuthDetection: opts.enableAuthDetection,
    allowAuthRequired: opts.allowAuthRequired,
    authConfig: {
      credentials: opts.authCredentials ?? {},
      customHeaders: opts.authHeaders ?? {},
    },
    ...(wikilinkResolver === undefined
      ? {}
      : { checkWikilinks: true, wikilinkResolver }),
    skipDomains: opts.skipDomains,
    externalRetries: opts.externalRetries,
  });
}
