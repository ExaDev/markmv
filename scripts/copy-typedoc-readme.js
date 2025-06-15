#!/usr/bin/env node
/**
 * Enhanced script that combines TypeDoc README with key API sections
 * Uses TypeDoc's native organization but extracts key sections for main README
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const TYPEDOC_README = 'docs-markdown/README.md';
const INDEX_MD = 'docs-markdown/index.md';
const COMMANDS_CONVERT_MD = 'docs-markdown/commands.convert.md';
const COMMANDS_MD = 'docs-markdown/commands.md';
const PROJECT_README = 'README.md';

function extractCoreAPI() {
  if (!existsSync(INDEX_MD)) return '';
  
  const content = readFileSync(INDEX_MD, 'utf8');
  const coreAPIMatch = content.match(/## Core API\s*\n(.*?)(?=\n## |$)/s);
  
  if (!coreAPIMatch) return '';
  
  return `## 🔧 Core API

${coreAPIMatch[1].trim()}

`;
}

function extractCommands() {
  const commandFunctions = [];
  
  // Extract convertCommand function specifically
  if (existsSync(COMMANDS_CONVERT_MD)) {
    const content = readFileSync(COMMANDS_CONVERT_MD, 'utf8');
    const convertMatch = content.match(/### convertCommand\(\)\s*\n\n```ts\n(.*?)\n```\s*\n\n(.*?)(?=\n### |\n## |$)/s);
    if (convertMatch) {
      const [, signature, fullDescription] = convertMatch;
      
      // Extract the main description (before Parameters)
      const cleanDescription = fullDescription.split(/(?=#### Parameters|#### Returns)/)[0].trim();
      
      // Extract the example section from the full description
      const exampleMatch = fullDescription.match(/#### Example\s*\n\n```bash\n(.*?)\n\s*```/s);
      let exampleSection = '';
      if (exampleMatch) {
        const [, exampleContent] = exampleMatch;
        exampleSection = `

#### Example

\`\`\`bash
${exampleContent}
\`\`\``;
      }
      
      commandFunctions.push(`### convertCommand()

\`\`\`typescript
${signature}
\`\`\`

${cleanDescription}${exampleSection}
`);
    }
  }
  
  // Extract indexCommand function specifically
  if (existsSync(COMMANDS_MD)) {
    const content = readFileSync(COMMANDS_MD, 'utf8');
    const indexMatch = content.match(/### indexCommand\(\)\s*\n\n```ts\n(.*?)\n```\s*\n\n(.*?)(?=\n### |\n## |$)/s);
    if (indexMatch) {
      const [, signature, fullDescription] = indexMatch;
      
      // Extract the main description (before Parameters)
      const cleanDescription = fullDescription.split(/(?=#### Parameters|#### Returns)/)[0].trim();
      
      // Extract the example section from the full description
      const exampleMatch = fullDescription.match(/#### Example\s*\n\n```bash\n(.*?)\n\s*```/s);
      let exampleSection = '';
      if (exampleMatch) {
        const [, exampleContent] = exampleMatch;
        exampleSection = `

#### Example

\`\`\`bash
${exampleContent}
\`\`\``;
      }
      
      commandFunctions.push(`### indexCommand()

\`\`\`typescript
${signature}
\`\`\`

${cleanDescription}${exampleSection}
`);
    }
  }
  
  if (commandFunctions.length === 0) return '';
  
  return `## 📖 Command Reference

${commandFunctions.join('\n')}
`;
}

function copyTypeDocReadme() {
  try {
    if (!existsSync(TYPEDOC_README)) {
      console.error('❌ TypeDoc README not found. Run npm run docs:markdown first.');
      process.exit(1);
    }

    // Get base README template
    const template = readFileSync(TYPEDOC_README, 'utf8');
    
    // Extract key API sections using TypeDoc's native organization
    const coreAPI = extractCoreAPI();
    const commands = extractCommands();
    
    // Insert API sections before Documentation
    const docSectionIndex = template.indexOf('## 📖 Documentation');
    if (docSectionIndex > -1 && (coreAPI || commands)) {
      const beforeDocs = template.slice(0, docSectionIndex);
      const afterDocs = template.slice(docSectionIndex);
      const enhancedContent = beforeDocs + commands + coreAPI + afterDocs;
      writeFileSync(PROJECT_README, enhancedContent);
    } else {
      // Fallback to just the template
      writeFileSync(PROJECT_README, template);
    }
    
    console.log('✅ README.md updated with TypeDoc native API documentation');
  } catch (error) {
    console.error('❌ Error copying TypeDoc README:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (process.argv[1] && process.argv[1].endsWith('copy-typedoc-readme.js')) {
  copyTypeDocReadme();
}

export { copyTypeDocReadme };