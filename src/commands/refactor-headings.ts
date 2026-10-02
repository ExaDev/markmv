import { glob, type GlobOptionsWithFileTypesFalse } from "glob";
import { statSync } from "fs";
import { posix } from "path";
import { readFile, writeFile } from "fs/promises";
import { TocGenerator } from "../utils/toc-generator.js";
import { LinkParser } from "../core/link-parser.js";
import type { OperationOptions } from "../types/operations.js";

/**
 * Configuration options for heading refactoring operations.
 *
 * Controls how heading changes are detected and how affected links are updated.
 * @category Commands
 */
export interface RefactorHeadingsOperationOptions extends OperationOptions {
  /** The original heading text to find and replace */
  oldHeading: string;
  /** The new heading text to replace with */
  newHeading: string;
  /** Process directories recursively */
  recursive?: boolean;
  /** Maximum depth to traverse subdirectories */
  maxDepth?: number;
  /** Custom slug generator function */
  slugify?: (text: string) => string;
  /** Update cross-file references */
  updateCrossReferences?: boolean;
}

/**
 * CLI-specific options for the refactor-headings command.
 * @category Commands
 */
export interface RefactorHeadingsCliOptions extends RefactorHeadingsOperationOptions {
  /** Output results in JSON format */
  json?: boolean;
}

/**
 * Details about a heading change operation.
 * @category Commands
 */
interface HeadingChange {
  /** File containing the heading */
  filePath: string;
  /** Line number of the heading */
  line: number;
  /** Original heading text */
  oldText: string;
  /** New heading text */
  newText: string;
  /** Original slug */
  oldSlug: string;
  /** New slug */
  newSlug: string;
  /** Heading level */
  level: number;
}

/**
 * Details about a link update operation.
 * @category Commands
 */
interface LinkUpdate {
  /** File containing the link */
  filePath: string;
  /** Line number of the link */
  line?: number;
  /** Original link text/href */
  oldLink: string;
  /** Updated link text/href */
  newLink: string;
  /** Type of link updated */
  linkType: "anchor" | "reference";
}

/**
 * Result of a heading refactoring operation.
 * @category Commands
 */
export interface RefactorHeadingsResult {
  /** Whether the operation completed successfully */
  success: boolean;
  /** Number of files processed */
  filesProcessed: number;
  /** Number of headings changed */
  headingsChanged: number;
  /** Number of links updated */
  linksUpdated: number;
  /** Detailed heading changes */
  headingChanges: HeadingChange[];
  /** Detailed link updates */
  linkUpdates: LinkUpdate[];
  /** Files that had processing errors */
  fileErrors: { file: string; error: string }[];
  /** Processing time in milliseconds */
  processingTime: number;
}

/** Default configuration for heading refactoring. */
const DEFAULT_REFACTOR_HEADINGS_OPTIONS: Partial<RefactorHeadingsOperationOptions> =
  {
    dryRun: false,
    verbose: false,
    recursive: false,
    updateCrossReferences: true,
  };

/** Glob patterns never descended into when expanding a directory or glob argument. */
const GLOB_IGNORE_PATTERNS = ["node_modules/**", ".git/**"];

/** Width of the rule under the results title. */
const TITLE_RULE_WIDTH = 50;

/** Width of the rule under each results section heading. */
const SECTION_RULE_WIDTH = 30;

/** Outcome of processing one file: the changes made, and the error that stopped processing, if any. */
interface FileOutcome<Change> {
  filePath: string;
  /** Changes recorded for the file, including those whose write then failed. */
  changes: Change[];
  error: string | undefined;
}

interface HeadingRefactorContext {
  readonly oldHeading: string;
  readonly newHeading: string;
  readonly newSlug: string;
  readonly slugify: (text: string) => string;
  /** Whether the caller supplied a slug generator, in which case the old slug is recomputed per heading. */
  readonly hasCustomSlugify: boolean;
  readonly tocGenerator: TocGenerator;
  readonly verbose: boolean;
  readonly dryRun: boolean;
}

