import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import {
  AppendMergeStrategy,
  InteractiveMergeStrategy,
  PrependMergeStrategy,
} from '../strategies/merge-strategies.js';

/**
 * Configuration options for merge command operations.
 *
 * Controls how content from one markdown file is merged into another, including strategy selection,
 * transclusion creation, and preview mode.
 *
 * @category Commands
 */
export interface MergeOptions {
  /** Strategy for merging content into the target file */
  strategy?: 'append' | 'prepend' | 'interactive';
  /** Perform a dry run without making actual changes */
  dryRun?: boolean;
  /** Enable verbose output with detailed progress information */
  verbose?: boolean;
  /** Create Obsidian-style transclusions instead of copying content */
  createTransclusions?: boolean;
}

/**
 * Execute the merge command to combine content from one markdown file into another.
 *
 * This command provides intelligent merging of markdown content using various strategies and
 * conflict resolution. It supports:
 *
 * - Append strategy (add content to the end)
 * - Prepend strategy (add content to the beginning)
 * - Interactive strategy (resolve conflicts interactively)
 * - Obsidian transclusion creation for reference-based merging
 * - Frontmatter merging and conflict resolution
 * - Dry run mode for previewing changes
 *
 * The merge operation intelligently handles frontmatter, content sections, and provides
 * comprehensive conflict detection and resolution.
 *
 * @category Commands
 *
 * @example
 *   Append merge with transclusions
 *   ```typescript
 *   await mergeCommand('notes/section.md', 'docs/handbook.md', {
 *   strategy: 'append',
 *   createTransclusions: true,
 *   verbose: true
 *   });
 *   ```
 *
 * @example
 *   Interactive merge with dry run
 *   ```typescript
 *   await mergeCommand('draft.md', 'final.md', {
 *   strategy: 'interactive',
 *   dryRun: true,
 *   verbose: true
 *   });
 *   ```
 *
 * @example
 *   Prepend merge
 *   ```typescript
 *   await mergeCommand('intro.md', 'document.md', {
 *   strategy: 'prepend'
 *   });
 *   ```
 *
 * @param source - Path to the source markdown file to merge from
 * @param target - Path to the target markdown file to merge into
 * @param options - Configuration options for the merge operation
 *
 * @throws Will exit the process with code 1 if the operation fails
 */
export async function mergeCommand(
  source: string,
  target: string,
  options: MergeOptions
): Promise<void> {
  const strategy = options.strategy || 'interactive';

  if (options.verbose) {
    console.log(`🔀 Merging ${source} into ${target} using ${strategy} strategy`);
    if (options.dryRun) {
      console.log('🔍 Dry run mode - no changes will be made');
    }
    if (options.createTransclusions) {
      console.log('🔗 Creating Obsidian transclusions where possible');
    }
  }

  try {
    // Check if files exist
    await fs.access(source);
    await fs.access(target);

    // Read file contents
    const sourceContent = await fs.readFile(source, 'utf8');
    const targetContent = await fs.readFile(target, 'utf8');

    // Choose strategy
    let mergeStrategy: AppendMergeStrategy | PrependMergeStrategy | InteractiveMergeStrategy;
    switch (strategy) {
      case 'append':
        mergeStrategy = new AppendMergeStrategy({
          createTransclusions: options.createTransclusions || false,
        });
        break;
      case 'prepend':
        mergeStrategy = new PrependMergeStrategy({
          createTransclusions: options.createTransclusions || false,
        });
        break;
      default:
        mergeStrategy = new InteractiveMergeStrategy({
          createTransclusions: options.createTransclusions || false,
        });
        break;
    }

    // Perform the merge
    const result = await mergeStrategy.merge(targetContent, sourceContent, target, source);

    if (!result.success) {
      console.error('❌ Merge operation failed:');
      for (const error of result.errors) {
        console.error(`  ${error}`);
      }
      process.exit(1);
    }

    // Build final content
    let finalContent = '';
    if (result.frontmatter) {
      finalContent += result.frontmatter;
      if (!result.frontmatter.endsWith('\n')) {
        finalContent += '\n';
      }
      finalContent += '\n';
    }
    finalContent += result.content;

    // Display results
    if (options.dryRun) {
      console.log('\\n📋 Changes that would be made:');
      console.log('\\n📝 File that would be modified:');
      console.log(`  ~ ${target}`);

      if (options.verbose) {
        console.log('\\n📄 Preview of merged content:');
        const previewLines = finalContent.split('\\n').slice(0, 10);
        for (const line of previewLines) {
          console.log(`  ${line}`);
        }
        if (finalContent.split('\\n').length > 10) {
          console.log('  ... (content truncated)');
        }
      }

      console.log('\\n📊 Summary: Would modify 1 file');
    } else {
      // Write the merged content
      await fs.mkdir(dirname(target), { recursive: true });
      await fs.writeFile(target, finalContent, 'utf8');

      console.log('✅ Merge operation completed successfully!');
      console.log(`📝 Modified: ${target}`);

      if (result.transclusions.length > 0) {
        console.log(`\\n🔗 Created ${result.transclusions.length} transclusion(s):`);
        for (const transclusion of result.transclusions) {
          console.log(`  + ${transclusion}`);
        }
      }
    }

    // Display conflicts
    if (result.conflicts.length > 0) {
      console.log('\\n⚠️  Conflicts detected:');
      for (const conflict of result.conflicts) {
        console.log(`  • ${conflict.type}: ${conflict.description}`);
        if (conflict.resolution) {
          console.log(`    Resolution: ${conflict.resolution}`);
        }
        if (!conflict.autoResolved) {
          console.log('    ⚠️  Manual resolution required');
        }
      }
    }

    // Display warnings
    if (result.warnings.length > 0) {
      console.log('\\n⚠️  Warnings:');
      for (const warning of result.warnings) {
        console.log(`  ${warning}`);
      }
    }

    // Show helpful tips
    if (!options.dryRun && result.success) {
      console.log('\\n💡 Tips:');
      console.log('  • Use --dry-run to preview changes before merging');
      console.log('  • Use --verbose for detailed operation logs');
      if (strategy === 'append') {
        console.log('  • Content was appended to the end of the target file');
      } else if (strategy === 'prepend') {
        console.log('  • Content was prepended to the beginning of the target file');
      } else if (strategy === 'interactive') {
        console.log('  • Review merge conflicts and resolve manually if needed');
      }
      console.log(
        '  • Use --create-transclusions to create Obsidian-style references instead of copying content'
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(`❌ File not found: ${(error as NodeJS.ErrnoException).path}`);
    } else {
      console.error(`❌ Unexpected error: ${error}`);
    }
    process.exit(1);
  }
}
