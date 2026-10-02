import type { Command } from "commander";
import { clipCommand } from "../commands/clip.js";
import { convertCommand } from "../commands/convert.js";
import { joinCommand } from "../commands/join.js";
import { mergeCommand } from "../commands/merge.js";
import { moveCommand } from "../commands/move.js";
import { splitCommand } from "../commands/split.js";
import { DEFAULT_CLIP_TIMEOUT_MS, DEFAULT_MAX_REDIRECTS } from "./defaults.js";

/**
 * Registers the file commands on the given commander program.
 * @param program - The commander program to add the commands to
 */
export function registerFileCommands(program: Command): void {
  program
    .command("clip")
    .description("Convert web pages to markdown (web clipper)")
    .argument(
      "<urls...>",
      "URLs to clip or paths to files containing URLs (use --batch)",
    )
    .option("-o, --output <file>", "Output file name (single URL only)")
    .option("--output-dir <dir>", "Output directory for clipped files")
    .option("--batch", "Process multiple URLs from input files")
    .option(
      "--strategy <strategy>",
      "Extraction strategy: auto|readability|manual|full|structured",
      "auto",
    )
    .option(
      "--image-strategy <strategy>",
      "Image handling: skip|link-only|download|base64",
      "link-only",
    )
    .option("--image-dir <dir>", "Directory for downloaded images", "./images")
    .option(
      "--selectors <selectors>",
      "CSS selectors for manual extraction (comma-separated)",
    )
    .option("--no-frontmatter", "Skip frontmatter generation")
    .option(
      "--timeout <ms>",
      "Request timeout in milliseconds",
      parseInt,
      DEFAULT_CLIP_TIMEOUT_MS,
    )
    .option("--user-agent <agent>", "Custom User-Agent string")
    .option("--headers <headers>", "Custom HTTP headers (JSON format)")
    .option("--cookies <file>", "Path to cookies file")
    .option("--no-follow-redirects", "Don't follow HTTP redirects")
    .option(
      "--max-redirects <count>",
      "Maximum redirects to follow",
      parseInt,
      DEFAULT_MAX_REDIRECTS,
    )
    .option(
      "-d, --dry-run",
      "Show what would be clipped without creating files",
    )
    .option("-v, --verbose", "Show detailed output with processing information")
    .option("--json", "Output results in JSON format")
    .addHelpText(
      "after",
      `
  Examples:
    $ markmv clip https://example.com/article
    $ markmv clip https://example.com/article -o article.md
    $ markmv clip urls.txt --batch --output-dir ./clipped
    $ markmv clip https://docs.site.com --strategy manual --selectors "article,.content"
    $ markmv clip https://blog.com/post --strategy readability --image-strategy download
    $ markmv clip https://example.com --dry-run --verbose

  Extraction Strategies:
    auto         Automatically choose best strategy based on content
    readability  Mozilla Readability algorithm (best for articles/blogs)
    manual       Extract using custom CSS selectors
    full         Extract entire page content
    structured   Use Schema.org and semantic markup

  Image Strategies:
    skip         Don't process images at all
    link-only    Keep images as external links (fastest)
    download     Download images locally and update paths
    base64       Embed small images as base64 (increases file size)

  Advanced Features:
    --headers '{"Authorization": "Bearer token"}'    Custom headers for auth
    --cookies cookies.txt                            Use cookies for protected content
    --selectors "article,.post-content,main"        Custom content selectors
    --timeout 60000                                  Extended timeout for slow sites
    --user-agent "Custom Bot 1.0"                   Custom user agent string`,
    )
    .action(clipCommand);

  program
    .command("convert")
    .description("Convert markdown link formats and path resolution")
    .argument(
      "<files...>",
      "Markdown files to convert (supports globs like *.md, **/*.md)",
    )
    .option(
      "--path-resolution <type>",
      "Convert path resolution: absolute|relative",
    )
    .option(
      "--base-path <path>",
      "Base path for relative path calculations (defaults to current directory)",
    )
    .option(
      "--link-style <style>",
      "Convert link style: markdown|claude|combined|wikilink",
    )
    .option("-r, --recursive", "Process directories recursively")
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
    $ markmv convert docs/*.md --link-style wikilink --path-resolution relative
    $ markmv convert README.md --link-style claude --dry-run
    $ markmv convert **/*.md --path-resolution absolute --recursive
    $ markmv convert docs/ --link-style combined --recursive --verbose

  Link Styles:
    markdown  Standard markdown links: [text](url)
    claude    Claude import syntax: @url
    combined  Combined format: [@url](url)
    wikilink  Obsidian wikilinks: [[url]]

  Path Resolution:
    absolute  Convert to absolute file paths
    relative  Convert to relative file paths from base-path`,
    )
    .action(convertCommand);

  program
    .command("move")
    .description("Move markdown files while updating cross-references")
    .argument(
      "[sources...]",
      "Source markdown files, directories, or globs, and destination (last argument); with --pairs, alternating source/destination pairs; omitted with --pairs-file",
    )
    .option(
      "-d, --dry-run",
      "Show what would be changed without making changes",
    )
    .option("-v, --verbose", "Show detailed output")
    .option(
      "--obsidian",
      "Treat [[wikilinks]] as Obsidian vault links resolved by note basename",
    )
    .option(
      "--pairs",
      "Treat the arguments as alternating source/destination pairs moved in one operation (literal paths, no glob expansion)",
    )
    .option(
      "--pairs-file <path>",
      "Read source->destination pairs from a file, one pair per line separated by a tab ('-' reads stdin)",
    )
    .option("--json", "Output results in JSON format")
    .addHelpText(
      "after",
      `
  Examples:
    $ markmv move docs/old.md docs/new.md
    $ markmv move file1.md file2.md ./archive/
    $ markmv move docs/ ./published/
    $ markmv move --pairs organisations/acme/acme.md organisations/acme/README.md organisations/globex/globex.md organisations/globex/README.md
    $ markmv move --pairs-file pairs.txt --dry-run

  Bulk Pair Moves:
    --pairs             Arguments are alternating source/destination pairs, moved together in one
                        operation so links between the moved files are rewritten to their new
                        sibling locations. Sources are literal paths: no glob expansion, no
                        directory moves.
    --pairs-file <path> Pairs are read from the named file ('-' reads stdin). Each non-blank line is
                        one pair: source, a tab, destination. The tab separator keeps spaces in
                        paths unambiguous, which arbitrary whitespace cannot.

    Destinations must not collide: no two pairs share one, and none names a file that already
    exists. A destination another pair's source vacates is fine (chained renames are ordered
    automatically); swaps and rotations are rejected, since no order can complete them.

    Rename every folder-named index file (acme/acme.md) to README.md in one sweep:
    $ find . -type d | while read d; do f="$d/$(basename "$d").md"; [ -f "$f" ] && printf '%s\\t%s/README.md\\n' "$f" "$d"; done | markmv move --pairs-file - --dry-run`,
    )
    .action(moveCommand);

  program
    .command("split")
    .description("Split large markdown files maintaining link integrity")
    .argument("<source>", "Source markdown file to split")
    .option(
      "-s, --strategy <strategy>",
      "Split strategy: headers|size|manual|lines",
      "headers",
    )
    .option("-o, --output <dir>", "Output directory for split files")
    .option("-l, --header-level <level>", "Header level to split on (1-6)", "2")
    .option("-m, --max-size <kb>", "Maximum size per section in KB", "100")
    .option(
      "--split-lines <lines>",
      "Comma-separated line numbers to split on (for lines strategy)",
    )
    .option(
      "-d, --dry-run",
      "Show what would be changed without making changes",
    )
    .option("-v, --verbose", "Show detailed output")
    .option("--json", "Output results in JSON format")
    .action(splitCommand);

  program
    .command("join")
    .description("Join multiple markdown files resolving conflicts")
    .argument("<files...>", "Markdown files to join")
    .option("-o, --output <file>", "Output file name")
    .option(
      "--order-strategy <strategy>",
      "Order strategy: alphabetical|manual|dependency|chronological",
      "dependency",
    )
    .option(
      "-d, --dry-run",
      "Show what would be changed without making changes",
    )
    .option("-v, --verbose", "Show detailed output")
    .option("--json", "Output results in JSON format")
    .action(joinCommand);

  program
    .command("merge")
    .description("Merge markdown content with link reconciliation")
    .argument("<source>", "Source markdown file")
    .argument("<target>", "Target markdown file to merge into")
    .option(
      "-s, --strategy <strategy>",
      "Merge strategy: append|prepend|interactive",
      "interactive",
    )
    .option(
      "--create-transclusions",
      "Create Obsidian transclusions instead of copying content",
    )
    .option(
      "-d, --dry-run",
      "Show what would be changed without making changes",
    )
    .option("-v, --verbose", "Show detailed output")
    .option("--json", "Output results in JSON format")
    .action(mergeCommand);
}
