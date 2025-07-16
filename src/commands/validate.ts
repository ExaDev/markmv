import { glob } from 'glob';
import { statSync } from 'fs';
import { posix } from 'path';
import { LinkValidator } from '../core/link-validator.js';
import { LinkParser } from '../core/link-parser.js';
import type { LinkType } from '../types/links.js';
import type { BrokenLink } from '../types/config.js';
import type { OperationOptions } from '../types/operations.js';

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
  fileErrors: Array<{ file: string; error: string }>;
  /** Whether circular references were detected */
  hasCircularReferences: boolean;
  /** Circular reference details if found */
  circularReferences?: string[];
  /** Processing time in milliseconds */
  processingTime: number;
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

  const opts: Required<ValidateOperationOptions> = {
    linkTypes: options.linkTypes || [
      'internal',
      'external',
      'anchor',
      'image',
      'reference',
      'claude-import',
    ],
    checkExternal: options.checkExternal ?? false,
    externalTimeout: options.externalTimeout ?? 5000,
    strictInternal: options.strictInternal ?? true,
    checkClaudeImports: options.checkClaudeImports ?? true,
    checkCircular: options.checkCircular ?? false,
    maxDepth: options.maxDepth,
    onlyBroken: options.onlyBroken ?? true,
    groupBy: options.groupBy ?? 'file',
    includeContext: options.includeContext ?? false,
    dryRun: options.dryRun ?? false,
    verbose: options.verbose ?? false,
    force: options.force ?? false,
  };

  // Resolve file patterns to actual file paths
  const files: string[] = [];
  for (const pattern of patterns) {
    try {
      const globOptions: { absolute: boolean; ignore: string[]; maxDepth?: number } = {
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
      };
      if (typeof opts.maxDepth === 'number') {
        globOptions.maxDepth = opts.maxDepth;
      }

      const matches = await glob(pattern, globOptions);
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

  // Initialize validator and parser
  const validator = new LinkValidator({
    checkExternal: opts.checkExternal,
    externalTimeout: opts.externalTimeout,
    strictInternal: opts.strictInternal,
    checkClaudeImports: opts.checkClaudeImports,
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
  };

  // Initialize broken links by type
  for (const linkType of opts.linkTypes) {
    result.brokenLinksByType[linkType] = [];
  }

  // Process each file
  for (const filePath of files) {
    try {
      if (opts.verbose) {
        console.log(`Validating: ${filePath}`);
      }

      // Parse links from file
      const parsedFile = await parser.parseFile(filePath);
      const relevantLinks = parsedFile.links.filter((link) => opts.linkTypes.includes(link.type));

      result.totalLinks += relevantLinks.length;
      result.filesProcessed++;

      if (relevantLinks.length === 0) {
        continue;
      }

      // Validate links
      const validation = await validator.validateLinks(relevantLinks, filePath);
      const brokenLinks = validation.brokenLinks;

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
      }
    } catch (error) {
      result.fileErrors.push({
        file: filePath,
        error: error instanceof Error ? error.message : String(error),
      });

      if (opts.verbose) {
        console.error(`Error processing ${filePath}:`, error);
      }
    }
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
  cliOptions: ValidateCliOptions
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
            ['internal', 'external', 'anchor', 'image', 'reference', 'claude-import'].includes(t)
          )
      : ['internal', 'external', 'anchor', 'image', 'reference', 'claude-import'],
  };

  try {
    const result = await validateLinks(finalPatterns, options);

    if (cliOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Format output for human consumption
    console.log(`\n📊 Validation Summary`);
    console.log(`Files processed: ${result.filesProcessed}`);
    console.log(`Total links found: ${result.totalLinks}`);
    console.log(`Broken links: ${result.brokenLinks}`);
    console.log(`Processing time: ${result.processingTime}ms\n`);

    if (result.fileErrors.length > 0) {
      console.log(`⚠️  File Errors (${result.fileErrors.length}):`);
      for (const error of result.fileErrors) {
        console.log(`  ${error.file}: ${error.error}`);
      }
      console.log();
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
            console.log(`    ❌ ${brokenLink.url}${context}${file}`);
            if (brokenLink.reason && options.verbose) {
              console.log(`       Reason: ${brokenLink.reason}`);
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
          console.log(`    ❌ [${brokenLink.type}] ${brokenLink.url}${context}`);
          if (brokenLink.reason && options.verbose) {
            console.log(`       Reason: ${brokenLink.reason}`);
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
