#!/usr/bin/env node

import { Command } from 'commander';
import { convertCommand } from './commands/convert.js';
import { indexCommand } from './commands/index.js';
import { joinCommand } from './commands/join.js';
import { mergeCommand } from './commands/merge.js';
import { moveCommand } from './commands/move.js';
import { splitCommand } from './commands/split.js';
import { tocCommand } from './commands/toc.js';
import { validateCommand } from './commands/validate.js';

const program = new Command();

program
  .name('markmv')
  .description('CLI for markdown file operations with intelligent link refactoring')
  .version('0.1.0');

program
  .command('convert')
  .description('Convert markdown link formats and path resolution')
  .argument('<files...>', 'Markdown files to convert (supports globs like *.md, **/*.md)')
  .option('--path-resolution <type>', 'Convert path resolution: absolute|relative')
  .option(
    '--base-path <path>',
    'Base path for relative path calculations (defaults to current directory)'
  )
  .option('--link-style <style>', 'Convert link style: markdown|claude|combined|wikilink')
  .option('-r, --recursive', 'Process directories recursively')
  .option('-d, --dry-run', 'Show what would be changed without making changes')
  .option('-v, --verbose', 'Show detailed output with processing information')
  .option('--json', 'Output results in JSON format')
  .addHelpText(
    'after',
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
  relative  Convert to relative file paths from base-path`
  )
  .action(convertCommand);

program
  .command('move')
  .description('Move markdown files while updating cross-references')
  .argument(
    '<sources...>',
    'Source markdown files and destination (supports globs like *.md, **/*.md)'
  )
  .option('-d, --dry-run', 'Show what would be changed without making changes')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output results in JSON format')
  .action(moveCommand);

program
  .command('split')
  .description('Split large markdown files maintaining link integrity')
  .argument('<source>', 'Source markdown file to split')
  .option('-s, --strategy <strategy>', 'Split strategy: headers|size|manual|lines', 'headers')
  .option('-o, --output <dir>', 'Output directory for split files')
  .option('-l, --header-level <level>', 'Header level to split on (1-6)', '2')
  .option('-m, --max-size <kb>', 'Maximum size per section in KB', '100')
  .option('--split-lines <lines>', 'Comma-separated line numbers to split on (for lines strategy)')
  .option('-d, --dry-run', 'Show what would be changed without making changes')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output results in JSON format')
  .action(splitCommand);

program
  .command('join')
  .description('Join multiple markdown files resolving conflicts')
  .argument('<files...>', 'Markdown files to join')
  .option('-o, --output <file>', 'Output file name')
  .option(
    '--order-strategy <strategy>',
    'Order strategy: alphabetical|manual|dependency|chronological',
    'dependency'
  )
  .option('-d, --dry-run', 'Show what would be changed without making changes')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output results in JSON format')
  .action(joinCommand);

program
  .command('merge')
  .description('Merge markdown content with link reconciliation')
  .argument('<source>', 'Source markdown file')
  .argument('<target>', 'Target markdown file to merge into')
  .option('-s, --strategy <strategy>', 'Merge strategy: append|prepend|interactive', 'interactive')
  .option('--create-transclusions', 'Create Obsidian transclusions instead of copying content')
  .option('-d, --dry-run', 'Show what would be changed without making changes')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output results in JSON format')
  .action(mergeCommand);

program
  .command('index')
  .description('Generate index files for markdown documentation')
  .argument('[directory]', 'Directory to generate indexes for', '.')
  .option('-t, --type <type>', 'Index type: links|import|embed|hybrid', 'links')
  .option(
    '-s, --strategy <strategy>',
    'Organization strategy: directory|metadata|manual',
    'directory'
  )
  .option('-l, --location <location>', 'Index placement: all|root|branch|existing', 'root')
  .option('-n, --name <name>', 'Index filename', 'index.md')
  .option('--embed-style <style>', 'Embed style for embed type: obsidian|markdown', 'obsidian')
  .option('--template <file>', 'Custom template file')
  .option('--max-depth <number>', 'Maximum depth to traverse subdirectories', parseInt)
  .option('--no-traverse-up', 'Prevent traversing above the specified directory')
  .option('--boundary <path>', 'Explicit boundary path to limit scanning scope')
  .option('--generate-toc', 'Generate table of contents for each indexed file')
  .option('--toc-min-depth <number>', 'Minimum heading level for TOC (1-6)', parseInt, 1)
  .option('--toc-max-depth <number>', 'Maximum heading level for TOC (1-6)', parseInt, 6)
  .option('--toc-include-line-numbers', 'Include line numbers in table of contents')
  .option('-d, --dry-run', 'Show what would be generated without creating files')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output results in JSON format')
  .addHelpText(
    'after',
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
  existing  Update only existing index files`
  )
  .action(indexCommand);

