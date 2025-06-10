/**
 * TypeScript example demonstrating programmatic usage of markmv
 * 
 * This example shows how to use markmv as a library with full TypeScript support.
 * 
 * To run: npx tsx examples/typescript-usage.ts
 * Or compile: tsc examples/typescript-usage.ts && node examples/typescript-usage.js
 */

import {
  createMarkMv,
  moveFile,
  moveFiles,
  validateOperation,
  FileOperations,
  type MoveOperationOptions,
  type OperationResult,
  type OperationChange
} from '../dist/index.js';

import { join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';

/**
 * Type-safe wrapper for file operations with enhanced error handling
 */
class SafeMarkMv {
  private fileOps: FileOperations;

  constructor() {
    this.fileOps = new FileOperations();
  }

  /**
   * Move a file with comprehensive result handling
   */
  async moveWithValidation(
    source: string, 
    destination: string, 
    options: MoveOperationOptions = {}
  ): Promise<{ 
    result: OperationResult; 
    validation: { valid: boolean; brokenLinks: number; errors: string[] } 
  }> {
    const result = await this.fileOps.moveFile(source, destination, options);
    const validation = await this.fileOps.validateOperation(result);
    
    return { result, validation };
  }

  /**
   * Get detailed statistics about an operation
   */
  getOperationStats(result: OperationResult): {
    filesAffected: number;
    linksUpdated: number;
    changesByType: Record<string, number>;
  } {
    const linkUpdates = result.changes.filter(c => c.type === 'link-updated');
    
    const changesByType = result.changes.reduce((acc, change) => {
      acc[change.type] = (acc[change.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      filesAffected: result.modifiedFiles.length + result.createdFiles.length + result.deletedFiles.length,
      linksUpdated: linkUpdates.length,
      changesByType
    };
  }
}

async function main(): Promise<void> {
  const exampleDir = join(__dirname, 'temp-ts-example');
  
  // Clean up and create example directory
  if (existsSync(exampleDir)) {
    rmSync(exampleDir, { recursive: true });
  }
  mkdirSync(exampleDir, { recursive: true });

  console.log('🚀 TypeScript Markmv API Examples\n');

  try {
    // Example 1: Type-safe options and results
    console.log('📝 Example 1: Type-safe configuration');
    
    const sourceFile = join(exampleDir, 'source.md');
    const destFile = join(exampleDir, 'destination.md');
    
    writeFileSync(sourceFile, `# Source Document

This document will be moved.

## Links
- [Related](./related.md)
- [Assets](./assets/image.png)

## Code
\`\`\`typescript
const example = "TypeScript code";
\`\`\`
`);

    writeFileSync(join(exampleDir, 'related.md'), '# Related Document\n\nThis is related content.');

    // Type-safe options
    const options: MoveOperationOptions = {
      dryRun: true,
      verbose: true,
      createDirectories: true
    };

    const result: OperationResult = await moveFile(sourceFile, destFile, options);
    
    console.log(`✅ Move operation: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`📊 Summary: ${result.modifiedFiles.length} modified, ${result.createdFiles.length} created, ${result.deletedFiles.length} deleted`);
    
    // Type-safe change analysis
    const linkChanges: OperationChange[] = result.changes.filter(c => c.type === 'link-updated');
    console.log(`🔗 Link updates: ${linkChanges.length}`);
    
    linkChanges.forEach(change => {
      console.log(`   📄 ${change.filePath}`);
      console.log(`      "${change.oldValue}" → "${change.newValue}"`);
    });
    console.log('');

    // Example 2: Using the enhanced wrapper class
    console.log('📝 Example 2: Enhanced wrapper with validation');
    
    const safeMarkMv = new SafeMarkMv();
    const { result: enhancedResult, validation } = await safeMarkMv.moveWithValidation(
      sourceFile, 
      destFile, 
      { dryRun: true }
    );

    const stats = safeMarkMv.getOperationStats(enhancedResult);
    
    console.log(`✅ Enhanced operation: ${enhancedResult.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`📊 Files affected: ${stats.filesAffected}`);
    console.log(`🔗 Links updated: ${stats.linksUpdated}`);
    console.log(`🔍 Validation: ${validation.valid ? 'PASSED' : 'FAILED'}`);
    console.log(`⚠️  Broken links: ${validation.brokenLinks}`);
    
    console.log('📋 Changes by type:');
    Object.entries(stats.changesByType).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });
    console.log('');

    // Example 3: Batch operations with type safety
    console.log('📝 Example 3: Batch operations');
    
    const files = ['doc1.md', 'doc2.md', 'doc3.md'].map(name => join(exampleDir, name));
    const destinations = ['new-doc1.md', 'new-doc2.md', 'new-doc3.md'].map(name => join(exampleDir, name));
    
    // Create source files
    files.forEach((file, index) => {
      writeFileSync(file, `# Document ${index + 1}

Content for document ${index + 1}.

[Link to doc ${((index + 1) % 3) + 1}](./doc${((index + 1) % 3) + 1}.md)
`);
    });

    const moves = files.map((source, index) => ({
      source,
      destination: destinations[index]
    }));

    const batchResult: OperationResult = await moveFiles(moves, { dryRun: true });
    
    console.log(`✅ Batch operation: ${batchResult.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`📁 Files in batch: ${moves.length}`);
    console.log(`📄 Files to be created: ${batchResult.createdFiles.length}`);
    console.log(`🗑️  Files to be deleted: ${batchResult.deletedFiles.length}`);
    console.log(`📝 Files to be modified: ${batchResult.modifiedFiles.length}`);
    
    // Detailed change analysis
    const changeTypes = new Set(batchResult.changes.map(c => c.type));
    console.log(`🔄 Change types: ${Array.from(changeTypes).join(', ')}`);
    console.log('');

    // Example 4: Error handling with types
    console.log('📝 Example 4: Error handling');
    
    try {
      const invalidResult = await moveFile(
        join(exampleDir, 'nonexistent.md'),
        join(exampleDir, 'destination.md'),
        { dryRun: true }
      );
      
      if (!invalidResult.success) {
        console.log('❌ Operation failed as expected:');
        invalidResult.errors.forEach(error => console.log(`   ${error}`));
      }
    } catch (error) {
      console.log('❌ Caught exception:', (error as Error).message);
    }

  } catch (error) {
    console.error('❌ Error running TypeScript examples:', (error as Error).message);
  } finally {
    // Clean up
    if (existsSync(exampleDir)) {
      rmSync(exampleDir, { recursive: true });
    }
    console.log('🧹 Cleaned up temporary files');
  }
}

// Advanced usage patterns
interface ProjectConfig {
  sourceDir: string;
  outputDir: string;
  moveOptions: MoveOperationOptions;
}

/**
 * Example of a more complex integration pattern
 */
class ProjectReorganizer {
  private config: ProjectConfig;
  private markmv: FileOperations;

  constructor(config: ProjectConfig) {
    this.config = config;
    this.markmv = createMarkMv();
  }

  async reorganizeProject(): Promise<OperationResult[]> {
    // This would contain your project-specific logic
    console.log('📁 Project reorganization would happen here...');
    
    // Example: Move all docs to a new structure
    const results: OperationResult[] = [];
    
    // Simulate some moves
    const exampleMoves = [
      { source: join(this.config.sourceDir, 'readme.md'), destination: join(this.config.outputDir, 'README.md') }
    ];

    for (const move of exampleMoves) {
      const result = await this.markmv.moveFile(move.source, move.destination, this.config.moveOptions);
      results.push(result);
    }

    return results;
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}