interface AnchorRefactorContext {
  readonly oldSlug: string;
  readonly newSlug: string;
  readonly linkParser: LinkParser;
  readonly verbose: boolean;
  readonly dryRun: boolean;
}

/**
 * Expands one file argument into the markdown files it names: a directory yields its markdown files, a glob pattern its matches and a plain path itself.
 * @throws When the path cannot be statted or the glob fails.
 */
async function expandFilePattern(
  filePattern: string,
  settings: Readonly<{ recursive: boolean; maxDepth: number | undefined }>,
): Promise<string[]> {
  let globPattern: string;
  if (statSync(filePattern).isDirectory()) {
    globPattern = settings.recursive
      ? posix.join(filePattern, "**/*.md")
      : posix.join(filePattern, "*.md");
  } else if (filePattern.includes("*")) {
    globPattern = filePattern;
  } else {
    return [filePattern];
  }

  const globOptions: GlobOptionsWithFileTypesFalse = {
    ignore: GLOB_IGNORE_PATTERNS,
  };
  if (settings.maxDepth !== undefined) {
    globOptions.maxDepth = settings.maxDepth;
  }

  return glob(globPattern, globOptions);
}

/** Rewrites every heading in one file whose text matches the old heading, writing the file unless this is a dry run. */
async function updateHeadingsInFile(
  filePath: string,
  context: Readonly<HeadingRefactorContext>,
): Promise<FileOutcome<HeadingChange>> {
  const headingChanges: HeadingChange[] = [];
  try {
    const content = await readFile(filePath, "utf-8");
    const tocResult = context.tocGenerator.generateToc(content);

    // Find headings that match the old heading text
    const matchingHeadings = tocResult.headings.filter(
      (heading) => heading.text.trim() === context.oldHeading.trim(),
    );

    if (matchingHeadings.length === 0) {
      return { filePath, changes: headingChanges, error: undefined };
    }

    if (context.verbose) {
      console.log(
        `\n📄 ${filePath}: found ${String(matchingHeadings.length)} matching headings`,
      );
    }

    // Update headings in content
    let updatedContent = content;

    for (const heading of matchingHeadings) {
      // Use custom slugify if provided, otherwise use the heading's existing slug
      const actualOldSlug = context.hasCustomSlugify
        ? context.slugify(heading.text)
        : heading.slug;

      headingChanges.push({
        filePath,
        line: heading.line,
        oldText: heading.text,
        newText: context.newHeading,
        oldSlug: actualOldSlug,
        newSlug: context.newSlug,
        level: heading.level,
      });

      // Replace the heading text in content
      const headingRegex = new RegExp(
        `^(#{${String(heading.level)}}\\s+)${escapeRegExp(heading.text.trim())}(\\s*)$`,
        "gm",
      );

      updatedContent = updatedContent.replace(
        headingRegex,
        `$1${context.newHeading}$2`,
      );
    }

    // Write updated content if not dry run
    if (!context.dryRun) {
      await writeFile(filePath, updatedContent, "utf-8");
    }

    return { filePath, changes: headingChanges, error: undefined };
  } catch (error) {
    return {
      filePath,
      changes: headingChanges,
      error: `Failed to process headings: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** Rewrites every anchor link in one file that points at the old slug, writing the file unless this is a dry run. */
async function updateAnchorLinksInFile(
  filePath: string,
  context: Readonly<AnchorRefactorContext>,
): Promise<FileOutcome<LinkUpdate>> {
  const linkUpdates: LinkUpdate[] = [];
  try {
    const parseResult = await context.linkParser.parseFile(filePath);

    // Find anchor links that reference the old slug
    const anchorLinks = parseResult.links.filter(
      (link) => link.type === "anchor" && link.href === `#${context.oldSlug}`,
    );

    if (anchorLinks.length === 0) {
      return { filePath, changes: linkUpdates, error: undefined };
    }

    if (context.verbose) {
      console.log(
        `📄 ${filePath}: found ${String(anchorLinks.length)} anchor links to update`,
      );
    }

    // Update anchor links
    const content = await readFile(filePath, "utf-8");
    let updatedContent = content;

    for (const link of anchorLinks) {
      linkUpdates.push({
        filePath,
        line: link.line,
        oldLink: `#${context.oldSlug}`,
        newLink: `#${context.newSlug}`,
        linkType: "anchor",
      });

      // Replace the anchor link
      const oldLinkPattern = new RegExp(
        `#${escapeRegExp(context.oldSlug)}(?![\\w-])`,
        "g",
      );
      updatedContent = updatedContent.replace(
        oldLinkPattern,
        `#${context.newSlug}`,
      );
    }

    // Write updated content if not dry run
    if (!context.dryRun) {
      await writeFile(filePath, updatedContent, "utf-8");
    }

    return { filePath, changes: linkUpdates, error: undefined };
  } catch (error) {
    return {
      filePath,
      changes: linkUpdates,
      error: `Failed to update links: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Refactors headings in markdown files and updates all affected links.
 *
 * This command finds all instances of a specified heading and updates them to new text, while
 * automatically updating all anchor links and cross-file references that point to those headings.
 *
 * Features:
 *
 * - Updates heading text in place
 * - Automatically updates anchor links (#old-slug → #new-slug)
 * - Updates cross-file heading references
 * - Maintains link integrity across the entire project
 * - Supports custom slug generation
 * - Dry-run support for safe preview
 * - Comprehensive change reporting
 * @example
 * ```typescript
 * // Basic heading refactoring
 * const result = await refactorHeadings(['docs/'], {
 *   oldHeading: 'API Reference',
 *   newHeading: 'API Documentation',
 *   recursive: true
 * });
 *
 * // With custom slug generation
 * const result = await refactorHeadings(['README.md'], {
 *   oldHeading: 'Getting Started',
 *   newHeading: 'Quick Start Guide',
 *   slugify: (text) => text.toLowerCase().replace(/\s+/g, '_')
 * });
 * ```
 * @param files - Array of file paths or glob patterns to process
 * @param options - Configuration options for the refactoring operation
 * @returns Promise resolving to detailed results of the refactoring operation
 */
export async function refactorHeadings(
  files: readonly string[],
  options: Readonly<RefactorHeadingsOperationOptions>,
): Promise<RefactorHeadingsResult> {
  const startTime = Date.now();
  const mergedOptions = { ...DEFAULT_REFACTOR_HEADINGS_OPTIONS, ...options };

  if (mergedOptions.verbose === true) {
    console.log("🔧 Starting heading refactoring...");
    console.log(`📋 Configuration:
  - Old heading: "${options.oldHeading}"
  - New heading: "${options.newHeading}"
  - Recursive: ${String(mergedOptions.recursive)}
  - Update cross-references: ${String(mergedOptions.updateCrossReferences)}
  - Dry run: ${String(mergedOptions.dryRun)}`);
  }

  // Initialize result structure
  const result: RefactorHeadingsResult = {
    success: true,
    filesProcessed: 0,
    headingsChanged: 0,
    linksUpdated: 0,
    headingChanges: [],
    linkUpdates: [],
    fileErrors: [],
    processingTime: 0,
  };

  const pattern = {
    recursive: mergedOptions.recursive === true,
    maxDepth: mergedOptions.maxDepth,
  };
  const expansions = await Promise.all(
    files.map(async (filePattern) => {
      try {
        return {
          filePattern,
          matches: await expandFilePattern(filePattern, pattern),
          error: undefined,
        };
      } catch (error) {
        return {
          filePattern,
          matches: [],
          error: `Failed to resolve file pattern: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }),
  );

  const resolvedFiles = new Set<string>();
  for (const expansion of expansions) {
    if (expansion.error !== undefined) {
      result.fileErrors.push({
        file: expansion.filePattern,
        error: expansion.error,
      });
      continue;
    }
    for (const file of expansion.matches) {
      resolvedFiles.add(file);
    }
  }

  const fileList = Array.from(resolvedFiles);
  result.filesProcessed = fileList.length;

  if (mergedOptions.verbose === true) {
    console.log(
      `📁 Found ${String(fileList.length)} markdown files to process`,
    );
  }

  // Initialize generators and parsers
  const tocGenerator = new TocGenerator();
  const linkParser = new LinkParser();
  // Note: LinkRefactorer could be used for more advanced link updates in the future

  // Generate old and new slugs
  const slugify = mergedOptions.slugify ?? defaultSlugify;
  const oldSlug = slugify(options.oldHeading);
  const newSlug = slugify(options.newHeading);

  if (mergedOptions.verbose === true) {
    console.log(`🔗 Slug mapping: "${oldSlug}" → "${newSlug}"`);
  }

  const verbose = mergedOptions.verbose === true;
  const dryRun = mergedOptions.dryRun === true;

  // Step 1: Find and update headings in all files
  const headingContext: HeadingRefactorContext = {
    oldHeading: options.oldHeading,
    newHeading: options.newHeading,
    newSlug,
    slugify,
    hasCustomSlugify: mergedOptions.slugify !== undefined,
    tocGenerator,
    verbose,
    dryRun,
  };
  const headingOutcomes = await Promise.all(
    fileList.map(async (filePath) =>
      updateHeadingsInFile(filePath, headingContext),
    ),
  );
  for (const outcome of headingOutcomes) {
    result.headingChanges.push(...outcome.changes);
    result.headingsChanged += outcome.changes.length;
    if (outcome.error !== undefined) {
      result.fileErrors.push({ file: outcome.filePath, error: outcome.error });
    }
  }

  // Step 2: Update anchor links and cross-references if requested
  if (mergedOptions.updateCrossReferences === true && oldSlug !== newSlug) {
    if (verbose) {
      console.log(
        `\n🔍 Searching for anchor links to update: #${oldSlug} → #${newSlug}`,
      );
    }

    const anchorContext: AnchorRefactorContext = {
      oldSlug,
      newSlug,
      linkParser,
      verbose,
      dryRun,
    };
    const anchorOutcomes = await Promise.all(
      fileList.map(async (filePath) =>
        updateAnchorLinksInFile(filePath, anchorContext),
      ),
    );
    for (const outcome of anchorOutcomes) {
      result.linkUpdates.push(...outcome.changes);
      result.linksUpdated += outcome.changes.length;
      if (outcome.error !== undefined) {
        result.fileErrors.push({
          file: outcome.filePath,
          error: outcome.error,
        });
      }
    }
  }

  result.processingTime = Date.now() - startTime;

  // Set success to false if there were any errors
  if (result.fileErrors.length > 0) {
    result.success = false;
  }

  if (mergedOptions.verbose === true) {
    console.log(
      `\n✅ Refactoring completed in ${String(result.processingTime)}ms`,
    );
    console.log(
      `📊 Summary: ${String(result.headingsChanged)} headings changed, ${String(result.linksUpdated)} links updated`,
    );

    if (mergedOptions.dryRun === true) {
      console.log(`🔍 Dry run - no files were actually modified`);
    }
  }

  return result;
}

