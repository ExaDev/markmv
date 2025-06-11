#!/usr/bin/env node
/**
 * Script to generate API documentation section for README.md
 * from TypeDoc markdown output
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MARKDOWN_DOCS_PATH = 'docs-markdown/README.md';
const README_PATH = 'README.md';
const API_SECTION_START = '<!-- API_DOCS_START -->';
const API_SECTION_END = '<!-- API_DOCS_END -->';

function generateApiSection() {
  try {
    // Check if markdown docs exist
    if (!existsSync(MARKDOWN_DOCS_PATH)) {
      console.error('❌ Markdown docs not found. Run `npm run docs:markdown` first.');
      process.exit(1);
    }

    // Read the generated markdown documentation
    const apiDocs = readFileSync(MARKDOWN_DOCS_PATH, 'utf8');
    
    // Read the current README
    if (!existsSync(README_PATH)) {
      console.error('❌ README.md not found');
      process.exit(1);
    }
    
    const currentReadme = readFileSync(README_PATH, 'utf8');
    
    // Check if API section markers exist
    const hasApiSection = currentReadme.includes(API_SECTION_START) && currentReadme.includes(API_SECTION_END);
    
    if (!hasApiSection) {
      console.log('📝 No API section markers found in README.md');
      console.log('To enable automatic API documentation injection, add these markers to your README.md:');
      console.log('');
      console.log(API_SECTION_START);
      console.log('<!-- Auto-generated API documentation will be inserted here -->');
      console.log(API_SECTION_END);
      console.log('');
      console.log('💡 For now, I\'ll create a separate api-docs.md file with the generated documentation.');
      
      // Create separate API docs file
      const cleanedApiDocs = cleanupApiDocs(apiDocs);
      writeFileSync('api-docs.md', cleanedApiDocs);
      console.log('✅ Generated api-docs.md with API documentation');
      return;
    }
    
    // Replace the API section
    const cleanedApiDocs = cleanupApiDocs(apiDocs);
    const apiSection = `${API_SECTION_START}\n\n${cleanedApiDocs}\n\n${API_SECTION_END}`;
    
    const updatedReadme = currentReadme.replace(
      new RegExp(`${API_SECTION_START}[\\s\\S]*?${API_SECTION_END}`, 'g'),
      apiSection
    );
    
    // Write the updated README
    writeFileSync(README_PATH, updatedReadme);
    console.log('✅ Updated README.md with generated API documentation');
    
  } catch (error) {
    console.error('❌ Error generating API section:', error.message);
    process.exit(1);
  }
}

function cleanupApiDocs(apiDocs) {
  // Remove the title since it will be part of a larger document
  let cleaned = apiDocs.replace(/^# markmv API Documentation v[\d.]+\n\n/, '');
  
  // Adjust heading levels (move everything down one level)
  cleaned = cleaned.replace(/^## /gm, '### ');
  cleaned = cleaned.replace(/^### /gm, '#### ');
  cleaned = cleaned.replace(/^#### /gm, '##### ');
  cleaned = cleaned.replace(/^##### /gm, '###### ');
  
  // Add main API section header
  cleaned = `## 📚 API Documentation\n\n${cleaned}`;
  
  return cleaned;
}

// Run the script
generateApiSection();