program
  .command('barrel')
  .description('Generate barrel files for themed content aggregation (alias for index)')
  .argument('[directory]', 'Directory to generate barrel files for', '.')
  .option('-t, --type <type>', 'Barrel type: links|import|embed|hybrid', 'links')
  .option(
    '-s, --strategy <strategy>',
    'Organization strategy: directory|metadata|manual',
    'directory'
  )
  .option('-l, --location <location>', 'Barrel placement: all|root|branch|existing', 'root')
  .option('-n, --name <name>', 'Barrel filename', 'index.md')
  .option('--embed-style <style>', 'Embed style for embed type: obsidian|markdown', 'obsidian')
  .option('--template <file>', 'Custom template file')
  .option('--max-depth <number>', 'Maximum depth to traverse subdirectories', parseInt)
  .option('--no-traverse-up', 'Prevent traversing above the specified directory')
  .option('--boundary <path>', 'Explicit boundary path to limit scanning scope')
  .option('--generate-toc', 'Generate table of contents for each indexed file')
  .option('--toc-min-depth <number>', 'Minimum heading level for TOC (1-6)', parseInt, 1)
  .option('--toc-max-depth <number>', 'Maximum heading level for TOC (1-6)', parseInt, 6)
  .option('--toc-include-line-numbers', 'Include line numbers in table of contents')
  .option('-d, --dry-run', 'Show what would be generated without creating files')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output results in JSON format')
  .addHelpText(
    'after',
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

Note: This is an alias for the 'index' command with barrel-focused terminology.`
  )
  .action(indexCommand);

program
  .command('toc')
  .description('Generate and insert table of contents into markdown files')
  .argument('<files...>', 'Markdown files to process (supports globs like *.md, **/*.md)')
  .option('--min-depth <number>', 'Minimum heading level to include (1-6)', parseInt, 1)
  .option('--max-depth <number>', 'Maximum heading level to include (1-6)', parseInt, 6)
  .option('--include-line-numbers', 'Include line numbers in TOC entries')
  .option(
    '--position <position>',
    'TOC position: top|after-title|before-content|replace',
    'after-title'
  )
  .option('--title <title>', 'TOC title', 'Table of Contents')
  .option('--heading-level <level>', 'TOC heading level (1-6)', parseInt, 2)
  .option('--marker <marker>', 'Custom marker for TOC replacement (requires --position replace)')
  .option('--skip-empty', "Skip files that don't have any headings", true)
  .option('-d, --dry-run', 'Show what would be changed without making changes')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output results in JSON format')
  .addHelpText(
    'after',
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
  --include-line-numbers   Include line numbers in TOC entries`
  )
  .action(tocCommand);

program
  .command('validate')
  .description('Find broken links in markdown files')
  .argument(
    '[files...]',
    'Markdown files to validate (supports globs like *.md, **/*.md, defaults to current directory)'
  )
  .option(
    '--link-types <types>',
    'Comma-separated link types to check: internal,external,anchor,image,reference,claude-import'
  )
  .option('--check-external', 'Enable external HTTP/HTTPS link validation', false)
  .option('--external-timeout <ms>', 'Timeout for external link validation (ms)', parseInt, 5000)
  .option('--strict-internal', 'Treat missing internal files as errors', true)
  .option('--check-claude-imports', 'Validate Claude import paths', true)
  .option('--check-circular', 'Check for circular references in file dependencies', false)
  .option('--check-content-freshness', 'Enable content freshness detection for external links', false)
  .option('--freshness-threshold <days>', 'Content staleness threshold in days', parseInt, 730)
  .option('--max-depth <number>', 'Maximum depth to traverse subdirectories', parseInt)
  .option('--only-broken', 'Show only broken links, not all validation results', true)
  .option('--group-by <method>', 'Group results by: file|type', 'file')
  .option('--include-context', 'Include line numbers and context in output', false)
  .option('-v, --verbose', 'Show detailed output with processing information')
  .option('--json', 'Output results in JSON format')
  .addHelpText(
    'after',
    `
Examples:
  $ markmv validate                                         # Validate current directory
  $ markmv validate .                                       # Validate current directory  
  $ markmv validate ./                                      # Validate current directory
  $ markmv validate docs/**/*.md --check-external --verbose
  $ markmv validate README.md --link-types internal,image --include-context
  $ markmv validate **/*.md --group-by type --only-broken
  $ markmv validate docs/ --check-circular --strict-internal

Content Freshness Examples:
  $ markmv validate --check-external --check-content-freshness
  $ markmv validate docs/ --check-content-freshness --freshness-threshold 365
  $ markmv validate README.md --check-external --check-content-freshness --verbose

Link Types:
  internal        Links to other markdown files
  external        HTTP/HTTPS URLs
  anchor          Same-file section links (#heading)
  image           Image references (local and external)
  reference       Reference-style links ([text][ref])
  claude-import   Claude @import syntax (@path/to/file)

Content Freshness Options:
  --check-content-freshness     Enable staleness detection for external links
  --freshness-threshold <days>  Content staleness threshold (default: 730 days)

Output Options:
  --group-by file    Group broken links by file (default)
  --group-by type    Group broken links by link type`
  )
  .action(validateCommand);

program.parse();
