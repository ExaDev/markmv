#!/usr/bin/env tsx

import prettier from 'prettier';
import config from '../prettier.config.ts';
import fs from 'fs';
import { glob } from 'glob';

async function checkFormatting() {
  console.log('🔍 Checking formatting with Prettier...');
  
  const files = await glob('src/**/*.{ts,tsx,js,jsx}');
  const unformattedFiles: string[] = [];
  
  console.log(`📁 Checking ${files.length} files...`);
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const formatted = await prettier.format(content, {
        ...config,
        filepath: file,
      });
      
      if (content !== formatted) {
        unformattedFiles.push(file);
        console.log(`❌ Not formatted: ${file}`);
      } else {
        console.log(`✅ Properly formatted: ${file}`);
      }
    } catch (error) {
      console.error(`💥 Error checking ${file}:`, error);
      process.exit(1);
    }
  }
  
  if (unformattedFiles.length > 0) {
    console.log(`\n❌ Found ${unformattedFiles.length} files that need formatting:`);
    unformattedFiles.forEach(file => console.log(`  • ${file}`));
    console.log('\n💡 Run "npm run format" to fix formatting issues');
    process.exit(1);
  } else {
    console.log('\n✨ All files are properly formatted!');
  }
}

checkFormatting().catch((error) => {
  console.error('💥 Format check failed:', error);
  process.exit(1);
});