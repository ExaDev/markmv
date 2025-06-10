#!/usr/bin/env node

/**
 * Example demonstrating programmatic usage of markmv
 * 
 * This example shows how to use markmv as a library in your Node.js applications.
 * 
 * Run with: node examples/programmatic-usage.js
 */

const { 
  createMarkMv, 
  moveFile, 
  moveFiles, 
  FileOperations 
} = require('../dist/index.js');

const { join } = require('path');
const { writeFileSync, mkdirSync, rmSync, existsSync } = require('fs');

async function main() {
  // Create a temporary directory for examples
  const exampleDir = join(__dirname, 'temp-example');
  
  if (existsSync(exampleDir)) {
    rmSync(exampleDir, { recursive: true });
  }
  mkdirSync(exampleDir, { recursive: true });

  console.log('🚀 Markmv Programmatic API Examples\n');

  try {
    // Example 1: Using the convenience factory function
    console.log('📝 Example 1: Using createMarkMv()');
    
    const sourceFile = join(exampleDir, 'document.md');
    const destFile = join(exampleDir, 'renamed-document.md');
    
    writeFileSync(sourceFile, `# My Document

This is a sample markdown document.

## Section 1
Some content here.

[Link to another file](./other.md)
`);

    writeFileSync(join(exampleDir, 'other.md'), `# Other File

This is referenced by document.md.
`);

    const markmv = createMarkMv();
    const result = await markmv.moveFile(sourceFile, destFile, { 
      dryRun: true, 
      verbose: true 
    });

    console.log(`✅ Operation ${result.success ? 'succeeded' : 'failed'}`);
    console.log(`📁 Files to be modified: ${result.modifiedFiles.length}`);
    console.log(`📄 Files to be created: ${result.createdFiles.length}`);
    console.log(`🗑️  Files to be deleted: ${result.deletedFiles.length}`);
    
    if (result.changes.length > 0) {
      console.log('📋 Changes preview:');
      result.changes.forEach(change => {
        console.log(`   ${change.type}: ${change.filePath}`);
        if (change.oldValue && change.newValue) {
          console.log(`      "${change.oldValue}" → "${change.newValue}"`);
        }
      });
    }
    console.log('');

    // Example 2: Using convenience functions
    console.log('📝 Example 2: Using convenience functions');
    
    const file1 = join(exampleDir, 'file1.md');
    const file2 = join(exampleDir, 'file2.md');
    const newFile1 = join(exampleDir, 'renamed-file1.md');
    const newFile2 = join(exampleDir, 'renamed-file2.md');

    writeFileSync(file1, '# File 1\n\nContent of file 1.\n');
    writeFileSync(file2, '# File 2\n\nContent of file 2.\n');

    // Single file move
    const singleResult = await moveFile(file1, newFile1, { dryRun: true });
    console.log(`✅ Single move ${singleResult.success ? 'succeeded' : 'failed'}`);

    // Multiple file moves
    const multiResult = await moveFiles([
      { source: file1, destination: newFile1 },
      { source: file2, destination: newFile2 }
    ], { dryRun: true });
    console.log(`✅ Multi move ${multiResult.success ? 'succeeded' : 'failed'}`);
    console.log(`📁 Would move ${multiResult.createdFiles.length} files`);
    console.log('');

    // Example 3: Direct class usage with complex operations
    console.log('📝 Example 3: Direct FileOperations class usage');
    
    const fileOps = new FileOperations();
    
    const complexFile = join(exampleDir, 'complex.md');
    const complexDest = join(exampleDir, 'moved-complex.md');
    
    writeFileSync(complexFile, `# Complex Document

This document has many references:

- [Document](./document.md)
- [Other file](./other.md)
- [External link](https://example.com)

## Section with image
![Diagram](./assets/diagram.png)

## Cross-references
See [document](./document.md#section-1) for details.
`);

    const complexResult = await fileOps.moveFile(complexFile, complexDest, {
      dryRun: true,
      verbose: true
    });

    console.log(`✅ Complex move ${complexResult.success ? 'succeeded' : 'failed'}`);
    console.log(`🔗 Link updates required: ${complexResult.changes.filter(c => c.type === 'link-updated').length}`);
    
    // Validate the operation
    const validation = await fileOps.validateOperation(complexResult);
    console.log(`🔍 Validation: ${validation.valid ? 'passed' : 'failed'}`);
    console.log(`⚠️  Broken links: ${validation.brokenLinks}`);
    
    if (validation.errors.length > 0) {
      console.log('❌ Validation errors:');
      validation.errors.forEach(error => console.log(`   ${error}`));
    }

  } catch (error) {
    console.error('❌ Error running examples:', error.message);
  } finally {
    // Clean up
    if (existsSync(exampleDir)) {
      rmSync(exampleDir, { recursive: true });
    }
    console.log('\n🧹 Cleaned up temporary files');
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };