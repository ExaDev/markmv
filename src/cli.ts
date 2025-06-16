#!/usr/bin/env node

import { Command } from 'commander';
import { convertCommand } from './commands/convert.js';
import { indexCommand } from './commands/index.js';
import { joinCommand } from './commands/join.js';
import { mergeCommand } from './commands/merge.js';
import { moveCommand } from './commands/move.js';
import { splitCommand } from './commands/split.js';
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
  .option('-d, --dry-run', 'Show what would be generated without creating files')
  .option('-v, --verbose', 'Show detailed output')
  .option('--json', 'Output results in JSON format')
  .action(indexCommand);

program
  .command('validate')
  .description('Find broken links in markdown files')
  .argument('<files...>', 'Markdown files to validate (supports globs like *.md, **/*.md)')
  .option(
    '--link-types <types>',
    'Comma-separated link types to check: internal,external,anchor,image,reference,claude-import'
  )
  .option('--check-external', 'Enable external HTTP/HTTPS link validation', false)
  .option('--external-timeout <ms>', 'Timeout for external link validation (ms)', parseInt, 5000)
  .option('--strict-internal', 'Treat missing internal files as errors', true)
  .option('--check-claude-imports', 'Validate Claude import paths', true)
  .option('--check-circular', 'Check for circular references in file dependencies', false)
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
  $ markmv validate docs/**/*.md --check-external --verbose
  $ markmv validate README.md --link-types internal,image --include-context
  $ markmv validate **/*.md --group-by type --only-broken
  $ markmv validate docs/ --check-circular --strict-internal

Link Types:
  internal        Links to other markdown files
  external        HTTP/HTTPS URLs
  anchor          Same-file section links (#heading)
  image           Image references (local and external)
  reference       Reference-style links ([text][ref])
  claude-import   Claude @import syntax (@path/to/file)

Output Options:
  --group-by file    Group broken links by file (default)
  --group-by type    Group broken links by link type`
  )
  .action(validateCommand);

program.parse();
