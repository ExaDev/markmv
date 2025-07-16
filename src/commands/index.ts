import { existsSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { glob } from 'glob';
import { FileUtils } from '../utils/file-utils.js';
import { TocGenerator, type TocOptions } from '../utils/toc-generator.js';

// Test PR creation with trailing spaces on main branch

/**
 * Configuration options for index generation operations.
 *
 * Controls how documentation indexes are created, including content type, organization strategy,
 * and output locations.
 *
 * @category Commands
 */
export interface IndexOptions {
  /** Type of index content to generate */
  type: 'links' | 'import' | 'embed' | 'hybrid';
  /** Strategy for organizing files in the index */
  strategy: 'directory' | 'metadata' | 'manual';
  /** Where to place generated index files */
  location: 'all' | 'root' | 'branch' | 'existing';
  /** Name for generated index files */
  name: string;
  /** Style for embedded content (Obsidian or standard markdown) */
  embedStyle: 'obsidian' | 'markdown';
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
 *
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
 *
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
 * Execute the index command to generate documentation indexes.
 *
 * This is the main entry point for the index command functionality. It processes CLI options and
 * delegates to the core index generation logic.
 *
 * @category Commands
 *
 * @param directory - Target directory for index generation (defaults to current directory)
 * @param cliOptions - Raw CLI options object
 *
 * @internal This is a CLI wrapper - use generateIndexFiles for programmatic access
 */
/** CLI options interface for the index command */
interface IndexCliOptions {
  type?: 'links' | 'import' | 'embed' | 'hybrid';
  strategy?: 'directory' | 'metadata' | 'manual';
  location?: 'all' | 'root' | 'branch' | 'existing';
  name?: string;
  embedStyle?: 'obsidian' | 'markdown';
  template?: string;
  dryRun?: boolean;
  verbose?: boolean;
  json?: boolean;
  maxDepth?: number;
  noTraverseUp?: boolean;
  boundary?: string;
  generateToc?: boolean;
  tocMinDepth?: number;
  tocMaxDepth?: number;
  tocIncludeLineNumbers?: boolean;
}

/**
 * CLI command handler for generating documentation indexes.
 *
 * Creates organized documentation indexes from markdown files using various strategies. Supports
 * multiple index types including links, imports, embeds, and hybrid modes.
 *
 * @example
 *   ```bash
 *   # Generate a links-based index
 *   markmv index --type links --strategy directory
 *
 *   # Generate with custom template
 *   markmv index docs/ --type hybrid --template custom.md
 *
 *   # Dry run with verbose output
 *   markmv index --dry-run --verbose
 *   ```;
 *
 * @param directory - Target directory for index generation
 * @param cliOptions - Command options specifying index parameters
 *
 * @group Commands
 */
export async function indexCommand(
  directory: string | undefined,
  cliOptions: IndexCliOptions
): Promise<void> {
  const options: IndexOptions = {
    type: cliOptions.type || 'links',
    strategy: cliOptions.strategy || 'directory',
    location: cliOptions.location || 'root',
    name: cliOptions.name || 'index.md',
    embedStyle: cliOptions.embedStyle || 'obsidian',
    dryRun: cliOptions.dryRun || false,
    verbose: cliOptions.verbose || false,
    noTraverseUp: cliOptions.noTraverseUp || false,
    generateToc: cliOptions.generateToc || false,
    tocOptions: {
      minDepth: cliOptions.tocMinDepth || 1,
      maxDepth: cliOptions.tocMaxDepth || 6,
      includeLineNumbers: cliOptions.tocIncludeLineNumbers || false,
    },
    ...(cliOptions.template && { template: cliOptions.template }),
    ...(cliOptions.maxDepth !== undefined && { maxDepth: cliOptions.maxDepth }),
    ...(cliOptions.boundary && { boundary: cliOptions.boundary }),
  };

  if (cliOptions.json) {
    return generateIndexFilesJson(options, directory || '.');
  } else {
    return generateIndexFiles(options, directory || '.');
  }
}

/** Generate index files for markdown documentation (JSON output) */
async function generateIndexFilesJson(options: IndexOptions, directory: string): Promise<void> {
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
            title: file.metadata.title || file.relativePath,
          })),
        ])
      ),
      files: files.map((file) => ({
        path: file.path,
        relativePath: file.relativePath,
        title: file.metadata.title || file.relativePath,
      })),
    };

    console.log(JSON.stringify(jsonOutput, null, 2));
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to generate index: ${error.message}`);
    }
    throw error;
  }
}

/** Generate index files for markdown documentation */
async function generateIndexFiles(options: IndexOptions, directory: string): Promise<void> {
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
      `Type: ${options.type}, Strategy: ${options.strategy}, Location: ${options.location}`
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
      const relevantFiles = getRelevantFilesForIndex(indexPath, organizedFiles, options);
      const indexContent = await generateIndexContent(indexPath, relevantFiles, options);

      if (options.dryRun) {
        console.log(`Would create: ${indexPath}`);
        if (options.verbose) {
          console.log('Content:');
          console.log(indexContent);
          console.log('---');
        }
      } else {
        await writeIndexFile(indexPath, indexContent, options);
        console.log(`Generated: ${relative(process.cwd(), indexPath)}`);
      }
    }
  } catch (error) {
    console.error('Error generating indexes:', error);
    throw error;
  }
}

/** Discover all markdown files in the target directory */
async function discoverMarkdownFiles(
  targetDir: string,
  options: IndexOptions
): Promise<IndexableFile[]> {
  // Determine the effective boundary for file scanning
  const effectiveBoundary = options.boundary ? resolve(options.boundary) : targetDir;

  // Build glob pattern based on maxDepth option
  let globPattern: string;
  if (options.maxDepth !== undefined) {
    // Create depth-limited pattern
    const depthPattern = Array.from({ length: options.maxDepth }, () => '*').join('/');
    globPattern = join(targetDir, depthPattern, '*.md').replace(/\\/g, '/');
  } else {
    globPattern = join(targetDir, '**/*.md').replace(/\\/g, '/');
  }

  const globOptions: Parameters<typeof glob>[1] = {
    ignore: ['**/node_modules/**'],
  };

  // Only set cwd if noTraverseUp is enabled
  if (options.noTraverseUp) {
    globOptions.cwd = targetDir;
  }

  const filePaths = await glob(globPattern, globOptions);

  // Filter files to respect boundary constraints and convert Path objects to strings
  const boundaryFilePaths = filePaths
    .map((filePath) => {
      const pathStr = typeof filePath === 'string' ? filePath : filePath.toString();
      return resolve(pathStr); // Ensure consistent absolute paths
    })
    .filter((filePath) => {
      const resolvedPath = filePath;

      // Ensure file is within the boundary directory
      if (options.boundary) {
        const relativeToBoundary = relative(effectiveBoundary, resolvedPath);
        if (relativeToBoundary.startsWith('..')) {
          return false; // File is outside boundary
        }
      }

      // Ensure file is within or below target directory when noTraverseUp is enabled
      if (options.noTraverseUp) {
        const relativeToTarget = relative(targetDir, resolvedPath);
        if (relativeToTarget.startsWith('..')) {
          return false; // File is above target directory
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
        relativePath: relative(targetDir, filePath).replace(/\\/g, '/'),
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

/** Extract frontmatter metadata from markdown content */
function extractFrontmatter(content: string): FileMetadata {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return {};
  }

  try {
    const frontmatter = frontmatterMatch[1];
    const metadata: FileMetadata = {};

    // Simple YAML parsing for common fields
    const lines = frontmatter.split('\n');
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        switch (key) {
          case 'title':
            metadata.title = value.replace(/['"]/g, '');
            break;
          case 'description':
            metadata.description = value.replace(/['"]/g, '');
            break;
          case 'category':
            metadata.category = value.replace(/['"]/g, '');
            break;
          case 'order':
            metadata.order = Number.parseInt(value, 10);
            break;
          case 'tags': {
            // Handle array format: [tag1, tag2] or simple string
            const tagMatch = value.match(/\[(.*)\]/);
            if (tagMatch) {
              metadata.tags = tagMatch[1].split(',').map((t) => t.trim().replace(/['"]/g, ''));
            } else {
              metadata.tags = [value.replace(/['"]/g, '')];
            }
            break;
          }
        }
      }
    }

    return metadata;
  } catch {
    return {};
  }
}

/** Organize files based on the specified strategy */
function organizeFiles(
  files: IndexableFile[],
  options: IndexOptions
): Map<string, IndexableFile[]> {
  const organized = new Map<string, IndexableFile[]>();

  for (const file of files) {
    let groupKey: string;

    switch (options.strategy) {
      case 'directory': {
        // Group by immediate parent directory
        const pathParts = file.relativePath.split('/');
        groupKey = pathParts.length > 1 ? pathParts[0] : 'root';
        break;
      }

      case 'metadata':
        // Group by category from frontmatter
        groupKey = file.metadata.category || 'uncategorized';
        break;

      case 'manual':
        // For now, treat as directory-based, but this could be extended
        // to read configuration from a special file
        groupKey = file.relativePath.split('/')[0] || 'root';
        break;

      default:
        groupKey = 'all';
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
  for (const [_groupKey, groupFiles] of organized) {
    groupFiles.sort((a, b) => {
      // Sort by order if specified in metadata
      if (a.metadata.order !== undefined && b.metadata.order !== undefined) {
        return a.metadata.order - b.metadata.order;
      }

      // Fall back to alphabetical by title or filename
      const aTitle = a.metadata.title || a.relativePath;
      const bTitle = b.metadata.title || b.relativePath;
      return aTitle.localeCompare(bTitle);
    });
  }

  return organized;
}

/** Determine where index files should be created based on location strategy */
function determineIndexLocations(
  targetDir: string,
  files: IndexableFile[],
  options: IndexOptions
): string[] {
  const locations: string[] = [];

  switch (options.location) {
    case 'root':
      locations.push(join(targetDir, options.name));
      break;

    case 'all': {
      // Get all unique directories
      const directories = new Set<string>();
      directories.add(targetDir); // Root directory

      for (const file of files) {
        const fileDir = join(targetDir, file.relativePath.split('/').slice(0, -1).join('/'));
        directories.add(fileDir);
      }

      for (const dir of directories) {
        locations.push(join(dir, options.name));
      }
      break;
    }

    case 'branch': {
      // Only directories that contain subdirectories
      const branchDirs = new Set<string>();
      branchDirs.add(targetDir); // Always include root

      for (const file of files) {
        const pathParts = file.relativePath.split('/');
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

    case 'existing': {
      // Only where index files already exist
      for (const file of files) {
        const dir = join(targetDir, file.relativePath.split('/').slice(0, -1).join('/'));
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

  return [...new Set(locations)]; // Remove duplicates
}

/** Get files relevant to a specific index location */
function getRelevantFilesForIndex(
  _indexPath: string,
  organizedFiles: Map<string, IndexableFile[]>,
  _options: IndexOptions
): Map<string, IndexableFile[]> {
  // For now, return all organized files
  // This could be refined to only include files in the same directory tree
  return organizedFiles;
}

/** Generate the content for an index file */
async function generateIndexContent(
  indexPath: string,
  organizedFiles: Map<string, IndexableFile[]>,
  options: IndexOptions
): Promise<string> {
  const now = new Date().toISOString();
  const indexDir = indexPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
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
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    content += `## ${displayName}\n\n`;

    for (const file of files) {
      const relativePath = relative(indexDir, file.path).replace(/\\/g, '/');
      const title =
        file.metadata.title || file.relativePath.split('/').pop()?.replace('.md', '') || 'Untitled';
      const description = file.metadata.description;

      switch (options.type) {
        case 'links':
          content += `- [${title}](${relativePath})`;
          if (description) {
            content += ` - ${description}`;
          }
          content += '\n';
          
          // Add TOC if enabled and file has headings
          if (options.generateToc) {
            const tocResult = await tocGenerator.generateToc(file.content, options.tocOptions);
            if (tocResult.toc && tocResult.headings.length > 0) {
              content += `  - Table of Contents:\n`;
              const indentedToc = tocResult.toc.split('\n').map(line => `    ${line}`).join('\n');
              content += `${indentedToc}\n`;
            }
          }
          break;

        case 'import':
          content += `### ${title}\n`;
          content += `@${relativePath}\n\n`;
          break;

        case 'embed':
          content += `### ${title}\n`;
          if (options.embedStyle === 'obsidian') {
            content += `![[${relativePath}]]\n\n`;
          } else {
            content += `![${title}](${relativePath})\n\n`;
          }
          break;

        case 'hybrid':
          content += `### [${title}](${relativePath})\n`;
          if (description) {
            content += `> ${description}\n\n`;
          } else {
            content += '\n';
          }
          
          // Add TOC if enabled and file has headings
          if (options.generateToc) {
            const tocResult = await tocGenerator.generateToc(file.content, options.tocOptions);
            if (tocResult.toc && tocResult.headings.length > 0) {
              content += `#### Table of Contents\n\n`;
              content += `${tocResult.toc}\n\n`;
            }
          }
          break;
      }
    }

    content += '\n';
  }

  return content;
}

/** Write the index file to disk */
async function writeIndexFile(
  indexPath: string,
  content: string,
  _options: IndexOptions
): Promise<void> {
  await FileUtils.writeTextFile(indexPath, content, { createDirectories: true });
}
