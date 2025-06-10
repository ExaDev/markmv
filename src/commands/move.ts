import { FileOperations } from '../core/file-operations.js';
import type { MoveOperationOptions } from '../types/operations.js';

export interface MoveOptions {
  dryRun?: boolean;
  verbose?: boolean;
}

export async function moveCommand(source: string, destination: string, options: MoveOptions): Promise<void> {
  const fileOps = new FileOperations();
  
  const moveOptions: MoveOperationOptions = {
    dryRun: options.dryRun || false,
    verbose: options.verbose || false,
    createDirectories: true,
  };

  if (options.verbose) {
    console.log(`🚀 Moving ${source} to ${destination}`);
    if (options.dryRun) {
      console.log('🔍 Dry run mode - no changes will be made');
    }
  }

  try {
    const result = await fileOps.moveFile(source, destination, moveOptions);

    if (!result.success) {
      console.error('❌ Move operation failed:');
      for (const error of result.errors) {
        console.error(`  ${error}`);
      }
      process.exit(1);
    }

    // Display results
    if (options.dryRun) {
      console.log('\n📋 Changes that would be made:');
      
      if (result.createdFiles.length > 0) {
        console.log('\n✅ Files that would be created:');
        for (const file of result.createdFiles) {
          console.log(`  + ${file}`);
        }
      }

      if (result.deletedFiles.length > 0) {
        console.log('\n🗑️  Files that would be deleted:');
        for (const file of result.deletedFiles) {
          console.log(`  - ${file}`);
        }
      }

      if (result.modifiedFiles.length > 0) {
        console.log('\n📝 Files that would be modified:');
        for (const file of result.modifiedFiles) {
          console.log(`  ~ ${file}`);
        }
      }

      if (result.changes.length > 0 && options.verbose) {
        console.log('\n🔗 Link changes:');
        for (const change of result.changes) {
          if (change.type === 'link-updated') {
            console.log(`  ${change.filePath}:${change.line} ${change.oldValue} → ${change.newValue}`);
          }
        }
      }

      console.log(`\n📊 Summary: ${result.changes.length} link(s) would be updated in ${result.modifiedFiles.length} file(s)`);
    } else {
      console.log('✅ Move operation completed successfully!');
      
      if (result.modifiedFiles.length > 0) {
        console.log(`📝 Updated ${result.changes.length} link(s) in ${result.modifiedFiles.length} file(s)`);
        
        if (options.verbose) {
          console.log('\nModified files:');
          for (const file of result.modifiedFiles) {
            console.log(`  ~ ${file}`);
          }
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

    // Validate the operation
    if (!options.dryRun && options.verbose) {
      console.log('\n🔍 Validating link integrity...');
      const validation = await fileOps.validateOperation(result);
      
      if (validation.valid) {
        console.log('✅ All links are valid');
      } else {
        console.log(`⚠️  Found ${validation.brokenLinks} broken link(s):`);
        for (const error of validation.errors) {
          console.log(`  ${error}`);
        }
      }
    }

  } catch (error) {
    console.error(`❌ Unexpected error: ${error}`);
    process.exit(1);
  }
}