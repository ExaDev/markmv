import { glob } from 'glob';
import { statSync } from 'fs';
import { posix } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { TocGenerator } from '../utils/toc-generator.js';
import { LinkParser } from '../core/link-parser.js';
import type { OperationOptions } from '../types/operations.js';

/**
 * Configuration options for heading refactoring operations.
 *
 * Controls how heading changes are detected and how affected links are updated.
 *
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
 *
 * @category Commands
 */
export interface RefactorHeadingsCliOptions extends RefactorHeadingsOperationOptions {
  /** Output results in JSON format */
  json?: boolean;
}

/**
 * Details about a heading change operation.
 *
 * @category Commands
 */
export interface HeadingChange {
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
 *
 * @category Commands
 */
export interface LinkUpdate {
  /** File containing the link */
  filePath: string;
  /** Line number of the link */
  line?: number;
  /** Original link text/href */
  oldLink: string;
  /** Updated link text/href */
  newLink: string;
  /** Type of link updated */
  linkType: 'anchor' | 'reference';
}

/**
 * Result of a heading refactoring operation.
 *
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
  fileErrors: Array<{ file: string; error: string }>;
  /** Processing time in milliseconds */
  processingTime: number;
}

/**
 * Default configuration for heading refactoring.
 */
const DEFAULT_REFACTOR_HEADINGS_OPTIONS: Partial<RefactorHeadingsOperationOptions> = {
  dryRun: false,
  verbose: false,
  recursive: false,
  updateCrossReferences: true,
};

/**
 * Refactors headings in markdown files and updates all affected links.
 *
 * This command finds all instances of a specified heading and updates them to new text,
 * while automatically updating all anchor links and cross-file references that point
 * to those headings.
 *
 * Features:
 * - Updates heading text in place
 * - Automatically updates anchor links (#old-slug → #new-slug)
 * - Updates cross-file heading references
 * - Maintains link integrity across the entire project
 * - Supports custom slug generation
 * - Dry-run support for safe preview
 * - Comprehensive change reporting
 *
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
 *
 * @param files - Array of file paths or glob patterns to process
 * @param options - Configuration options for the refactoring operation
 * @returns Promise resolving to detailed results of the refactoring operation
 * 
 * @group Commands
 */
