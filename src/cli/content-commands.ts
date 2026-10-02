import type { Command } from "commander";
import { embedCommand } from "../commands/embed.js";
import { extractCommand } from "../commands/extract.js";
import { waybackCommand, type WaybackOptions } from "../commands/wayback.js";

/**
 * Registers the content commands on the given commander program.
 * @param program - The commander program to add the commands to
 */
export function registerContentCommands(program: Command): void {
  program
    .command("embed")
    .description("Convert linked local images to inline base64 data URIs")
    .argument(
      "<files...>",
      "Markdown files to process (supports globs like *.md, **/*.md)",
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
    $ markmv embed doc.md
    $ markmv embed docs/*.md --dry-run
    $ markmv embed "**/*.md" --verbose --json

  Behaviour:
    Reads each linked local image, base64-encodes it, and rewrites the
    markdown link to a data:image/...;base64 URI. An image file is deleted
    only when no file in the processed set still references it. Missing
    images and unsupported extensions are errors (exit 1); remote URLs and
    existing data URIs are left untouched.`,
    )
    .action(embedCommand);

  program
    .command("extract")
    .description(
      "Write inline base64 images out to image files and link to them",
    )
    .argument(
      "<files...>",
      "Markdown files to process (supports globs like *.md, **/*.md)",
    )
    .option(
      "--output-dir <dir>",
      "Directory for extracted image files (default: alongside each markdown file)",
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
    $ markmv extract doc.md
    $ markmv extract docs/*.md --output-dir assets/
    $ markmv extract "**/*.md" --dry-run --json

  Behaviour:
    Each data:image/...;base64 URI is decoded to a real image file (filename
    from the alt text when usable, else img-1.png, img-2.png, ...; extension
    from the mime type) and the markdown is rewritten to link to it. Existing
    files are never overwritten (-2, -3 suffixes are used). Non-image or
    non-base64 data URIs are errors (exit 1).`,
    )
    .action(extractCommand);

  program
    .command("wayback")
    .description("Convert HTTP(S) links to Wayback Machine archive URLs")
    .argument(
      "<files...>",
      "Markdown files to process (supports globs like *.md, **/*.md)",
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
    $ markmv wayback docs/*.md --dry-run
    $ markmv wayback README.md --verbose
    $ markmv wayback **/*.md --recursive
    $ markmv wayback docs/ --json

  Links already pointing at web.archive.org are preserved; mailto, ftp, and
  internal links are left untouched. No network calls are made.`,
    )
    .action(
      async (files: readonly string[], options: Readonly<WaybackOptions>) => {
        await waybackCommand([...files], options);
      },
    );
}
