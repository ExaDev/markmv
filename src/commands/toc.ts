import { readFile, writeFile } from 'node:fs/promises';
import { TocGenerator } from '../utils/toc-generator.js';
import type { TocOptions } from '../utils/toc-generator.js';
import type { OperationOptions } from '../types/operations.js';

/**
 * Configuration options for TOC generation operations.
 *
 * Controls how table of contents is generated and inserted into markdown files.
 *
 * @category Commands
 */
export interface TocOperationOptions extends OperationOptions {
  /** Minimum heading level to include in TOC (1-6) */
  minDepth: number;
  /** Maximum heading level to include in TOC (1-6) */
  maxDepth: number;
  /** Include line numbers in TOC entries */
  includeLineNumbers: boolean;
  /** Position where to insert TOC: 'top' | 'after-title' | 'before-content' | 'replace' */
  position: 'top' | 'after-title' | 'before-content' | 'replace';
  /** Custom TOC title (default: "Table of Contents") */
  title: string;
  /** TOC heading level (1-6, default: 2) */
  headingLevel: number;
  /** Custom marker to find existing TOC for replacement */
  marker?: string;
  /** Skip files that don't have any headings */
  skipEmpty: boolean;
}

/**
 * CLI-specific options for the toc command.
 *
 * @category Commands
 */
export interface TocCliOptions extends Omit<TocOperationOptions, 'position'> {
  /** Position where to insert TOC */
  position?: string;
  /** Output results in JSON format */
  json?: boolean;
}

/**
 * Result of a TOC generation operation.
 *
 * @category Commands
 */
export interface TocResult {
  /** Number of files processed */
  filesProcessed: number;
  /** Number of files modified */
  filesModified: number;
  /** Number of files skipped (no headings) */
  filesSkipped: number;
  /** Files that had processing errors */
  fileErrors: Array<{ file: string; error: string }>;
  /** Processing time in milliseconds */
  processingTime: number;
  /** Details of each file processed */
  fileDetails: Array<{
    file: string;
    headingsFound: number;
    tocGenerated: boolean;
    tocLength: number;
    position: string;
  }>;
}

/**
 * Generate and insert table of contents into markdown files.
 *
 * Analyzes markdown files to extract headings and generates a formatted table of contents
 * that can be inserted at various positions within the file.
 *
 * @example
 *   Basic TOC generation
 *   ```typescript
 *   const result = await generateToc(['README.md'], {
 *     position: 'after-title',
 *     minDepth: 2,
 *     maxDepth: 4
 *   });
 *
 *   console.log(`Added TOC to ${result.filesModified} files`);
 *   ```
 *
 * @example
 *   Replace existing TOC
 *   ```typescript
 *   const result = await generateToc(['docs/*.md'], {
 *     position: 'replace',
 *     marker: '<!-- TOC -->',
 *     skipEmpty: true
 *   });
 *   ```
 *
 * @param filePaths - Array of file paths to process
 * @param options - TOC generation configuration options
 *
 * @returns Promise resolving to generation results
 */