/** Command handler for the refactor-headings CLI command. */
export async function refactorHeadingsCommand(
  files: readonly string[] = ["."],
  options: Readonly<RefactorHeadingsCliOptions>,
): Promise<void> {
  try {
    if (!options.oldHeading || !options.newHeading) {
      console.error(
        "💥 Error: Both --old-heading and --new-heading are required",
      );
      process.exit(1);
    }

    if (options.oldHeading === options.newHeading) {
      console.error("💥 Error: Old heading and new heading cannot be the same");
      process.exit(1);
    }

    // Parse CLI options into RefactorHeadingsOperationOptions
    const operationOptions: RefactorHeadingsOperationOptions = {
      dryRun: options.dryRun ?? false,
      verbose: options.verbose ?? false,
      oldHeading: options.oldHeading,
      newHeading: options.newHeading,
      recursive: options.recursive ?? false,
      // Default to true
      updateCrossReferences: options.updateCrossReferences !== false,
    };
    if (options.maxDepth !== undefined) {
      operationOptions.maxDepth = options.maxDepth;
    }

    // Run the refactor-headings operation
    const result = await refactorHeadings(files, operationOptions);

    // Format and display results
    if (options.json === true) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatRefactorHeadingsResults(result, operationOptions));
    }

    // Exit with error code if there were errors
    if (result.fileErrors.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("💥 Error running refactor-headings command:");
    console.error(error instanceof Error ? error.message : String(error));

    if (
      options.verbose === true &&
      error instanceof Error &&
      error.stack !== undefined &&
      error.stack !== ""
    ) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }

    process.exit(1);
  }
}

