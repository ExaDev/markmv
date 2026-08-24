import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { glob } from "glob";
import { PathUtils } from "../utils/path-utils.js";
import {
  findInlineImages,
  imageExtensionForMimeType,
  parseImageDataUri,
  renderImageMarkdown,
  replaceSpans,
} from "../core/image-inline.js";

/**
 * Configuration options for extract command operations.
 *
 * Controls the behaviour of the extract command, which writes inline base64 image data URIs out to
 * real image files.
 *
 * @category Commands
 */
export interface ExtractOptions {
  /** Directory the extracted image files are written to (default: alongside each markdown file) */
  outputDir?: string;
  /** Perform a dry run without making actual changes */
  dryRun?: boolean;
  /** Enable verbose output with detailed progress information */
  verbose?: boolean;
  /** Output results in JSON format instead of the human-readable summary */
  json?: boolean;
}

/**
 * Summary of an extract run, in the shape emitted by `--json`.
 *
 * @category Commands
 */
export interface ExtractSummary {
  /** Always "extract", so JSON consumers can identify the command */
  command: "extract";
  /** Whether the run completed without errors */
  success: boolean;
  /** Whether this was a dry run, so no files were touched */
  dryRun: boolean;
  /** Number of markdown files examined */
  filesProcessed: number;
  /** Markdown files whose content was rewritten (empty in a dry run) */
  filesModified: string[];
  /** Number of inline data URIs rewritten to file links */
  imagesExtracted: number;
  /** Image files created (empty in a dry run) */
  imagesCreated: string[];
  /** Error messages, one per failure */
  errors: string[];
  /** Warning messages */
  warnings: string[];
}

/** The outcome of extracting images from a single markdown file. */
interface ExtractFileResult {
  /** Error message when the file could not be fully processed, otherwise undefined */
  error: string | undefined;
  /** The image files that were (or in a dry run, would be) written */
  createdImages: string[];
  /** Number of inline images that were (or in a dry run, would be) rewritten */
  extractedCount: number;
}

/**
 * CLI command handler for extract operations.
 *
 * Writes each inline base64 image data URI in the given markdown files out to a real image file and
 * rewrites the markdown to link to it. The image filename derives from the alt text when it yields
 * a usable slug, otherwise a per-file `img-1`, `img-2`, ... counter is used; the extension comes
 * from the data URI's mime type.
 *
 * @category Commands
 *
 * @example
 *   ```bash # Extract every inline image, writing files next to the markdown markmv extract doc.md
 *
 *   # Write images to a shared asset directory markmv extract docs/*.md --output-dir assets/ ```;
 *
 * @param patterns - File patterns to process (supports globs)
 * @param options - Command options
 *
 * @throws Will exit the process with code 1 if the operation fails
 */
export async function extractCommand(
  patterns: string[],
  options: ExtractOptions,
): Promise<void> {
  if (patterns.length === 0) {
    reportUsageError(options, "At least one file pattern must be specified");
  }

  const files = await expandMarkdownPatterns(patterns);

  if (files.length === 0) {
    reportUsageError(
      options,
      `No markdown files found matching: ${patterns.join(", ")}`,
    );
  }

  const summary: ExtractSummary = {
    command: "extract",
    success: true,
    dryRun: options.dryRun === true,
    filesProcessed: files.length,
    filesModified: [],
    imagesExtracted: 0,
    imagesCreated: [],
    errors: [],
    warnings: [],
  };

  const humanOutput = options.json !== true;
  if (options.dryRun && humanOutput) {
    console.log("🔍 Dry run - no files will be modified");
  }

  const naming: ExtractNamingState = {
    usedNames: new Set<string>(),
    unnamedCounter: 0,
  };
  for (const file of files) {
    if (options.verbose && humanOutput) {
      console.log(`📄 Processing ${file}`);
    }
    const result = await extractFile(file, options, naming);
    if (result.error !== undefined) {
      summary.errors.push(result.error);
      summary.success = false;
      if (humanOutput) {
        console.error(`❌ ${result.error}`);
      }
      continue;
    }

    summary.imagesExtracted += result.extractedCount;
    if (humanOutput && options.dryRun) {
      for (const created of result.createdImages) {
        console.log(`🔍 Would extract ${created}`);
      }
    }
    if (result.extractedCount > 0 && options.dryRun !== true) {
      summary.filesModified.push(file);
      summary.imagesCreated.push(...result.createdImages);
      if (humanOutput) {
        for (const created of result.createdImages) {
          console.log(`🖼️  Created ${created}`);
        }
        console.log(
          `✅ Extracted ${String(result.extractedCount)} image(s) from ${file}`,
        );
      }
    }
  }

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else if (summary.success) {
    console.log(
      `📊 Summary: extracted ${String(summary.imagesExtracted)} image(s) across ${String(summary.filesModified.length)} file(s)`,
    );
    if (options.dryRun) {
      console.log("(Dry run - no files were actually modified)");
    }
  }

  if (!summary.success) {
    process.exit(1);
  }
}

