import type { Command } from "commander";
import { indexCommand } from "../commands/generate-index.js";
import { graphCommand } from "../commands/graph.js";
import { refactorHeadingsCommand } from "../commands/refactor-headings.js";
import { refactorIndexCommand } from "../commands/refactor-index.js";
import { tocCommand } from "../commands/toc.js";
import { treeCommand } from "../commands/tree.js";
import { DEFAULT_GRAPH_MAX_DEPTH, MAX_HEADING_LEVEL } from "./defaults.js";

/**
 * Registers the structure commands on the given commander program.
 * @param program - The commander program to add the commands to
 */
export function registerStructureCommands(program: Command): void {
  program
    .command("index")
    .description("Generate index files for markdown documentation")
    .argument("[directory]", "Directory to generate indexes for", ".")
    .option(
      "-t, --type <type>",
      "Index type: links|import|embed|hybrid",
      "links",
    )
    .option(
      "-s, --strategy <strategy>",
      "Organization strategy: directory|metadata|manual",
      "directory",
    )
    .option(
      "-l, --location <location>",
      "Index placement: all|root|branch|existing",
      "root",
    )
    .option("-n, --name <name>", "Index filename", "index.md")
    .option(
      "--embed-style <style>",
      "Embed style for embed type: obsidian|markdown",
      "obsidian",
    )
    .option("--template <file>", "Custom template file")
    .option(
      "--max-depth <number>",
      "Maximum depth to traverse subdirectories",
      parseInt,
    )
    .option(
      "--no-traverse-up",
      "Prevent traversing above the specified directory",
    )
    .option(
      "--boundary <path>",
      "Explicit boundary path to limit scanning scope",
    )
    .option(
      "--generate-toc",
      "Generate table of contents for each indexed file",
    )
    .option(
      "--toc-min-depth <number>",
      "Minimum heading level for TOC (1-6)",
      parseInt,
      1,
    )
    .option(
      "--toc-max-depth <number>",
      "Maximum heading level for TOC (1-6)",
      parseInt,
      MAX_HEADING_LEVEL,
    )
    .option(
      "--toc-include-line-numbers",
      "Include line numbers in table of contents",
    )
    .option(
      "-d, --dry-run",
      "Show what would be generated without creating files",
    )
    .option("-v, --verbose", "Show detailed output")
    .option("--json", "Output results in JSON format")
    .addHelpText(
      "after",
      `
  Examples:
    $ markmv index --type links --strategy directory --generate-toc
    $ markmv index docs/ --type hybrid --generate-toc --toc-min-depth 2 --toc-max-depth 4
    $ markmv index --generate-toc --toc-include-line-numbers --dry-run
    $ markmv index --type links --strategy metadata --location all --generate-toc

  Table of Contents Options:
    --generate-toc               Enable TOC generation for indexed files
    --toc-min-depth <number>     Minimum heading level to include (1-6, default: 1)
    --toc-max-depth <number>     Maximum heading level to include (1-6, default: 6)
    --toc-include-line-numbers   Include line numbers in TOC entries

  Index Types:
    links     Generate simple link lists with optional TOC
    import    Generate Claude import syntax (@path)
    embed     Generate embedded content (Obsidian style)
    hybrid    Generate linked headers with descriptions and optional TOC

  Organization Strategies:
    directory  Group by directory structure
    metadata   Group by frontmatter categories
    manual     Custom organization (extensible)

  Index Placement:
    all       Create index in every directory
    root      Create index only in root directory
    branch    Create index in directories with subdirectories
    existing  Update only existing index files`,
    )
    .action(indexCommand);

  program
    .command("barrel")
    .description(
      "Generate barrel files for themed content aggregation (alias for index)",
    )
    .argument("[directory]", "Directory to generate barrel files for", ".")
    .option(
      "-t, --type <type>",
      "Barrel type: links|import|embed|hybrid",
      "links",
    )
    .option(
      "-s, --strategy <strategy>",
      "Organization strategy: directory|metadata|manual",
      "directory",
    )
    .option(
      "-l, --location <location>",
      "Barrel placement: all|root|branch|existing",
      "root",
    )
    .option("-n, --name <name>", "Barrel filename", "index.md")
    .option(
      "--embed-style <style>",
      "Embed style for embed type: obsidian|markdown",
      "obsidian",
    )
    .option("--template <file>", "Custom template file")
    .option(
      "--max-depth <number>",
      "Maximum depth to traverse subdirectories",
      parseInt,
    )
    .option(
      "--no-traverse-up",
      "Prevent traversing above the specified directory",
    )
    .option(
      "--boundary <path>",
      "Explicit boundary path to limit scanning scope",
    )
    .option(
      "--generate-toc",
      "Generate table of contents for each indexed file",
    )
    .option(
      "--toc-min-depth <number>",
      "Minimum heading level for TOC (1-6)",
      parseInt,
      1,
    )
    .option(
      "--toc-max-depth <number>",
      "Maximum heading level for TOC (1-6)",
      parseInt,
      MAX_HEADING_LEVEL,
    )
    .option(
      "--toc-include-line-numbers",
      "Include line numbers in table of contents",
    )
    .option(
      "-d, --dry-run",
      "Show what would be generated without creating files",
    )
    .option("-v, --verbose", "Show detailed output")
    .option("--json", "Output results in JSON format")
    .addHelpText(
      "after",
      `
  Examples:
    $ markmv barrel --type links --strategy directory --generate-toc
    $ markmv barrel docs/ --type hybrid --generate-toc --toc-min-depth 2 --toc-max-depth 4
    $ markmv barrel --generate-toc --toc-include-line-numbers --dry-run
    $ markmv barrel --type links --strategy metadata --location all --generate-toc

  Barrel Types:
    links     Generate simple link lists with optional TOC
    import    Generate Claude import syntax (@path)
    embed     Generate embedded content (Obsidian style)
    hybrid    Generate linked headers with descriptions and optional TOC

  Organization Strategies:
    directory  Group by directory structure
    metadata   Group by frontmatter categories
    manual     Custom organization (extensible)

  Barrel Placement:
    all       Create barrel in every directory
    root      Create barrel only in root directory
    branch    Create barrel in directories with subdirectories
    existing  Update only existing barrel files

  Note: This is an alias for the 'index' command with barrel-focused terminology.`,
    )
    .action(indexCommand);

  program
    .command("toc")
    .description("Generate and insert table of contents into markdown files")
    .argument(
      "<files...>",
      "Markdown files to process (supports globs like *.md, **/*.md)",
    )
    .option(
      "--min-depth <number>",
      "Minimum heading level to include (1-6)",
      parseInt,
      1,
    )
    .option(
      "--max-depth <number>",
      "Maximum heading level to include (1-6)",
      parseInt,
      MAX_HEADING_LEVEL,
    )
    .option("--include-line-numbers", "Include line numbers in TOC entries")
    .option(
      "--position <position>",
      "TOC position: top|after-title|before-content|replace",
      "after-title",
    )
    .option("--title <title>", "TOC title", "Table of Contents")
    .option("--heading-level <level>", "TOC heading level (1-6)", parseInt, 2)
    .option(
      "--marker <marker>",
      "Custom marker for TOC replacement (requires --position replace)",
    )
    .option("--skip-empty", "Skip files that don't have any headings", true)
    .option(
      "-d, --dry-run",
      "Show what would be changed without making changes",
    )
    .option("-v, --verbose", "Show detailed output")
    .option("--json", "Output results in JSON format")
    .addHelpText(
      "after",
      `
  Examples:
    $ markmv toc README.md
    $ markmv toc docs/*.md --position after-title --min-depth 2 --max-depth 4
    $ markmv toc file.md --position replace --marker "<!-- TOC -->"
    $ markmv toc **/*.md --title "Contents" --heading-level 3 --include-line-numbers

  Position Options:
    top            Insert TOC at the very beginning of the file
    after-title    Insert TOC after the first heading (default)
    before-content Insert TOC before main content (after frontmatter)
    replace        Replace existing TOC using marker or auto-detection

  TOC Customization:
    --title <title>          Custom TOC title (default: "Table of Contents")
    --heading-level <level>  TOC heading level 1-6 (default: 2, creates ## title)
    --marker <marker>        Custom marker for replacement (e.g., "<!-- TOC -->")
    --min-depth <number>     Minimum heading level to include (1-6, default: 1)
    --max-depth <number>     Maximum heading level to include (1-6, default: 6)
    --include-line-numbers   Include line numbers in TOC entries`,
    )
    .action(tocCommand);

  program
    .command("refactor-headings")
    .description("Refactor markdown headings and update all affected links")
    .argument(
      "[files...]",
      "Markdown files to process (supports globs, defaults to current directory)",
    )
    .option("--old-heading <text>", "Original heading text to find and replace")
    .option("--new-heading <text>", "New heading text to replace with")
    .option("-r, --recursive", "Process directories recursively")
    .option(
      "--max-depth <number>",
      "Maximum depth to traverse subdirectories",
      parseInt,
    )
    .option(
      "--no-update-cross-references",
      "Skip updating cross-file references",
    )
    .option(
      "-d, --dry-run",
      "Show what would be changed without making changes",
    )
    .option("-v, --verbose", "Show detailed output with processing information")
    .option("--json", "Output results in JSON format")
    .addHelpText(
      "after",
      `
    Examples:
    $ markmv refactor-headings docs/ --old-heading "API Reference" --new-heading "API Documentation" --recursive
    $ markmv refactor-headings README.md --old-heading "Getting Started" --new-heading "Quick Start Guide"
    $ markmv refactor-headings **/*.md --old-heading "Installation" --new-heading "Setup" --dry-run
    $ markmv refactor-headings . --old-heading "Configuration" --new-heading "Settings" --verbose
    $ markmv refactor-headings docs/ --old-heading "Usage" --new-heading "How to Use" --no-update-cross-references

  Features:
    📝 Updates heading text in place
    🔗 Automatically updates anchor links (#old-slug → #new-slug)
    🌐 Updates cross-file heading references
    🔄 Maintains link integrity across the entire project
    🔍 Dry-run support for safe preview
    📊 Comprehensive change reporting
    ⚡ Leverages existing TocGenerator for consistent slug generation

  The command will:
  1. Find all instances of the specified old heading text
  2. Replace them with the new heading text
  3. Generate old and new anchor slugs automatically
  4. Update all anchor links that reference the old slug
  5. Update cross-file references (unless --no-update-cross-references is used)
  6. Provide detailed reporting of all changes made

  Slug Generation:
  Headings are converted to URL-friendly anchor slugs using the same algorithm
  as the toc command: lowercase, special characters become hyphens, spaces
  become hyphens, multiple hyphens collapsed to single hyphens.`,
    )
    .action(refactorHeadingsCommand);

  program
    .command("graph")
    .description(
      "Generate interactive link graphs from markdown file relationships",
    )
    .argument(
      "[files...]",
      "Markdown files to analyze (supports globs like *.md, **/*.md, defaults to current directory)",
    )
    .option(
      "-f, --format <format>",
      "Output format: json|mermaid|dot|html",
      "json",
    )
    .option("-o, --output <file>", "Output file path")
    .option("--include-external", "Include external links in the graph", false)
    .option("--include-images", "Include image links in the graph", true)
    .option("--include-anchors", "Include anchor links in the graph", false)
    .option(
      "--max-depth <number>",
      "Maximum depth for dependency traversal",
      parseInt,
      DEFAULT_GRAPH_MAX_DEPTH,
    )
    .option(
      "--base-dir <path>",
      "Base directory for relative path calculations",
    )
    .option("-v, --verbose", "Show detailed output with processing information")
    .option("--json", "Output results in JSON format")
    .addHelpText(
      "after",
      `
    Examples:
    $ markmv graph                                    # Generate JSON graph for current directory
    $ markmv graph docs/**/*.md --format mermaid     # Create Mermaid diagram
    $ markmv graph . --format html --output viz.html # Interactive HTML visualization
    $ markmv graph **/*.md --format dot --output graph.dot # GraphViz DOT format

  Output Formats:
    json      JSON data structure for programmatic use
    mermaid   Mermaid diagram syntax for documentation
    dot       GraphViz DOT format for advanced layouts
    html      Interactive D3.js visualization

  Graph Options:
    --include-external    Include HTTP/HTTPS links
    --include-images      Include image references (default: true)
    --include-anchors     Include same-file section links
    --max-depth <number>  Limit dependency traversal depth

  Analysis Features:
    • Hub detection (highly connected files)
    • Orphan detection (unconnected files)
    • Circular reference detection
    • Strongly connected components`,
    )
    .action(graphCommand);

  program
    .command("refactor-index")
    .description(
      "Refactor between index file naming conventions (README.md <-> index.md) with automatic link updates",
    )
    .argument(
      "<file>",
      "Path to the README.md or index.md file to convert in place",
    )
    .option("--to <convention>", "Target naming convention: readme|index")
    .option(
      "-d, --dry-run",
      "Show what would be changed without making changes",
    )
    .option("-v, --verbose", "Show detailed output with processing information")
    .option("--json", "Output results in JSON format")
    .addHelpText(
      "after",
      `
  Examples:
    $ markmv refactor-index docs/README.md                  # Convert README.md to index.md
    $ markmv refactor-index docs/index.md --to readme       # Convert index.md back to README.md
    $ markmv refactor-index docs/README.md --dry-run        # Preview the rename and link rewrites

  Notes:
    The target convention defaults to the opposite of the file's current name.
    Only exact README.md and index.md basenames are accepted; the conversion is
    refused when the target name already exists in the same directory.`,
    )
    .action(refactorIndexCommand);

  program
    .command("tree")
    .description(
      "Visualise the markdown file tree with per-file statistics and warnings",
    )
    .argument(
      "[path]",
      "Directory or markdown file to scan (defaults to current directory)",
    )
    .option("-f, --format <format>", "Output format: ascii|json", "ascii")
    .option(
      "--max-depth <number>",
      "Limit tree rendering depth (statistics always cover the full scan)",
      parseInt,
    )
    .option("-v, --verbose", "Show detailed output with processing information")
    .option("--json", "Output results in JSON format (alias for --format json)")
    .addHelpText(
      "after",
      `
  Examples:
    $ markmv tree                                      # Render the tree for the current directory
    $ markmv tree docs/                                # Render a specific directory
    $ markmv tree docs/ --max-depth 2                  # Limit rendering depth (statistics still cover the full scan)
    $ markmv tree docs/ --format json                  # Machine-readable tree and statistics
    $ markmv tree README.md --verbose                  # Single file with scan progress

  Per-file annotations:
    (N words, M links)   Words are whitespace-separated tokens outside fenced code blocks and
                         inline code spans; link syntax and heading markers count as tokens
    [N broken]           The file has N internal links whose target file does not exist
    [orphan]             No other scanned file links to this file

  Notes:
    Excludes node_modules, .git, and dist directories at any depth
    Directories render before files, each group alphabetically
    Internal links are checked for file existence only (no network)
    Statistics always cover the full scan, regardless of --max-depth
    Read-only command: no files are modified, so there is no --dry-run`,
    )
    .action(treeCommand);
}
