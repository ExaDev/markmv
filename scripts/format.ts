#!/usr/bin/env tsx

import prettier from 'prettier';
import config from '../prettier.config.ts';
import fs from 'fs';
import { glob } from 'glob';

async function formatFiles() {
  console.log('🎨 Formatting files with Prettier...');
  
  const files = await glob('src/**/*.{ts,tsx,js,jsx}');
  
  console.log(`📁 Found ${files.length} files to format`);
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const formatted = await prettier.format(content, {
        ...config,
        filepath: file,
      });
      
      if (content !== formatted) {
        fs.writeFileSync(file, formatted);
        console.log(`✅ Formatted: ${file}`);
      }
    } catch (error) {
      console.error(`❌ Error formatting ${file}:`, error);
      process.exit(1);
    }
  }
  
  console.log('✨ Formatting complete!');
}

formatFiles().catch((error) => {
  console.error('💥 Formatting failed:', error);
  process.exit(1);
});