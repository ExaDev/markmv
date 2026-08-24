import { existsSync, statSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { glob } from 'glob';
import { PathUtils } from '../utils/path-utils.js';
import { FileUtils } from '../utils/file-utils.js';
import {
  findLocalImages,
  imageMimeTypeForExtension,
  renderImageMarkdown,
  replaceSpans,
  type ImageLinkOccurrence,
} from '../core/image-inline.js';

/**
 * Configuration options for embed command operations.
 *
 * Controls the behaviour of the embed command, which inlines local image files as base64 data URIs.
 *
 * @category Commands
 */
export interface EmbedOptions {
  /** Perform a dry run without making actual changes */
  dryRun?: boolean;
  /** Enable verbose output with detailed progress information */
  verbose?: boolean;
  /** Output results in JSON format instead of the human-readable summary */
  json?: boolean;
}

/**
 * Summary of an embed run, in the shape emitted by `--json`.
 *
 * @category Commands
 */
export interface EmbedSummary {
  /** Always "embed", so JSON consumers can identify the command */
  command: 'embed';
  /** Whether the run completed without errors */
  success: boolean;
  /** Whether this was a dry run, so no files were touched */
  dryRun: boolean;
  /** Number of markdown files examined */
  filesProcessed: number;
  /** Markdown files whose content was rewritten (empty in a dry run) */
  filesModified: string[];
  /** Number of image links rewritten to data URIs */
  imagesEmbedded: number;
  /** Image files removed because nothing in the processed set references them (empty in a dry run) */
  imagesDeleted: string[];
  /** Image files kept because a file in the processed set still references them */
  imagesKept: string[];
  /** Error messages, one per failure */
  errors: string[];
  /** Warning messages */
  warnings: string[];
}

/** The outcome of embedding images in a single markdown file. */
interface EmbedFileResult {
  /** Error message when the file could not be fully processed, otherwise undefined */
  error: string | undefined;
  /** Absolute paths of the image files that were inlined into this file */
  embeddedImages: string[];
  /** The occurrences that were (or in a dry run, would be) rewritten */
  rewrites: { file: string; href: string }[];
}

/**
 * CLI command handler for embed operations.
 *
 * Converts linked local images in markdown files to inline base64 data URIs. Each referenced image
 * file is read, base64-encoded, and the markdown link rewritten to the data URI. An image file is
 * removed once no file in the processed set references it any more.
 *
 * @category Commands
 *
 * @example
 *   ```bash # Inline every local image in a document markmv embed doc.md
 *
 *   # Preview the rewrites without touching anything markmv embed docs/*.md --dry-run ```;
 *
 * @param patterns - File patterns to process (supports globs)
 * @param options - Command options
 *
 * @throws Will exit the process with code 1 if the operation fails
 */
export async function embedCommand(patterns: string[], options: EmbedOptions): Promise<void> {
  if (patterns.length === 0) {
    reportUsageError(options, 'At least one file pattern must be specified');
  }

  const files = await expandMarkdownPatterns(patterns);

  if (files.length === 0) {
    reportUsageError(options, `No markdown files found matching: ${patterns.join(', ')}`);
  }

  const summary: EmbedSummary = {
    command: 'embed',
    success: true,
    dryRun: options.dryRun === true,
    filesProcessed: files.length,
    filesModified: [],
    imagesEmbedded: 0,
    imagesDeleted: [],
    imagesKept: [],
    errors: [],
    warnings: [],
  };

  const humanOutput = options.json !== true;
  if (options.dryRun && humanOutput) {
    console.log('🔍 Dry run - no files will be modified');
  }

  const embeddedImages: string[] = [];

  for (const file of files) {
    if (options.verbose && humanOutput) {
      console.log(`📄 Processing ${file}`);
    }
    const result = await embedFile(file, options.dryRun === true);
    if (result.error !== undefined) {
      summary.errors.push(result.error);
      summary.success = false;
      if (humanOutput) {
        console.error(`❌ ${result.error}`);
      }
      continue;
    }

    for (const rewrite of result.rewrites) {
      summary.imagesEmbedded++;
      if (humanOutput && options.dryRun) {
        console.log(`🔍 Would embed "${rewrite.href}" in ${rewrite.file}`);
      }
    }
    if (result.rewrites.length > 0 && options.dryRun !== true) {
      summary.filesModified.push(file);
      if (humanOutput) {
        console.log(`✅ Embedded ${String(result.rewrites.length)} image(s) in ${file}`);
      }
      embeddedImages.push(...result.embeddedImages);
    }
  }

  if (options.dryRun !== true) {
    const deletions = await deleteUnreferencedImages([...new Set(embeddedImages)], files);
    summary.imagesDeleted.push(...deletions.deleted);
    summary.imagesKept.push(...deletions.kept);
    if (humanOutput) {
      for (const deleted of deletions.deleted) {
        console.log(`🗑️  Deleted ${deleted} (no longer referenced)`);
      }
      for (const kept of deletions.kept) {
        console.log(`📁 Kept ${kept} (still referenced in the processed set)`);
      }
      for (const keptOutside of deletions.keptOutside) {
        console.log(`📁 Kept ${keptOutside}`);
      }
    }
  }

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else if (summary.success) {
    console.log(
      `📊 Summary: embedded ${String(summary.imagesEmbedded)} image(s) across ${String(summary.filesModified.length)} file(s)`
    );
    if (options.dryRun) {
      console.log('(Dry run - no files were actually modified)');
    }
  }

  if (!summary.success) {
    process.exit(1);
  }
}

/** Report a usage-stopping error in the mode-appropriate format and exit. */
function reportUsageError(options: EmbedOptions, message: string): never {
  if (options.json) {
    const summary: EmbedSummary = {
      command: 'embed',
      success: false,
      dryRun: options.dryRun === true,
      filesProcessed: 0,
      filesModified: [],
      imagesEmbedded: 0,
      imagesDeleted: [],
      imagesKept: [],
      errors: [message],
      warnings: [],
    };
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.error(`❌ Error: ${message}`);
    console.error('Usage: markmv embed <files...>');
  }
  process.exit(1);
}

/**
 * Expand file patterns to markdown file paths, following the convert command's expansion rules.
 *
 * A pattern may be a direct file path, a directory (expanded to the markdown files directly inside
 * it), or a glob pattern. Non-markdown results are skipped so an image pattern never enters the
 * markdown file set.
 *
 * @param patterns - File patterns, paths, or directories to expand
 *
 * @returns Promise resolving to sorted, de-duplicated absolute markdown file paths
 */
async function expandMarkdownPatterns(patterns: string[]): Promise<string[]> {
  const resolvedFiles = new Set<string>();

  for (const pattern of patterns) {
    const absolutePattern = resolve(pattern);

    if (existsSync(absolutePattern) && statSync(absolutePattern).isFile()) {
      if (PathUtils.isMarkdownFile(absolutePattern)) {
        resolvedFiles.add(absolutePattern);
      } else {
        console.warn(`⚠️  Skipping non-markdown file: ${absolutePattern}`);
      }
      continue;
    }

    if (existsSync(absolutePattern) && statSync(absolutePattern).isDirectory()) {
      // Glob patterns use forward slashes on every platform; backslashes are pattern escapes
      const files = await glob(`${absolutePattern.replace(/\\/g, '/')}/*.md`, { absolute: true });
      files.forEach((file) => resolvedFiles.add(file));
      continue;
    }

    const globFiles = await glob(pattern.replace(/\\/g, '/'), {
      ignore: ['node_modules/**', '.git/**', 'dist/**'],
      absolute: true,
      nodir: true,
    });
    globFiles
      .filter((file) => PathUtils.isMarkdownFile(file))
      .forEach((file) => resolvedFiles.add(file));
  }

  return [...resolvedFiles].sort();
}

/**
 * Inline every local image link in one markdown file as a base64 data URI.
 *
 * A failure on any image leaves the file untouched: rewrites are applied only once every image in
 * the file has been read and encoded.
 *
 * @param file - Absolute path of the markdown file
 * @param dryRun - Plan the rewrite without writing the file
 *
 * @returns The outcome, with an error message in place of a thrown exception so sibling files are
 *   still processed
 */
async function embedFile(file: string, dryRun: boolean): Promise<EmbedFileResult> {
  const content = await readFile(file, 'utf-8');
  const images = findLocalImages(content);
  if (images.length === 0) {
    return { error: undefined, embeddedImages: [], rewrites: [] };
  }

  const replacements = [];
  const embeddedImages: string[] = [];
  for (const image of images) {
    const outcome = await encodeImage(image, file);
    if (typeof outcome === 'string') {
      return { error: outcome, embeddedImages: [], rewrites: [] };
    }
    replacements.push({
      start: image.start,
      end: image.end,
      replacement: renderImageMarkdown(image.alt, outcome.dataUri, image.title),
    });
    embeddedImages.push(outcome.imagePath);
  }

  if (!dryRun) {
    const rewritten = replaceSpans(content, replacements);
    await writeFile(file, rewritten, 'utf-8');
  }

  return {
    error: undefined,
    embeddedImages,
    rewrites: images.map((image) => ({ file, href: image.href })),
  };
}

/** Either an error message, or the resolved image path with its data URI. */
type EncodeOutcome = string | { imagePath: string; dataUri: string };

/** Read one linked image and encode it as a base64 data URI. */
async function encodeImage(image: ImageLinkOccurrence, file: string): Promise<EncodeOutcome> {
  const imagePath = resolve(dirname(file), image.href);

  let bytes: Buffer;
  try {
    bytes = await readFile(imagePath);
  } catch (error) {
    return `${file}: failed reading image "${image.href}" (${imagePath}): ${errorMessage(error)}`;
  }

  let mimeType: string;
  try {
    mimeType = imageMimeTypeForExtension(extname(image.href));
  } catch (error) {
    return `${file}: "${image.href}": ${errorMessage(error)}`;
  }

  return { imagePath, dataUri: `data:${mimeType};base64,${bytes.toString('base64')}` };
}

/** The deletions an embed run performed, split by outcome. */
interface ImageDeletions {
  /** Image files removed because nothing in the processed set references them */
  deleted: string[];
  /** Image files kept because a file in the processed set still references them */
  kept: string[];
  /** Images kept because a file outside the processed set still references them */
  keptOutside: string[];
}

/**
 * Delete embedded image files that no markdown file in the processed set references any more.
 *
 * Deletion is decided against the processed set only: a file outside the set that still links the
 * image is beyond this command's view, so the operator is told which files kept an image alive.
 *
 * @param imagePaths - Absolute paths of the images that were inlined
 * @param files - The markdown files that were processed
 *
 * @returns The deletions performed and the images kept with their reason
 */
/** Search the tree around the processed set for a markdown file outside it still linking the image */
async function findOutsideReferencer(
  imagePath: string,
  processedFiles: Set<string>
): Promise<string | undefined> {
  const scanRoot = PathUtils.findCommonBase([imagePath, ...processedFiles]);
  if (!scanRoot) {
    return undefined;
  }
  const treeFiles = await FileUtils.findMarkdownFiles(scanRoot, true);
  for (const file of treeFiles) {
    if (processedFiles.has(file)) continue;
    const content = await readFile(file, 'utf-8');
    if (
      findLocalImages(content).some((image) => resolve(dirname(file), image.href) === imagePath)
    ) {
      return file;
    }
  }
  return undefined;
}

async function deleteUnreferencedImages(
  imagePaths: string[],
  files: string[]
): Promise<ImageDeletions> {
  if (imagePaths.length === 0) {
    return { deleted: [], kept: [], keptOutside: [] };
  }

  const currentContent = await Promise.all(
    files.map(async (file) => ({ file, content: await readFile(file, 'utf-8') }))
  );

  const deletions: ImageDeletions = { deleted: [], kept: [], keptOutside: [] };

  const processedFiles = new Set(files);

  for (const imagePath of imagePaths) {
    const stillReferenced = currentContent.some(({ file, content }) =>
      findLocalImages(content).some((image) => resolve(dirname(file), image.href) === imagePath)
    );

    if (stillReferenced) {
      deletions.kept.push(imagePath);
      continue;
    }

    // An image unreferenced in the processed set may still be linked from markdown outside it;
    // the surrounding tree is scanned before the file is destroyed
    const outsideReferencer = await findOutsideReferencer(imagePath, processedFiles);
    if (outsideReferencer !== undefined) {
      deletions.keptOutside.push(`${imagePath} (referenced by ${outsideReferencer})`);
    } else {
      await unlink(imagePath);
      deletions.deleted.push(imagePath);
    }
  }

  return deletions;
}

/** Extract the message from an unknown error value. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