export async function generateToc(
  filePaths: string[],
  options: Partial<TocOperationOptions> = {}
): Promise<TocResult> {
  const startTime = Date.now();

  const opts: Required<TocOperationOptions> = {
    minDepth: options.minDepth ?? 1,
    maxDepth: options.maxDepth ?? 6,
    includeLineNumbers: options.includeLineNumbers ?? false,
    position: options.position ?? 'after-title',
    title: options.title ?? 'Table of Contents',
    headingLevel: options.headingLevel ?? 2,
    marker: options.marker ?? '',
    skipEmpty: options.skipEmpty ?? true,
    dryRun: options.dryRun ?? false,
    verbose: options.verbose ?? false,
    force: options.force ?? false,
  };

  const tocGenerator = new TocGenerator();
  const result: TocResult = {
    filesProcessed: 0,
    filesModified: 0,
    filesSkipped: 0,
    fileErrors: [],
    processingTime: 0,
    fileDetails: [],
  };

  // Process each file
  for (const filePath of filePaths) {
    try {
      if (opts.verbose) {
        console.log(`Processing: ${filePath}`);
      }

      // Read file content
      const content = await readFile(filePath, 'utf-8');
      result.filesProcessed++;

      // Generate TOC
      const tocOptions: TocOptions = {
        minDepth: opts.minDepth,
        maxDepth: opts.maxDepth,
        includeLineNumbers: opts.includeLineNumbers,
      };

      const tocResult = await tocGenerator.generateToc(content, tocOptions);

      // Skip if no headings found and skipEmpty is true
      if (tocResult.headings.length === 0 && opts.skipEmpty) {
        if (opts.verbose) {
          console.log(`  Skipped: No headings found`);
        }
        result.filesSkipped++;
        result.fileDetails.push({
          file: filePath,
          headingsFound: 0,
          tocGenerated: false,
          tocLength: 0,
          position: 'none',
        });
        continue;
      }

      // Generate TOC markdown
      const tocMarkdown = generateTocMarkdown(tocResult.toc, opts.title, opts.headingLevel);
      
      // Insert TOC into content
      const modifiedContent = insertTocIntoContent(content, tocMarkdown, opts);

      // Write file if not dry run and content changed
      if (!opts.dryRun && modifiedContent !== content) {
        await writeFile(filePath, modifiedContent, 'utf-8');
        result.filesModified++;
        
        if (opts.verbose) {
          console.log(`  ✅ TOC added/updated`);
        }
      } else if (opts.dryRun) {
        if (opts.verbose) {
          console.log(`  Would add/update TOC`);
        }
        if (modifiedContent !== content) {
          result.filesModified++;
        }
      }

      result.fileDetails.push({
        file: filePath,
        headingsFound: tocResult.headings.length,
        tocGenerated: true,
        tocLength: tocResult.toc.length,
        position: opts.position,
      });

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

  result.processingTime = Date.now() - startTime;
  return result;
}

/**
 * Generate formatted TOC markdown with title and heading level.
 */
function generateTocMarkdown(toc: string, title: string, headingLevel: number): string {
  const headingPrefix = '#'.repeat(headingLevel);
  return `${headingPrefix} ${title}\n\n${toc}`;
}

/**
 * Insert TOC into content at the specified position.
 */
function insertTocIntoContent(
  content: string,
  tocMarkdown: string,
  options: Required<TocOperationOptions>
): string {
  const lines = content.split('\n');

  switch (options.position) {
    case 'top':
      return `${tocMarkdown}\n\n${content}`;

    case 'after-title':
      return insertAfterTitle(lines, tocMarkdown);

    case 'before-content':
      return insertBeforeContent(lines, tocMarkdown);

    case 'replace':
      return replaceExistingToc(content, tocMarkdown, options);

    default:
      throw new Error(`Invalid position: ${options.position}`);
  }
}

/**
 * Insert TOC after the first heading (title).
 */
function insertAfterTitle(lines: string[], tocMarkdown: string): string {
  const titleIndex = lines.findIndex(line => line.trim().startsWith('#'));
  
  if (titleIndex === -1) {
    // No title found, insert at top
    return `${tocMarkdown}\n\n${lines.join('\n')}`;
  }

  // Find the end of the title section (next empty line or content)
  let insertIndex = titleIndex + 1;
  while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
    insertIndex++;
  }

  // Insert TOC
  const before = lines.slice(0, insertIndex);
  const after = lines.slice(insertIndex);
  
  return [
    ...before,
    '',
    tocMarkdown,
    '',
    ...after
  ].join('\n');
}

/**
 * Insert TOC before the main content (after frontmatter if present).
 */
function insertBeforeContent(lines: string[], tocMarkdown: string): string {
  let insertIndex = 0;

  // Skip frontmatter if present
  if (lines[0]?.trim() === '---') {
    insertIndex = 1;
    while (insertIndex < lines.length && lines[insertIndex]?.trim() !== '---') {
      insertIndex++;
    }
    if (insertIndex < lines.length) {
      insertIndex++; // Skip closing ---
    }
  }

  // Skip empty lines
  while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
    insertIndex++;
  }

  // Insert TOC
  const before = lines.slice(0, insertIndex);
  const after = lines.slice(insertIndex);
  
  return [
    ...before,
    tocMarkdown,
    '',
    ...after
  ].join('\n');
}

/**
 * Replace existing TOC using marker or heuristic detection.
 */
