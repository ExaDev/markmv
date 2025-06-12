#!/usr/bin/env node

import { Command } from 'commander';
import { convertCommand } from './commands/convert';
import { indexCommand } from './commands/index';
import { joinCommand } from './commands/join';
import { mergeCommand } from './commands/merge';
import { moveCommand } from './commands/move';
import { splitCommand } from './commands/split';

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
  .option('--base-path <path>', 'Base path for relative path calculations')
  .option('--link-style <style>', 'Convert link style: markdown|claude|combined|wikilink')
  .option('-r, --recursive', 'Process directories recursively')
  .option('-d, --dry-run', 'Show what would be changed without making changes')
  .option('-v, --verbose', 'Show detailed output')
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
  .option('-d, --dry-run', 'Show what would be generated without creating files')
  .option('-v, --verbose', 'Show detailed output')
  .action(indexCommand);

program.parse();
