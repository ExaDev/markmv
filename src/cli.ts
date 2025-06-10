#!/usr/bin/env node

import { Command } from 'commander';
import { moveCommand } from './commands/move';
import { splitCommand } from './commands/split';
import { joinCommand } from './commands/join';
import { mergeCommand } from './commands/merge';

const program = new Command();

program
  .name('markmv')
  .description('CLI for markdown file operations with intelligent link refactoring')
  .version('0.1.0');

program
  .command('move')
  .description('Move markdown files while updating cross-references')
  .argument('<source>', 'Source markdown file or directory')
  .argument('<destination>', 'Destination path')
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
  .option('-d, --dry-run', 'Show what would be changed without making changes')
  .action(joinCommand);

program
  .command('merge')
  .description('Merge markdown content with link reconciliation')
  .argument('<source>', 'Source markdown file')
  .argument('<target>', 'Target markdown file to merge into')
  .option('-s, --strategy <strategy>', 'Merge strategy: append|prepend|interactive', 'interactive')
  .option('-d, --dry-run', 'Show what would be changed without making changes')
  .action(mergeCommand);

program.parse();