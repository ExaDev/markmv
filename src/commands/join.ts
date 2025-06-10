import { ContentJoiner } from '../core/content-joiner.js';
import type { JoinOperationOptions } from '../types/operations.js';

export interface JoinOptions {
  output?: string;
  dryRun?: boolean;
  orderStrategy?: 'alphabetical' | 'manual' | 'dependency' | 'chronological';
  verbose?: boolean;
}

export async function joinCommand(files: string[], options: JoinOptions): Promise<void> {
  const joiner = new ContentJoiner();

  if (files.length === 0) {
    console.error('❌ No files provided to join');
    process.exit(1);
  }

  if (files.length === 1) {
    console.error('❌ At least two files are required for joining');
    process.exit(1);
  }

  const joinOptions: JoinOperationOptions = {
    output: options.output,
    dryRun: options.dryRun || false,
    verbose: options.verbose || false,
    orderStrategy: options.orderStrategy || 'dependency',
  };

  if (options.verbose) {
    console.log(`🔗 Joining ${files.length} files using ${joinOptions.orderStrategy} strategy`);
    console.log(`📁 Input files: ${files.join(', ')}`);
    if (options.output) {
      console.log(`📄 Output file: ${options.output}`);
    }
    if (options.dryRun) {
      console.log('🔍 Dry run mode - no changes will be made');
    }
  }

  try {
    const result = await joiner.joinFiles(files, joinOptions);

    if (!result.success) {
      console.error('❌ Join operation failed:');
      for (const error of result.errors) {
        console.error(`  ${error}`);
      }
      process.exit(1);
    }

    // Display results
    if (options.dryRun) {
      console.log('\\n📋 Changes that would be made:');

      if (result.createdFiles.length > 0) {
        console.log('\\n📄 Files that would be created:');
        for (const file of result.createdFiles) {
          console.log(`  + ${file}`);
        }
      }

      if (result.modifiedFiles.length > 0) {
        console.log('\\n📝 Files that would be modified:');
        for (const file of result.modifiedFiles) {
          console.log(`  ~ ${file}`);
        }
      }

      if (result.changes.length > 0 && options.verbose) {
        console.log('\\n🔗 Changes:');
        for (const change of result.changes) {
          if (change.type === 'file-created') {
            console.log(`  + Created: ${change.filePath}`);
          } else if (change.type === 'link-updated') {
            console.log(`  ~ Updated links in: ${change.filePath}`);
          }
        }
      }

      console.log(
        `\\n📊 Summary: Would create ${result.createdFiles.length} file(s) and modify ${result.modifiedFiles.length} file(s)`
      );
    } else {
      console.log('✅ Join operation completed successfully!');

      if (result.createdFiles.length > 0) {
        console.log(`📄 Created file: ${result.createdFiles[0]}`);
      }

      if (result.modifiedFiles.length > 0) {
        console.log(`\\n📝 Modified ${result.modifiedFiles.length} file(s):`);
        for (const file of result.modifiedFiles) {
          console.log(`  ~ ${file}`);
        }
      }

      if (options.verbose && result.changes.length > 0) {
        const linkUpdates = result.changes.filter((c) => c.type === 'link-updated').length;
        if (linkUpdates > 0) {
          console.log(`\\n🔗 Updated links in ${linkUpdates} file(s)`);
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
      console.log('  • Use --dry-run to preview changes before joining');
      console.log('  • Use --verbose for detailed operation logs');
      if (joinOptions.orderStrategy === 'dependency') {
        console.log('  • Files are ordered by dependency relationships');
      } else if (joinOptions.orderStrategy === 'alphabetical') {
        console.log('  • Files are ordered alphabetically by title');
      } else if (joinOptions.orderStrategy === 'chronological') {
        console.log('  • Files are ordered by date (from frontmatter or filename)');
      }
    }
  } catch (error) {
    console.error(`❌ Unexpected error: ${error}`);
    process.exit(1);
  }
}
