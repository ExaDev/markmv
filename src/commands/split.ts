import { ContentSplitter } from '../core/content-splitter.js';
import type { SplitOperationOptions } from '../types/operations.js';

export interface SplitOptions {
  strategy?: 'headers' | 'size' | 'manual' | 'lines';
  output?: string;
  dryRun?: boolean;
  headerLevel?: number;
  maxSize?: number;
  splitLines?: string; // Comma-separated line numbers
  verbose?: boolean;
}

export async function splitCommand(source: string, options: SplitOptions): Promise<void> {
  const splitter = new ContentSplitter();

  // Parse split lines if provided
  let splitLines: number[] | undefined;
  if (options.splitLines) {
    try {
      splitLines = options.splitLines
        .split(',')
        .map((line) => Number.parseInt(line.trim(), 10))
        .filter((line) => !isNaN(line));

      if (splitLines.length === 0) {
        console.error('❌ Invalid split lines format. Use comma-separated numbers like: 10,25,50');
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Failed to parse split lines:', error);
      process.exit(1);
    }
  }

  const splitOptions: SplitOperationOptions = {
    strategy: options.strategy || 'headers',
    outputDir: options.output,
    dryRun: options.dryRun || false,
    verbose: options.verbose || false,
    headerLevel: options.headerLevel || 2,
    maxSize: options.maxSize || 100,
    splitLines,
  };

  if (options.verbose) {
    console.log(`🔪 Splitting ${source} using ${splitOptions.strategy} strategy`);
    if (options.dryRun) {
      console.log('🔍 Dry run mode - no changes will be made');
    }
    if (splitOptions.strategy === 'headers') {
      console.log(`📋 Split on header level: ${splitOptions.headerLevel}`);
    }
    if (splitOptions.strategy === 'size') {
      console.log(`📏 Maximum size per section: ${splitOptions.maxSize}KB`);
    }
    if (splitOptions.strategy === 'lines' && splitOptions.splitLines) {
      console.log(`📍 Split at lines: ${splitOptions.splitLines.join(', ')}`);
    }
  }

  try {
    const result = await splitter.splitFile(source, splitOptions);

    if (!result.success) {
      console.error('❌ Split operation failed:');
      for (const error of result.errors) {
        console.error(`  ${error}`);
      }
      process.exit(1);
    }

    // Display results
    if (options.dryRun) {
      console.log('\n📋 Changes that would be made:');

      if (result.createdFiles.length > 0) {
        console.log('\n📄 Files that would be created:');
        for (const file of result.createdFiles) {
          console.log(`  + ${file}`);
        }
      }

      if (result.modifiedFiles.length > 0) {
        console.log('\n📝 Files that would be modified:');
        for (const file of result.modifiedFiles) {
          console.log(`  ~ ${file}`);
        }
      }

      if (result.changes.length > 0 && options.verbose) {
        console.log('\n🔗 Changes:');
        for (const change of result.changes) {
          if (change.type === 'file-created') {
            console.log(`  + Created: ${change.filePath}`);
          } else if (change.type === 'link-updated') {
            console.log(`  ~ Updated links in: ${change.filePath}`);
          }
        }
      }

      console.log(
        `\n📊 Summary: Would create ${result.createdFiles.length} file(s) and modify ${result.modifiedFiles.length} file(s)`
      );
    } else {
      console.log('✅ Split operation completed successfully!');

      console.log(`📄 Created ${result.createdFiles.length} new file(s):`);
      for (const file of result.createdFiles) {
        console.log(`  + ${file}`);
      }

      if (result.modifiedFiles.length > 0) {
        console.log(`\n📝 Modified ${result.modifiedFiles.length} file(s):`);
        for (const file of result.modifiedFiles) {
          console.log(`  ~ ${file}`);
        }
      }

      if (options.verbose && result.changes.length > 0) {
        const linkUpdates = result.changes.filter((c) => c.type === 'link-updated').length;
        if (linkUpdates > 0) {
          console.log(`\n🔗 Updated links in ${linkUpdates} file(s)`);
        }
      }
    }

    // Display warnings
    if (result.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      for (const warning of result.warnings) {
        console.log(`  ${warning}`);
      }
    }

    // Show helpful tips
    if (!options.dryRun && result.success) {
      console.log('\n💡 Tips:');
      console.log('  • Use --dry-run to preview changes before splitting');
      console.log('  • Use --verbose for detailed operation logs');
      if (splitOptions.strategy === 'headers') {
        console.log('  • Use --header-level to control which headers trigger splits');
      }
      if (splitOptions.strategy === 'size') {
        console.log('  • Use --max-size to adjust the maximum file size (in KB)');
      }
      if (splitOptions.strategy === 'lines') {
        console.log(
          '  • Use --split-lines with comma-separated line numbers (e.g., --split-lines 10,25,50)'
        );
      }
    }
  } catch (error) {
    console.error(`❌ Unexpected error: ${error}`);
    process.exit(1);
  }
}
