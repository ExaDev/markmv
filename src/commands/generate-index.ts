import { existsSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { glob, type GlobOptionsWithFileTypesFalse } from "glob";
import { FileUtils } from "../utils/file-utils.js";
import { TocGenerator, type TocOptions } from "../utils/toc-generator.js";

// Test PR creation with trailing spaces on main branch

/** Deepest heading level in markdown (`h6`), the default ceiling for a generated table of contents. */
const DEFAULT_TOC_MAX_DEPTH = 6;

/**
 * Configuration options for index generation operations.
 *
 * Controls how documentation indexes are created, including content type, organization strategy,
 * and output locations.
 * @category Commands
 */
export interface IndexOptions {
  /** Type of index content to generate */
  type: "links" | "import" | "embed" | "hybrid";
  /** Strategy for organizing files in the index */
  strategy: "directory" | "metadata" | "manual";
  /** Where to place generated index files */
  location: "all" | "root" | "branch" | "existing";
  /** Name for generated index files */
  name: string;
  /** Style for embedded content (Obsidian or standard markdown) */
  embedStyle: "obsidian" | "markdown";
  /** Path to custom template file */
  template?: string;
  /** Perform a dry run without making actual changes */
  dryRun: boolean;
  /** Enable verbose output with detailed progress information */
  verbose: boolean;
  /** Maximum depth to traverse subdirectories */
  maxDepth?: number;
  /** Prevent traversing up from the specified directory */
  noTraverseUp: boolean;
  /** Explicit boundary path to limit scanning scope */
  boundary?: string;
  /** Generate table of contents for each indexed file */
  generateToc: boolean;
  /** Table of contents generation options */
  tocOptions: TocOptions;
}

/**
 * Metadata extracted from markdown file frontmatter.
 *
 * Used for organizing and presenting files in generated indexes.
 * @category Commands
 */
export interface FileMetadata {
  /** Document title from frontmatter */
  title?: string;
  /** Document description from frontmatter */
  description?: string;
  /** Category for grouping documents */
  category?: string;
  /** Numeric order for sorting within groups */
  order?: number;
  /** Tags associated with the document */
  tags?: string[];
}

/**
 * Represents a markdown file that can be included in an index.
 *
 * Contains file path information, extracted metadata, and content for use in index generation.
 * @category Commands
 */
export interface IndexableFile {
  /** Absolute path to the file */
  path: string;
  /** Path relative to the index generation root */
  relativePath: string;
  /** Extracted frontmatter metadata */
  metadata: FileMetadata;
  /** Full file content */
  content: string;
}

/**
 * Raw CLI options accepted by {@link indexCommand}, before defaults are applied.
 * @category Commands
 */
export interface IndexCliOptions {
  /**
   * Type of index content to generate
   * @defaultValue `links`
   */
  type?: "links" | "import" | "embed" | "hybrid";
  /**
   * Strategy for organising files in the index
   * @defaultValue `directory`
   */
  strategy?: "directory" | "metadata" | "manual";
  /**
   * Where to place generated index files
   * @defaultValue `root`
   */
  location?: "all" | "root" | "branch" | "existing";
  /**
   * Name for generated index files
   * @defaultValue `index.md`
   */
  name?: string;
  /**
   * Style for embedded content
   * @defaultValue `obsidian`
   */
  embedStyle?: "obsidian" | "markdown";
  /** Path to a custom template file */
  template?: string;
  /** Report what would be written without changing any files */
  dryRun?: boolean;
  /** Enable verbose output with detailed progress information */
  verbose?: boolean;
  /** Print the result as JSON */
  json?: boolean;
  /** Maximum depth to traverse subdirectories */
  maxDepth?: number;
  /** Prevent traversing up from the specified directory */
  noTraverseUp?: boolean;
  /** Explicit boundary path to limit scanning scope */
  boundary?: string;
  /** Generate a table of contents for each indexed file */
  generateToc?: boolean;
  /**
   * Minimum heading depth included in generated tables of contents
   * @defaultValue 1
   */
  tocMinDepth?: number;
  /**
   * Maximum heading depth included in generated tables of contents
   * @defaultValue 6
   */
  tocMaxDepth?: number;
  /** Include line numbers in generated tables of contents */
  tocIncludeLineNumbers?: boolean;
}

/**
 * CLI command handler for generating documentation indexes.
 *
 * Creates organized documentation indexes from markdown files using various strategies. Supports
 * multiple index types including links, imports, embeds, and hybrid modes.
 * @example
 * ```bash
 * # Generate a links-based index
 * markmv index --type links --strategy directory
 *
 * # Generate with custom template
 * markmv index docs/ --type hybrid --template custom.md
 *
 * # Dry run with verbose output
 * markmv index --dry-run --verbose
 * ```
 * @param directory - Target directory for index generation
 * @param cliOptions - Command options specifying index parameters
 * @category Commands
 */
export async function indexCommand(
  directory: string | undefined,
  cliOptions: Readonly<IndexCliOptions>,
): Promise<void> {
  const options: IndexOptions = {
    type: cliOptions.type ?? "links",
    strategy: cliOptions.strategy ?? "directory",
    location: cliOptions.location ?? "root",
    name: cliOptions.name ?? "index.md",
    embedStyle: cliOptions.embedStyle ?? "obsidian",
    dryRun: cliOptions.dryRun ?? false,
    verbose: cliOptions.verbose ?? false,
    noTraverseUp: cliOptions.noTraverseUp ?? false,
    generateToc: cliOptions.generateToc ?? false,
    tocOptions: {
      minDepth: cliOptions.tocMinDepth ?? 1,
      maxDepth: cliOptions.tocMaxDepth ?? DEFAULT_TOC_MAX_DEPTH,
      includeLineNumbers: cliOptions.tocIncludeLineNumbers ?? false,
    },
    ...(cliOptions.template !== undefined &&
      cliOptions.template !== "" && { template: cliOptions.template }),
    ...(cliOptions.maxDepth !== undefined && { maxDepth: cliOptions.maxDepth }),
    ...(cliOptions.boundary !== undefined &&
      cliOptions.boundary !== "" && { boundary: cliOptions.boundary }),
  };

  if (cliOptions.json === true) {
    return generateIndexFilesJson(options, directory ?? ".");
  } else {
    return generateIndexFiles(options, directory ?? ".");
  }
}

/** Generate index files for markdown documentation (JSON output) */
async function generateIndexFilesJson(
  options: IndexOptions,
  directory: string,
): Promise<void> {
  const targetDir = resolve(directory);

  if (!existsSync(targetDir)) {
    throw new Error(`Directory not found: ${targetDir}`);
  }

  if (!statSync(targetDir).isDirectory()) {
    throw new Error(`Path is not a directory: ${targetDir}`);
  }

  try {
    // Discover markdown files
    const files = await discoverMarkdownFiles(targetDir, options);

    // Organize files based on strategy
    const organizedFiles = organizeFiles(files, options);

    // Convert to JSON output
    const jsonOutput = {
      directory: targetDir,
      options: {
        type: options.type,
        strategy: options.strategy,
        location: options.location,
      },
      totalFiles: files.length,
      organizedFiles: Object.fromEntries(
        Array.from(organizedFiles.entries()).map(([key, groupFiles]) => [
          key,
          groupFiles.map((file) => ({
            path: file.path,
            relativePath: file.relativePath,
            title: nonEmptyOr(file.metadata.title, file.relativePath),
          })),
        ]),
      ),
      files: files.map((file) => ({
        path: file.path,
        relativePath: file.relativePath,
        title: nonEmptyOr(file.metadata.title, file.relativePath),
      })),
    };

    console.log(JSON.stringify(jsonOutput, null, 2));
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to generate index: ${error.message}`, {
        cause: error,
      });
    }
    throw error;
  }
}

/** Generate index files for markdown documentation */
async function generateIndexFiles(
  options: IndexOptions,
  directory: string,
): Promise<void> {
  const targetDir = resolve(directory);

  if (!existsSync(targetDir)) {
    throw new Error(`Directory not found: ${targetDir}`);
  }

  if (!statSync(targetDir).isDirectory()) {
    throw new Error(`Path is not a directory: ${targetDir}`);
  }

  if (options.verbose) {
    console.log(`Generating indexes in: ${targetDir}`);
    console.log(
      `Type: ${options.type}, Strategy: ${options.strategy}, Location: ${options.location}`,
    );
  }

  try {
    // Discover markdown files
    const files = await discoverMarkdownFiles(targetDir, options);

    // Organize files based on strategy
    const organizedFiles = organizeFiles(files, options);

    // Generate index files based on location strategy
    const indexPaths = determineIndexLocations(targetDir, files, options);

    // Generate each index file
    for (const indexPath of indexPaths) {
      /* Every index lists all organised files; narrowing to the files in the index's own
         directory tree is not done */
      const indexContent = generateIndexContent(
        indexPath,
        organizedFiles,
        options,
      );

      if (options.dryRun) {
        console.log(`Would create: ${indexPath}`);
        if (options.verbose) {
          console.log("Content:");
          console.log(indexContent);
          console.log("---");
        }
      } else {
        await writeIndexFile(indexPath, indexContent);
        console.log(`Generated: ${relative(process.cwd(), indexPath)}`);
      }
    }
  } catch (error) {
    console.error("Error generating indexes:", error);
    throw error;
  }
}

/** Discover all markdown files in the target directory */
async function discoverMarkdownFiles(
  targetDir: string,
  options: IndexOptions,
): Promise<IndexableFile[]> {
  // Determine the effective boundary for file scanning
  const { boundary } = options;
  const hasBoundary = boundary !== undefined && boundary !== "";
  const effectiveBoundary = hasBoundary ? resolve(boundary) : targetDir;

  // Build glob pattern based on maxDepth option
  let globPattern: string;
  if (options.maxDepth !== undefined) {
    // Create depth-limited pattern
    const depthPattern = Array.from(
      { length: options.maxDepth },
      () => "*",
    ).join("/");
    globPattern = join(targetDir, depthPattern, "*.md").replace(/\\/g, "/");
  } else {
    globPattern = join(targetDir, "**/*.md").replace(/\\/g, "/");
  }

  const globOptions: GlobOptionsWithFileTypesFalse = {
    ignore: ["**/node_modules/**"],
  };

  // Only set cwd if noTraverseUp is enabled
  if (options.noTraverseUp) {
    globOptions.cwd = targetDir;
  }

  const filePaths = await glob(globPattern, globOptions);

  // Filter files to respect boundary constraints and convert Path objects to strings
  const boundaryFilePaths = filePaths
    .map((filePath) => {
      // Ensure consistent absolute paths
      return resolve(filePath);
    })
    .filter((filePath) => {
      // Ensure file is within the boundary directory
      if (hasBoundary) {
        const relativeToBoundary = relative(effectiveBoundary, filePath);
        if (relativeToBoundary.startsWith("..")) {
          // File is outside boundary
          return false;
        }
      }

      // Ensure file is within or below target directory when noTraverseUp is enabled
      if (options.noTraverseUp) {
        const relativeToTarget = relative(targetDir, filePath);
        if (relativeToTarget.startsWith("..")) {
          // File is above target directory
          return false;
        }
      }

      return true;
    });

  const files: IndexableFile[] = [];

  for (const filePath of boundaryFilePaths) {
    // Skip existing index files if they match our naming pattern
    const fileName = basename(filePath);
    if (fileName === options.name) {
      continue;
    }

    try {
      const content = await FileUtils.readTextFile(filePath);
      const metadata = extractFrontmatter(content);

      files.push({
        path: filePath,
        relativePath: relative(targetDir, filePath).replace(/\\/g, "/"),
        metadata,
        content,
      });
    } catch (error) {
      if (options.verbose) {
        console.warn(`Warning: Could not read file ${filePath}:`, error);
      }
    }
  }

  return files;
}

/**
 * Returns `value` unless it is undefined or the empty string, in which case `fallback` is used --
 * an empty string is treated as "no value supplied" rather than a meaningful value to preserve.
 */
function nonEmptyOr(value: string | undefined, fallback: string): string {
  if (value !== undefined && value !== "") {
    return value;
  }

  return fallback;
}

/** Strips single and double quotes from a frontmatter scalar. */
function unquote(value: string): string {
  return value.replace(/['"]/g, "");
}

/** Maps one `key: value` frontmatter field to the metadata it sets; unrecognised keys set nothing. */
function parseFrontmatterField(key: string, value: string): FileMetadata {
  switch (key) {
    case "title":
      return { title: unquote(value) };
    case "description":
      return { description: unquote(value) };
    case "category":
      return { category: unquote(value) };
    case "order":
      return { order: Number.parseInt(value, 10) };
    case "tags": {
      // Handle array format: [tag1, tag2] or simple string
      const tagMatch = /\[(.*)\]/.exec(value);
      if (tagMatch) {
        return {
          tags: tagMatch[1].split(",").map((t) => unquote(t.trim())),
        };
      }

      return { tags: [unquote(value)] };
    }
    default:
      return {};
  }
}

/** Extract frontmatter metadata from markdown content */
function extractFrontmatter(content: string): FileMetadata {
  const frontmatterMatch = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!frontmatterMatch) {
    return {};
  }

  try {
    const frontmatter = frontmatterMatch[1];
    let metadata: FileMetadata = {};

    // Simple YAML parsing for common fields
    const lines = frontmatter.split("\n");
    for (const line of lines) {
      const match = /^(\w+):\s*(.+)$/.exec(line);
      if (match) {
        const [, key, value] = match;
        metadata = { ...metadata, ...parseFrontmatterField(key, value) };
      }
    }

    return metadata;
  } catch {
    return {};
  }
}

/** Organize files based on the specified strategy */
function organizeFiles(
  files: readonly IndexableFile[],
  options: IndexOptions,
): Map<string, IndexableFile[]> {
  const organized = new Map<string, IndexableFile[]>();

  for (const file of files) {
    let groupKey: string;

    switch (options.strategy) {
      case "directory": {
        // Group by immediate parent directory
        const pathParts = file.relativePath.split("/");
        groupKey = pathParts.length > 1 ? pathParts[0] : "root";
        break;
      }

      case "metadata":
        // Group by category from frontmatter
        groupKey = nonEmptyOr(file.metadata.category, "uncategorized");
        break;

      case "manual":
        /* For now, treat as directory-based, but this could be extended
           to read configuration from a special file */
        groupKey = nonEmptyOr(file.relativePath.split("/")[0], "root");
        break;

      default:
        groupKey = "all";
    }

    if (!organized.has(groupKey)) {
      organized.set(groupKey, []);
    }
    const group = organized.get(groupKey);
    if (group) {
      group.push(file);
    }
  }

  // Sort files within each group
  for (const groupFiles of organized.values()) {
    groupFiles.sort((a, b) => {
      // Sort by order if specified in metadata
      if (a.metadata.order !== undefined && b.metadata.order !== undefined) {
        return a.metadata.order - b.metadata.order;
      }

      // Fall back to alphabetical by title or filename
      const aTitle = nonEmptyOr(a.metadata.title, a.relativePath);
      const bTitle = nonEmptyOr(b.metadata.title, b.relativePath);

      return aTitle.localeCompare(bTitle);
    });
  }

  return organized;
}

/** Determine where index files should be created based on location strategy */
function determineIndexLocations(
  targetDir: string,
  files: readonly IndexableFile[],
  options: IndexOptions,
): string[] {
  const locations: string[] = [];

  switch (options.location) {
    case "root":
      locations.push(join(targetDir, options.name));
      break;

    case "all": {
      // Get all unique directories
      const directories = new Set<string>();
      // Root directory
      directories.add(targetDir);

      for (const file of files) {
        const fileDir = join(
          targetDir,
          file.relativePath.split("/").slice(0, -1).join("/"),
        );
        directories.add(fileDir);
      }

      for (const dir of directories) {
        locations.push(join(dir, options.name));
      }
      break;
    }

    case "branch": {
      // Only directories that contain subdirectories
      const branchDirs = new Set<string>();
      // Always include root
      branchDirs.add(targetDir);

      for (const file of files) {
        const pathParts = file.relativePath.split("/");
        if (pathParts.length > 2) {
          // Has subdirectories
          const branchDir = join(targetDir, pathParts[0]);
          branchDirs.add(branchDir);
        }
      }

      for (const dir of branchDirs) {
        locations.push(join(dir, options.name));
      }
      break;
    }

    case "existing": {
      // Only where index files already exist
      for (const file of files) {
        const dir = join(
          targetDir,
          file.relativePath.split("/").slice(0, -1).join("/"),
        );
        const potentialIndex = join(dir, options.name);
        if (existsSync(potentialIndex)) {
          locations.push(potentialIndex);
        }
      }
      // Always check root
      const rootIndex = join(targetDir, options.name);
      if (existsSync(rootIndex)) {
        locations.push(rootIndex);
      }
      break;
    }
  }

  // Remove duplicates
  return [...new Set(locations)];
}

/** Renders the table of contents of one file's content, or an empty string when it has no headings. */
function renderToc(
  file: Readonly<IndexableFile>,
  options: Readonly<IndexOptions>,
  tocGenerator: Readonly<TocGenerator>,
  render: (toc: string) => string,
): string {
  if (!options.generateToc) {
    return "";
  }

  const tocResult = tocGenerator.generateToc(file.content, options.tocOptions);
  if (tocResult.toc !== "" && tocResult.headings.length > 0) {
    return render(tocResult.toc);
  }

  return "";
}

/** Renders the index entry for one file in the layout selected by `options.type`. */
function renderIndexEntry(
  file: Readonly<IndexableFile>,
  indexDir: string,
  options: Readonly<IndexOptions>,
  tocGenerator: Readonly<TocGenerator>,
): string {
  const relativePath = relative(indexDir, file.path).replace(/\\/g, "/");
  const title = nonEmptyOr(
    file.metadata.title,
    nonEmptyOr(
      file.relativePath.split("/").pop()?.replace(".md", ""),
      "Untitled",
    ),
  );
  const description = nonEmptyOr(file.metadata.description, "");
  let entry = "";

  switch (options.type) {
    case "links":
      entry += `- [${title}](${relativePath})`;
      if (description !== "") {
        entry += ` - ${description}`;
      }
      entry += "\n";

      // Add TOC if enabled and file has headings
      entry += renderToc(file, options, tocGenerator, (toc) => {
        const indentedToc = toc
          .split("\n")
          .map((line) => `    ${line}`)
          .join("\n");

        return `  - Table of Contents:\n${indentedToc}\n`;
      });
      break;

    case "import":
      entry += `### ${title}\n`;
      entry += `@${relativePath}\n\n`;
      break;

    case "embed":
      entry += `### ${title}\n`;
      if (options.embedStyle === "obsidian") {
        entry += `![[${relativePath}]]\n\n`;
      } else {
        entry += `![${title}](${relativePath})\n\n`;
      }
      break;

    case "hybrid":
      entry += `### [${title}](${relativePath})\n`;
      if (description !== "") {
        entry += `> ${description}\n\n`;
      } else {
        entry += "\n";
      }

      // Add TOC if enabled and file has headings
      entry += renderToc(
        file,
        options,
        tocGenerator,
        (toc) => `#### Table of Contents\n\n${toc}\n\n`,
      );
      break;
  }

  return entry;
}

/** Generate the content for an index file */
function generateIndexContent(
  indexPath: string,
  organizedFiles: Map<string, IndexableFile[]>,
  options: IndexOptions,
): string {
  const now = new Date().toISOString();
  const indexDir = indexPath
    .replace(/\\/g, "/")
    .split("/")
    .slice(0, -1)
    .join("/");
  const tocGenerator = new TocGenerator();

  let content = `---
generated: true
generator: markmv-index
type: ${options.type}
strategy: ${options.strategy}
updated: ${now}
---

# Documentation Index

`;

  for (const [groupName, files] of organizedFiles) {
    if (files.length === 0) continue;

    // Capitalize and format group name
    const displayName = groupName
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    content += `## ${displayName}\n\n`;

    for (const file of files) {
      content += renderIndexEntry(file, indexDir, options, tocGenerator);
    }

    content += "\n";
  }

  return content;
}

/** Write the index file to disk */
async function writeIndexFile(
  indexPath: string,
  content: string,
): Promise<void> {
  await FileUtils.writeTextFile(indexPath, content, {
    createDirectories: true,
  });
}