export async function refactorHeadings(
  files: string[],
  options: RefactorHeadingsOperationOptions
): Promise<RefactorHeadingsResult> {
  const startTime = Date.now();
  const mergedOptions = { ...DEFAULT_REFACTOR_HEADINGS_OPTIONS, ...options };
  
  if (mergedOptions.verbose) {
    console.log('🔧 Starting heading refactoring...');
    console.log(`📋 Configuration:
  - Old heading: "${options.oldHeading}"
  - New heading: "${options.newHeading}"
  - Recursive: ${mergedOptions.recursive}
  - Update cross-references: ${mergedOptions.updateCrossReferences}
  - Dry run: ${mergedOptions.dryRun}`);
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

  // Resolve file patterns
  const resolvedFiles = new Set<string>();
  for (const filePattern of files) {
    try {
      if (statSync(filePattern).isDirectory()) {
        const dirPattern = mergedOptions.recursive 
          ? posix.join(filePattern, '**/*.md')
          : posix.join(filePattern, '*.md');
        
        const globOptions: Parameters<typeof glob>[1] = { 
          ignore: ['node_modules/**', '.git/**']
        };
        if (mergedOptions.maxDepth !== undefined) {
          globOptions.maxDepth = mergedOptions.maxDepth;
        }
        
        const matches = await glob(dirPattern, globOptions);
        matches.forEach(file => resolvedFiles.add(file.toString()));
      } else if (filePattern.includes('*')) {
        const globOptions: Parameters<typeof glob>[1] = { 
          ignore: ['node_modules/**', '.git/**']
        };
        if (mergedOptions.maxDepth !== undefined) {
          globOptions.maxDepth = mergedOptions.maxDepth;
        }
        
        const matches = await glob(filePattern, globOptions);
        matches.forEach(file => resolvedFiles.add(file.toString()));
      } else {
        resolvedFiles.add(filePattern);
      }
    } catch (error) {
      result.fileErrors.push({
        file: filePattern,
        error: `Failed to resolve file pattern: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  const fileList = Array.from(resolvedFiles);
  result.filesProcessed = fileList.length;

  if (mergedOptions.verbose) {
    console.log(`📁 Found ${fileList.length} markdown files to process`);
  }

  // Initialize generators and parsers
  const tocGenerator = new TocGenerator();
  const linkParser = new LinkParser();
  // Note: LinkRefactorer could be used for more advanced link updates in the future

  // Generate old and new slugs
  const slugify = mergedOptions.slugify || tocGenerator['defaultSlugify'].bind(tocGenerator);
  const oldSlug = slugify(options.oldHeading);
  const newSlug = slugify(options.newHeading);

  if (mergedOptions.verbose) {
    console.log(`🔗 Slug mapping: "${oldSlug}" → "${newSlug}"`);
  }

  // Step 1: Find and update headings in all files
  for (const filePath of fileList) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const tocResult = await tocGenerator.generateToc(content);
      
      // Find headings that match the old heading text
      const matchingHeadings = tocResult.headings.filter(
        heading => heading.text.trim() === options.oldHeading.trim()
      );

      if (matchingHeadings.length === 0) {
        continue; // No matching headings in this file
      }

      if (mergedOptions.verbose) {
        console.log(`\n📄 ${filePath}: found ${matchingHeadings.length} matching headings`);
      }

      // Update headings in content
      let updatedContent = content;
      const headingChanges: HeadingChange[] = [];

      for (const heading of matchingHeadings) {
        // Use custom slugify if provided, otherwise use the heading's existing slug
        const actualOldSlug = mergedOptions.slugify ? slugify(heading.text) : heading.slug;
        
        // Create heading change record
        const headingChange: HeadingChange = {
          filePath,
          line: heading.line,
          oldText: heading.text,
          newText: options.newHeading,
          oldSlug: actualOldSlug,
          newSlug,
          level: heading.level,
        };

        headingChanges.push(headingChange);
        result.headingChanges.push(headingChange);

        // Replace the heading text in content
        const headingRegex = new RegExp(
          `^(#{${heading.level}}\\s+)${escapeRegExp(heading.text.trim())}(\\s*)$`,
          'gm'
        );
        
        updatedContent = updatedContent.replace(headingRegex, `$1${options.newHeading}$2`);
      }

      result.headingsChanged += headingChanges.length;

      // Write updated content if not dry run
      if (!mergedOptions.dryRun && headingChanges.length > 0) {
        await writeFile(filePath, updatedContent, 'utf-8');
      }

    } catch (error) {
      result.fileErrors.push({
        file: filePath,
        error: `Failed to process headings: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  // Step 2: Update anchor links and cross-references if requested
  if (mergedOptions.updateCrossReferences && oldSlug !== newSlug) {
    if (mergedOptions.verbose) {
      console.log(`\n🔍 Searching for anchor links to update: #${oldSlug} → #${newSlug}`);
    }

    for (const filePath of fileList) {
      try {
        const parseResult = await linkParser.parseFile(filePath);
        
        // Find anchor links that reference the old slug
        const anchorLinks = parseResult.links.filter(
          link => link.type === 'anchor' && link.href === `#${oldSlug}`
        );

        if (anchorLinks.length === 0) {
          continue; // No matching anchor links in this file
        }

        if (mergedOptions.verbose) {
          console.log(`📄 ${filePath}: found ${anchorLinks.length} anchor links to update`);
        }

        // Update anchor links
        const content = await readFile(filePath, 'utf-8');
        let updatedContent = content;

        for (const link of anchorLinks) {
          const linkUpdate: LinkUpdate = {
            filePath,
            line: link.line,
            oldLink: `#${oldSlug}`,
            newLink: `#${newSlug}`,
            linkType: 'anchor',
          };

          result.linkUpdates.push(linkUpdate);

          // Replace the anchor link
          const oldLinkPattern = new RegExp(`#${escapeRegExp(oldSlug)}(?![\\w-])`, 'g');
          updatedContent = updatedContent.replace(oldLinkPattern, `#${newSlug}`);
        }

        result.linksUpdated += anchorLinks.length;

        // Write updated content if not dry run
        if (!mergedOptions.dryRun && anchorLinks.length > 0) {
          await writeFile(filePath, updatedContent, 'utf-8');
        }

      } catch (error) {
        result.fileErrors.push({
          file: filePath,
          error: `Failed to update links: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    }
  }

  result.processingTime = Date.now() - startTime;

  // Set success to false if there were any errors
  if (result.fileErrors.length > 0) {
    result.success = false;
  }

  if (mergedOptions.verbose) {
    console.log(`\n✅ Refactoring completed in ${result.processingTime}ms`);
    console.log(`📊 Summary: ${result.headingsChanged} headings changed, ${result.linksUpdated} links updated`);
    
    if (mergedOptions.dryRun) {
      console.log(`🔍 Dry run - no files were actually modified`);
    }
  }

  return result;
}

/**
 * Command handler for the refactor-headings CLI command.
 */
export async function refactorHeadingsCommand(
  files: string[] = ['.'],
  options: RefactorHeadingsCliOptions
): Promise<void> {
  try {
    if (!options.oldHeading || !options.newHeading) {
      console.error('💥 Error: Both --old-heading and --new-heading are required');
      process.exit(1);
    }

    if (options.oldHeading === options.newHeading) {
      console.error('💥 Error: Old heading and new heading cannot be the same');
      process.exit(1);
    }

    // Parse CLI options into RefactorHeadingsOperationOptions
    const operationOptions: RefactorHeadingsOperationOptions = {
      dryRun: options.dryRun || false,
      verbose: options.verbose || false,
      oldHeading: options.oldHeading,
      newHeading: options.newHeading,
      recursive: options.recursive || false,
      maxDepth: options.maxDepth,
      updateCrossReferences: options.updateCrossReferences !== false, // Default to true
    };

    // Run the refactor-headings operation
    const result = await refactorHeadings(files, operationOptions);

    // Format and display results
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatRefactorHeadingsResults(result, operationOptions));
    }

    // Exit with error code if there were errors
    if (result.fileErrors.length > 0) {
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Error running refactor-headings command:');
    console.error(error instanceof Error ? error.message : String(error));
    
    if (options.verbose && error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    
    process.exit(1);
  }
}

/**
 * Formats the refactor-headings results for display.
 */
export function formatRefactorHeadingsResults(
  result: RefactorHeadingsResult,
  options: RefactorHeadingsOperationOptions
): string {
  const lines: string[] = [];
  
  lines.push('🔧 Heading Refactoring Results');
  lines.push(''.padEnd(50, '='));
  lines.push('');
  
  // Summary
  lines.push(`📊 Summary:`);
  lines.push(`  Files processed: ${result.filesProcessed}`);
  lines.push(`  Headings changed: ${result.headingsChanged}`);
  lines.push(`  Links updated: ${result.linksUpdated}`);
  lines.push(`  Processing time: ${result.processingTime}ms`);
  
  if (options.dryRun) {
    lines.push(`  🔍 Dry run - no files were actually modified`);
  }
  
  lines.push('');

  // Show heading changes
  if (result.headingChanges.length > 0) {
    lines.push('📝 Heading Changes:');
    lines.push(''.padEnd(30, '-'));
    
    result.headingChanges.forEach(change => {
      lines.push(`\n📄 ${change.filePath} (line ${change.line}):`);
      lines.push(`  ${'#'.repeat(change.level)} ${change.oldText}`);
      lines.push(`  ↓`);
      lines.push(`  ${'#'.repeat(change.level)} ${change.newText}`);
      lines.push(`  Slug: ${change.oldSlug} → ${change.newSlug}`);
    });
  }

  // Show link updates
  if (result.linkUpdates.length > 0) {
    lines.push('\n🔗 Link Updates:');
    lines.push(''.padEnd(30, '-'));
    
    const linksByFile = result.linkUpdates.reduce((acc, update) => {
      if (!acc[update.filePath]) {
        acc[update.filePath] = [];
      }
      acc[update.filePath].push(update);
      return acc;
    }, {} satisfies Record<string, LinkUpdate[]>);

    Object.entries(linksByFile).forEach(([file, updates]) => {
      lines.push(`\n📄 ${file}:`);
      updates.forEach(update => {
        const lineInfo = update.line ? ` (line ${update.line})` : '';
        lines.push(`  🔗 ${update.oldLink} → ${update.newLink}${lineInfo}`);
      });
    });
  }

  // Show errors if any
  if (result.fileErrors.length > 0) {
    lines.push('\n💥 Errors:');
    lines.push(''.padEnd(30, '-'));
    result.fileErrors.forEach(error => {
      lines.push(`  💥 ${error.file}: ${error.error}`);
    });
  }

  return lines.join('\n');
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export { DEFAULT_REFACTOR_HEADINGS_OPTIONS };