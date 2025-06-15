#!/usr/bin/env node

/**
 * Local cross-platform testing script
 * Simulates different filesystem behaviors for testing
 */

import { platform } from 'node:os';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';

const currentPlatform = platform();

console.log('🧪 Running cross-platform tests locally...');
console.log(`📋 Current platform: ${currentPlatform}`);

// Set up test environment variables
const testEnv = {
  ...process.env,
  MARKMV_TEST_OS: currentPlatform,
  MARKMV_TEST_CROSS_PLATFORM: 'true',
};

// Detect filesystem capabilities
function detectFilesystemCapabilities() {
  const testDir = join(process.cwd(), 'temp-fs-test');
  
  // Clean up any existing test directory
  try {
    execSync(`rm -rf "${testDir}"`, { stdio: 'ignore' });
  } catch {
    // Ignore errors
  }
  
  mkdirSync(testDir, { recursive: true });
  
  const capabilities = {
    caseSensitive: false,
    supportsSymlinks: false,
    supportsSpaces: false,
  };
  
  try {
    // Test case sensitivity
    writeFileSync(join(testDir, 'testfile.txt'), 'lowercase');
    writeFileSync(join(testDir, 'TESTFILE.TXT'), 'uppercase');
    
    const lowercaseExists = existsSync(join(testDir, 'testfile.txt'));
    const uppercaseExists = existsSync(join(testDir, 'TESTFILE.TXT'));
    
    capabilities.caseSensitive = lowercaseExists && uppercaseExists;
    
    // Test symbolic links
    try {
      writeFileSync(join(testDir, 'original.txt'), 'original content');
      execSync(`ln -s original.txt symlink.txt`, { 
        cwd: testDir, 
        stdio: 'ignore' 
      });
      
      const symlinkPath = join(testDir, 'symlink.txt');
      if (existsSync(symlinkPath)) {
        const stats = lstatSync(symlinkPath);
        capabilities.supportsSymlinks = stats.isSymbolicLink();
      }
    } catch {
      // Symlinks not supported
    }
    
    // Test spaces in filenames
    try {
      writeFileSync(join(testDir, 'file with spaces.txt'), 'content');
      capabilities.supportsSpaces = existsSync(join(testDir, 'file with spaces.txt'));
    } catch {
      // Spaces not supported
    }
    
  } finally {
    // Clean up
    try {
      execSync(`rm -rf "${testDir}"`, { stdio: 'ignore' });
    } catch {
      // Ignore cleanup errors
    }
  }
  
  return capabilities;
}

function runTests() {
  console.log('🔍 Detecting filesystem capabilities...');
  const capabilities = detectFilesystemCapabilities();
  
  console.log('📊 Filesystem capabilities:');
  console.log(`  Case sensitive: ${capabilities.caseSensitive}`);
  console.log(`  Symbolic links: ${capabilities.supportsSymlinks}`);
  console.log(`  Spaces in filenames: ${capabilities.supportsSpaces}`);
  
  // Update environment with detected capabilities
  testEnv.MARKMV_TEST_CASE_SENSITIVE = capabilities.caseSensitive.toString();
  testEnv.MARKMV_TEST_SUPPORTS_SYMLINKS = capabilities.supportsSymlinks.toString();
  testEnv.MARKMV_TEST_FILESYSTEM_CASE_SENSITIVE = capabilities.caseSensitive.toString();
  
  console.log('🏃 Running tests with cross-platform environment...');
  
  try {
    // Run the test suite with our environment
    execSync('npm run test:run', {
      env: testEnv,
      stdio: 'inherit',
    });
    
    console.log('✅ Cross-platform tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Cross-platform tests failed:');
    console.error(error.message);
    process.exit(1);
  }
}

function createTestData() {
  console.log('📁 Creating cross-platform test data...');
  
  const testDataDir = join(process.cwd(), 'test-data', 'cross-platform');
  mkdirSync(testDataDir, { recursive: true });
  
  // Create test files
  const testFiles = {
    'doc1.md': '# Test Document 1\n\n[Link to doc2](./doc2.md)',
    'doc2.md': '# Test Document 2\n\n[Link back to doc1](./doc1.md)',
    'lowercase.md': '# Lowercase Document',
    'UPPERCASE.md': '# Uppercase Document',
    'document with spaces.md': '# Document with Spaces',
    'document-with-dashes.md': '# Document with Dashes',
    'document_with_underscores.md': '# Document with Underscores',
  };
  
  for (const [filename, content] of Object.entries(testFiles)) {
    try {
      writeFileSync(join(testDataDir, filename), content);
    } catch (error) {
      console.warn(`⚠️  Could not create ${filename}: ${error.message}`);
    }
  }
  
  // Create subdirectory
  const nestedDir = join(testDataDir, 'subdirectory', 'nested');
  mkdirSync(nestedDir, { recursive: true });
  writeFileSync(join(nestedDir, 'nested-doc.md'), '# Nested Document');
  
  console.log('✅ Test data created successfully');
}

function testCLI() {
  console.log('🔧 Testing CLI with cross-platform scenarios...');
  
  const testDataDir = join(process.cwd(), 'test-data', 'cross-platform');
  
  if (!existsSync(testDataDir)) {
    console.warn('⚠️  Test data directory not found, skipping CLI tests');
    return;
  }
  
  try {
    // Test index command
    console.log('  Testing index command...');
    execSync('node dist/cli.js index --format json test-data/cross-platform', {
      env: testEnv,
      stdio: 'pipe',
    });
    
    // Test move command (dry run)
    console.log('  Testing move command (dry run)...');
    if (currentPlatform === 'win32') {
      execSync('node dist/cli.js move "test-data/cross-platform/doc1.md" "test-data/cross-platform/moved\\\\doc1.md" --dry-run', {
        env: testEnv,
        stdio: 'pipe',
      });
    } else {
      execSync('node dist/cli.js move "test-data/cross-platform/doc1.md" "test-data/cross-platform/moved/doc1.md" --dry-run', {
        env: testEnv,
        stdio: 'pipe',
      });
    }
    
    console.log('✅ CLI tests completed successfully');
    
  } catch (error) {
    console.warn('⚠️  Some CLI tests failed:', error.message);
  }
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node scripts/test-cross-platform.js [options]

Options:
  --test-data-only    Only create test data, don't run tests
  --cli-only         Only test CLI, don't run unit tests
  --help, -h         Show this help message

Examples:
  node scripts/test-cross-platform.js
  node scripts/test-cross-platform.js --test-data-only
  node scripts/test-cross-platform.js --cli-only
`);
    return;
  }
  
  if (args.includes('--test-data-only')) {
    createTestData();
    return;
  }
  
  if (args.includes('--cli-only')) {
    testCLI();
    return;
  }
  
  // Run full test suite
  createTestData();
  runTests();
  testCLI();
  
  console.log('🎉 All cross-platform tests completed!');
}

main();