/** Formats the refactor-headings results for display. */
export function formatRefactorHeadingsResults(
  result: RefactorHeadingsResult,
  options: Readonly<RefactorHeadingsOperationOptions>,
): string {
  const lines: string[] = [];

  lines.push("🔧 Heading Refactoring Results");
  lines.push("".padEnd(TITLE_RULE_WIDTH, "="));
  lines.push("");

  // Summary
  lines.push(`📊 Summary:`);
  lines.push(`  Files processed: ${String(result.filesProcessed)}`);
  lines.push(`  Headings changed: ${String(result.headingsChanged)}`);
  lines.push(`  Links updated: ${String(result.linksUpdated)}`);
  lines.push(`  Processing time: ${String(result.processingTime)}ms`);

  if (options.dryRun === true) {
    lines.push(`  🔍 Dry run - no files were actually modified`);
  }

  lines.push("");

  // Show heading changes
  if (result.headingChanges.length > 0) {
    lines.push("📝 Heading Changes:");
    lines.push("".padEnd(SECTION_RULE_WIDTH, "-"));

    result.headingChanges.forEach((change) => {
      lines.push(`\n📄 ${change.filePath} (line ${String(change.line)}):`);
      lines.push(`  ${"#".repeat(change.level)} ${change.oldText}`);
      lines.push(`  ↓`);
      lines.push(`  ${"#".repeat(change.level)} ${change.newText}`);
      lines.push(`  Slug: ${change.oldSlug} → ${change.newSlug}`);
    });
  }

  // Show link updates
  if (result.linkUpdates.length > 0) {
    lines.push("\n🔗 Link Updates:");
    lines.push("".padEnd(SECTION_RULE_WIDTH, "-"));

    const linksByFile = new Map<string, LinkUpdate[]>();
    for (const update of result.linkUpdates) {
      const existing = linksByFile.get(update.filePath);
      if (existing === undefined) {
        linksByFile.set(update.filePath, [update]);
      } else {
        existing.push(update);
      }
    }

    linksByFile.forEach((updates, file) => {
      lines.push(`\n📄 ${file}:`);
      updates.forEach((update) => {
        const lineInfo =
          update.line !== undefined && update.line !== 0
            ? ` (line ${String(update.line)})`
            : "";
        lines.push(`  🔗 ${update.oldLink} → ${update.newLink}${lineInfo}`);
      });
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

/** Escapes special regex characters in a string. */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Default slugify function, matching {@link TocGenerator}'s own default so that computed slugs agree
 * with the slugs it assigns to headings when no custom `slugify` option is supplied.
 */
function defaultSlugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