/** Report a usage-stopping error in the mode-appropriate format and exit. */
function reportUsageError(options: ExtractOptions, message: string): never {
  if (options.json) {
    const summary: ExtractSummary = {
      command: "extract",
      success: false,
      dryRun: options.dryRun === true,
      filesProcessed: 0,
      filesModified: [],
      imagesExtracted: 0,
      imagesCreated: [],
      errors: [message],
      warnings: [],
    };
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.error(`❌ Error: ${message}`);
    console.error("Usage: markmv extract <files...> [options]");
  }
  process.exit(1);
}

/**
 * Expand file patterns to markdown file paths, following the convert command's expansion rules.
 *
 * A pattern may be a direct file path, a directory (expanded to the markdown files directly inside
 * it), or a glob pattern. Non-markdown results are skipped.
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

    if (
      existsSync(absolutePattern) &&
      statSync(absolutePattern).isDirectory()
    ) {
      // Glob patterns use forward slashes on every platform; backslashes are pattern escapes
      const files = await glob(`${absolutePattern.replace(/\\/g, "/")}/*.md`, {
        absolute: true,
      });
      files.forEach((file) => resolvedFiles.add(file));
      continue;
    }

    const globFiles = await glob(pattern.replace(/\\/g, "/"), {
      ignore: ["node_modules/**", ".git/**", "dist/**"],
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
 * Write every inline image data URI in one markdown file out to an image file and link to it.
 *
 * Every extraction is planned before anything is written, so one invalid data URI leaves both the
 * markdown and the output directory untouched.
 *
 * @param file - Absolute path of the markdown file
 * @param options - Command options
 *
 * @returns The outcome, with an error message in place of a thrown exception so sibling files are
 *   still processed
 */
/**
 * Names claimed by earlier files in the same run, so numbered collisions are consistent between
 * dry-run planning and the real writes
 */
interface ExtractNamingState {
  /** Output file names already claimed in this run */
  usedNames: Set<string>;
  /** Counter behind the img-N fallback names */
  unnamedCounter: number;
}

async function extractFile(
  file: string,
  options: ExtractOptions,
  naming: ExtractNamingState,
): Promise<ExtractFileResult> {
  const content = await readFile(file, "utf-8");
  const inlineImages = findInlineImages(content);
  if (inlineImages.length === 0) {
    return { error: undefined, createdImages: [], extractedCount: 0 };
  }

  const outputDir = options.outputDir
    ? resolve(options.outputDir)
    : dirname(file);

  const replacements = [];
  const writes: { path: string; bytes: Buffer }[] = [];

  for (const image of inlineImages) {
    try {
      const parsed = parseImageDataUri(image.href);
      const extension = imageExtensionForMimeType(parsed.mimeType);
      const slug = slugifyFileName(image.alt);
      const baseName = slug ?? `img-${String(++naming.unnamedCounter)}`;
      let fileName = `${baseName}.${extension}`;
      let suffix = 2;
      while (
        naming.usedNames.has(fileName) ||
        existsSync(joinPath(outputDir, fileName))
      ) {
        fileName = `${baseName}-${String(suffix)}.${extension}`;
        suffix++;
      }
      naming.usedNames.add(fileName);

      const imagePath = joinPath(outputDir, fileName);
      writes.push({
        path: imagePath,
        bytes: Buffer.from(parsed.data, "base64"),
      });

      const linkHref = relative(dirname(file), imagePath).replace(/\\/g, "/");
      replacements.push({
        start: image.start,
        end: image.end,
        replacement: renderImageMarkdown(image.alt, linkHref, image.title),
      });
    } catch (error) {
      return {
        error: `${file}: "${image.href.slice(0, 60)}": ${errorMessage(error)}`,
        createdImages: [],
        extractedCount: 0,
      };
    }
  }

  if (options.dryRun) {
    return {
      error: undefined,
      createdImages: writes.map((w) => w.path),
      extractedCount: writes.length,
    };
  }

  await mkdir(outputDir, { recursive: true });
  for (const write of writes) {
    await writeFile(write.path, write.bytes);
  }

  const rewritten = replaceSpans(content, replacements);
  await writeFile(file, rewritten, "utf-8");
  return {
    error: undefined,
    createdImages: writes.map((w) => w.path),
    extractedCount: writes.length,
  };
}

/** Extract the message from an unknown error value. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Convert alt text to a file base name, or undefined when the alt text yields nothing usable. */
function slugifyFileName(alt: string | undefined): string | undefined {
  if (alt === undefined) return undefined;
  const slug = alt
    .toLowerCase()
    .replaceAll(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? undefined : slug;
}

/** Join path segments, producing forward slashes so paths stay valid in markdown hrefs. */
function joinPath(directory: string, name: string): string {
  return `${directory.replace(/\\/g, "/")}/${name}`;
}