function replaceExistingToc(
  content: string,
  tocMarkdown: string,
  options: Required<TocOperationOptions>
): string {
  // Try marker-based replacement first
  if (options.marker) {
    const markerRegex = new RegExp(`${escapeRegExp(options.marker)}[\\s\\S]*?${escapeRegExp(options.marker)}`, 'g');
    if (markerRegex.test(content)) {
      return content.replace(markerRegex, `${options.marker}\n${tocMarkdown}\n${options.marker}`);
    }
  }

  // Try to detect existing TOC by looking for "Table of Contents" heading
  const tocHeadingRegex = /^#{1,6}\s+table\s+of\s+contents\s*$/im;
  const match = content.match(tocHeadingRegex);
  
  if (match) {
    const lines = content.split('\n');
    const tocLineIndex = lines.findIndex(line => tocHeadingRegex.test(line));
    
    if (tocLineIndex !== -1) {
      // Find the end of the TOC (next heading or two consecutive empty lines)
      let endIndex = tocLineIndex + 1;
      let emptyLineCount = 0;
      
      while (endIndex < lines.length) {
        const line = lines[endIndex];
        
        // If we hit another heading, that's the end
        if (line.trim().startsWith('#')) {
          break;
        }
        
        // Count empty lines
        if (line.trim() === '') {
          emptyLineCount++;
          if (emptyLineCount >= 2) {
            break;
          }
        } else {
          emptyLineCount = 0;
        }
        
        endIndex++;
      }
      
      // Replace the TOC section
      const before = lines.slice(0, tocLineIndex);
      const after = lines.slice(endIndex);
      
      return [
        ...before,
        tocMarkdown,
        '',
        ...after
      ].join('\n');
    }
  }

  // If no existing TOC found, insert after title
  return insertAfterTitle(content.split('\n'), tocMarkdown);
}

/**
 * Escape special regex characters.
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * CLI command handler for TOC operations.
 *
 * Processes markdown files to generate and insert table of contents. Supports various
 * positioning options and customization.
 *
 * @example
 *   ```bash
 *   # Add TOC to a single file
 *   markmv toc README.md
 *
 *   # Add TOC to multiple files with custom options
 *   markmv toc docs/*.md --position after-title --min-depth 2 --max-depth 4
 *
 *   # Replace existing TOC using marker
 *   markmv toc file.md --position replace --marker "<!-- TOC -->"
 *   ```
 *
 * @param filePaths - Array of file paths to process
 * @param cliOptions - CLI-specific options
 */
export async function tocCommand(
  filePaths: string[],
  cliOptions: TocCliOptions
): Promise<void> {
  // Validate position option
  const validPositions: readonly TocOperationOptions['position'][] = [
    'top',
    'after-title',
    'before-content',
    'replace',
  ];
  const isValidPosition = (pos: string): pos is TocOperationOptions['position'] => {
    return pos === 'top' || pos === 'after-title' || pos === 'before-content' || pos === 'replace';
  };

  if (cliOptions.position && !isValidPosition(cliOptions.position)) {
    throw new Error(
      `Invalid position: ${cliOptions.position}. Must be one of: ${validPositions.join(', ')}`
    );
  }

  // Convert CLI options to internal options
  const options: TocOperationOptions = {
    ...cliOptions,
    position:
      cliOptions.position && isValidPosition(cliOptions.position)
        ? cliOptions.position
        : 'after-title',
  };

  try {
    const result = await generateToc(filePaths, options);

    if (cliOptions.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Format output for human consumption
    console.log(`\n📋 TOC Generation Summary`);
    console.log(`Files processed: ${result.filesProcessed}`);
    console.log(`Files modified: ${result.filesModified}`);
    console.log(`Files skipped: ${result.filesSkipped}`);
    console.log(`Processing time: ${result.processingTime}ms\n`);

    if (result.fileErrors.length > 0) {
      console.log(`⚠️  File Errors (${result.fileErrors.length}):`);
      for (const error of result.fileErrors) {
        console.log(`  ${error.file}: ${error.error}`);
      }
      console.log();
    }

    if (cliOptions.verbose) {
      console.log(`📄 File Details:`);
      for (const detail of result.fileDetails) {
        const status = detail.tocGenerated ? '✅' : '⏭️';
        console.log(`  ${status} ${detail.file}`);
        console.log(`    Headings: ${detail.headingsFound}, TOC lines: ${detail.tocLength}, Position: ${detail.position}`);
      }
    }

    if (result.filesModified === 0 && result.filesSkipped === 0) {
      console.log(`ℹ️  No files were modified`);
    } else if (result.filesModified > 0) {
      console.log(`✅ Successfully added/updated TOC in ${result.filesModified} files`);
    }

  } catch (error) {
    console.error('TOC generation failed:', error);
    process.exitCode = 1;
  }
}