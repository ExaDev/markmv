#!/usr/bin/env node
/**
 * Script to generate a complete README.md from TypeDoc markdown output
 * and predefined templates, matching the structure of the current README
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MARKDOWN_DOCS_PATH = 'docs-markdown/README.md';
const PACKAGE_JSON_PATH = 'package.json';
const TEMPLATE_README_PATH = 'templates/README-template.md';
const OUTPUT_README_PATH = 'README.md';

function getExistingCoverageBadges() {
  try {
    if (!existsSync(OUTPUT_README_PATH)) {
      return '';
    }
    
    const existingReadme = readFileSync(OUTPUT_README_PATH, 'utf8');
    const lines = existingReadme.split('\n');
    
    // Find coverage badge lines
    const coverageBadges = lines.filter(line => 
      line.includes('Test Coverage') || line.includes('Documentation Coverage')
    );
    
    return coverageBadges.join('\n');
  } catch (error) {
    console.warn('⚠️ Could not read existing README for badge preservation:', error.message);
    return '';
  }
}

function generateCompleteReadme() {
  try {
    // Read package.json for metadata
    const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    
    // Check if markdown docs exist
    if (!existsSync(MARKDOWN_DOCS_PATH)) {
      console.error('❌ Markdown docs not found. Run `npm run docs:markdown` first.');
      process.exit(1);
    }

    // Read the generated markdown documentation
    const apiDocs = readFileSync(MARKDOWN_DOCS_PATH, 'utf8');
    
    // Generate the complete README
    const readmeContent = generateReadmeTemplate(packageJson, apiDocs);
    
    // Write the generated README
    writeFileSync(OUTPUT_README_PATH, readmeContent);
    console.log(`✅ Generated complete README at ${OUTPUT_README_PATH}`);
    
  } catch (error) {
    console.error('❌ Error generating complete README:', error.message);
    process.exit(1);
  }
}

function generateReadmeTemplate(packageJson, apiDocs) {
  const { name, version, description, author, homepage, repository } = packageJson;
  
  // Extract overview from API docs (from the main module comment)
  const cleanedApiDocs = cleanupApiDocs(apiDocs, name);
  
  // Read existing README to preserve coverage badges
  const existingCoverageBadges = getExistingCoverageBadges();
  
  return `# ${name} ✏️

\`\`\`bash
npx ${name} --help
\`\`\`

[![CI](${repository.url.replace('.git', '')}/actions/workflows/ci.yml/badge.svg)](${repository.url.replace('.git', '')}/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/${name}.svg)](https://badge.fury.io/js/${name})
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)${existingCoverageBadges ? '\n' + existingCoverageBadges : ''}

> ${description}

**${name}** revolutionises how you manage markdown documentation by providing intelligent file operations that automatically maintain link integrity across your entire project. Whether you're reorganising documentation, splitting large files, or combining related content, ${name} ensures your links never break.

## ✨ Features

### 🚀 **Intelligent File Movement**
- Move markdown files and directories with automatic link updates
- Supports relative and absolute path references
- Handles Claude import syntax (\`@./file.md\`)
- Updates image links and reference-style links

### ✂️ **Smart Content Splitting**
- Split large markdown files by headers, size, or manual markers
- Maintains link integrity across split sections
- Redistributes internal links to correct sections
- Preserves frontmatter and metadata

### 🔗 **Advanced File Joining**
- Combine multiple markdown files intelligently
- Automatic link deduplication and conflict resolution
- Header level adjustment to prevent conflicts
- Content merging with customizable strategies

### 🧠 **Intelligent Merging**
- Merge markdown files with conflict detection
- Support for Obsidian transclusion syntax
- Interactive conflict resolution
- Maintains formatting and structure

### 📚 **Documentation Index Generation**
- Automatically create organized documentation indexes
- Multiple types: links, imports, embeds, hybrid
- Frontmatter-aware organization and sorting
- Support for Obsidian and Claude syntax

### 🛡️ **Robust Operations**
- Transactional operations with automatic rollback
- Comprehensive error handling and validation
- Dry-run mode for safe testing
- Detailed operation reporting

### 🌐 **Multiple Access Methods**
- **CLI Tool**: Direct command-line interface with JSON output
- **REST API**: Lightweight HTTP server using native Node.js
- **MCP Server**: Model Context Protocol for AI agent integration
- **Programmatic API**: TypeScript library for Node.js applications

## 📦 Installation

### Direct Usage with npx (Recommended)
\`\`\`bash
# CLI Tool
npx ${name} --help
npx ${name} move old-doc.md new-doc.md

# REST API Server
npx ${name}-api

# MCP Server
npx ${name}-mcp
\`\`\`

### Global Installation
\`\`\`bash
npm install -g ${name}

# All tools available globally
${name} --help           # CLI tool
${name}-api             # REST API server
${name}-mcp             # MCP server
\`\`\`

### Library Installation
\`\`\`bash
npm install ${name}
\`\`\`

### Requirements
- Node.js >= 18.0.0
- npm >= 8.0.0

## 🚀 Quick Start

\`\`\`bash
# Move a file and update all references
npx ${name} move old-doc.md new-location/renamed-doc.md

# Split a large file by headers
npx ${name} split large-guide.md --strategy headers --header-level 2

# Join multiple files
npx ${name} join intro.md setup.md usage.md --output complete-guide.md

# Interactive merge with conflict resolution
npx ${name} merge draft.md master.md --interactive

# Generate documentation index
npx ${name} index --type links --strategy directory
\`\`\`

## 📖 Usage Guide

### Moving Files

Move individual files or entire directories while preserving link integrity:

\`\`\`bash
# Move a single file
npx ${name} move source.md destination.md

# Preview move operation
npx ${name} move source.md destination.md --dry-run

# Move entire directory
npx ${name} move old-docs/ new-docs/

# Verbose output for detailed logging
npx ${name} move source.md destination.md --verbose
\`\`\`

**Options:**
- \`--dry-run, -d\`: Preview changes without executing
- \`--verbose, -v\`: Detailed operation logging

### Splitting Files

Break large markdown files into manageable sections:

\`\`\`bash
# Split by header level
npx ${name} split large-file.md --strategy headers --header-level 2

# Split by file size
npx ${name} split large-file.md --strategy size --max-size 50KB

# Split by manual markers
npx ${name} split manual-file.md --strategy manual

# Split by number of lines
npx ${name} split large-file.md --strategy lines --split-lines 100
\`\`\`

**Splitting Strategies:**
- **Headers**: Split at specified header levels (h1-h6)
- **Size**: Split when sections exceed size limits
- **Manual**: Split at custom markers (\`<!-- split -->\` or \`---split---\`)
- **Lines**: Split after specified number of lines

**Options:**
- \`--strategy\`: Splitting strategy (headers, size, manual, lines)
- \`--header-level, -l\`: Header level for header strategy (1-6)
- \`--max-size, -m\`: Maximum section size for size strategy
- \`--split-lines\`: Number of lines per section for lines strategy
- \`--output, -o\`: Output directory for split files
- \`--dry-run, -d\`: Preview changes without executing
- \`--verbose, -v\`: Detailed operation logging

### Joining Files

Combine multiple markdown files intelligently:

\`\`\`bash
# Basic join
npx ${name} join file1.md file2.md file3.md --output combined.md

# Join with custom ordering strategy
npx ${name} join *.md --output master.md --order-strategy alphabetical

# Preview join operation
npx ${name} join docs/*.md --output guide.md --dry-run
\`\`\`

**Options:**
- \`--output, -o\`: Output file path (required)
- \`--order-strategy\`: Strategy for ordering joined content
- \`--dry-run, -d\`: Preview changes without executing
- \`--verbose, -v\`: Detailed operation logging

### Merging Files

Intelligently merge content from multiple sources:

\`\`\`bash
# Basic merge
npx ${name} merge source.md target.md

# Merge with specific strategy
npx ${name} merge source.md target.md --strategy append

# Interactive merge
npx ${name} merge source.md target.md --interactive

# Merge with Obsidian transclusion
npx ${name} merge source.md target.md --create-transclusions
\`\`\`

**Merge Strategies:**
- **append**: Add source content to end of target
- **prepend**: Add source content to beginning of target
- **interactive**: Manual conflict resolution

### Generating Documentation Indexes

Automatically create organized indexes for markdown documentation:

\`\`\`bash
# Generate basic link index
npx ${name} index

# Generate in all directories with imports
npx ${name} index --location all --type import

# Generate with Obsidian embeds
npx ${name} index --type embed --embed-style obsidian

# Organize by frontmatter metadata
npx ${name} index --strategy metadata --type hybrid

# Preview without creating files
npx ${name} index --dry-run --verbose
\`\`\`

**Index Types:**
- **links**: Standard markdown links with descriptions
- **import**: Claude-style imports (\`@./file.md\`)
- **embed**: Content embedding (\`![[file.md]]\` or \`![title](file.md)\`)
- **hybrid**: Links with descriptions and summaries

**Organization Strategies:**
- **directory**: Group by folder structure
- **metadata**: Group by frontmatter categories
- **manual**: Custom organization (future feature)

**Placement Options:**
- **root**: Single index in target directory
- **all**: Index in every directory
- **branch**: Index in directories with subdirectories
- **existing**: Only update existing index files

## 🌐 Access Methods

${name} provides multiple ways to access its functionality:

### 1. CLI Tool (Command Line Interface)

The primary command-line interface with JSON output support:

\`\`\`bash
# Basic usage
npx ${name} move old.md new.md

# With JSON output for scripting
npx ${name} move old.md new.md --json

# Dry run with detailed output
npx ${name} split large.md --strategy headers --dry-run --verbose --json
\`\`\`

### 2. REST API Server

Lightweight HTTP API using native Node.js (zero external dependencies):

\`\`\`bash
# Start API server (default port 3000)
npx ${name}-api

# Custom port
PORT=8080 npx ${name}-api
\`\`\`

**Available Endpoints:**
- \`GET /health\` - Health check
- \`POST /api/move\` - Move single file
- \`POST /api/move-batch\` - Move multiple files
- \`POST /api/validate\` - Validate operation results

**Example API Usage:**
\`\`\`bash
# Move a file
curl -X POST http://localhost:3000/api/move \\
  -H "Content-Type: application/json" \\
  -d '{"source": "old.md", "destination": "new.md", "options": {"dryRun": true}}'

# Health check
curl http://localhost:3000/health
\`\`\`

### 3. MCP Server (Model Context Protocol)

For AI agent integration with Claude and other MCP-compatible systems:

\`\`\`bash
# Start MCP server
npx ${name}-mcp
\`\`\`

**MCP Configuration for Claude Desktop:**
\`\`\`json
{
  "mcpServers": {
    "${name}": {
      "command": "npx",
      "args": ["${name}-mcp"]
    }
  }
}
\`\`\`

**Available MCP Tools:**
- \`move_file\` - Move markdown file with link updates
- \`move_files\` - Move multiple files with link updates
- \`validate_operation\` - Validate operation results

### 4. Programmatic API

TypeScript/JavaScript library for Node.js applications:

\`\`\`typescript
import { FileOperations, moveFile, createMarkMv } from '${name}';

// Simple usage
const result = await moveFile('old.md', 'new.md');

// Advanced usage
const fileOps = new FileOperations();
const result = await fileOps.moveFile('docs/api.md', 'reference/', {
  dryRun: true,
  verbose: true
});

// Factory pattern
const markmv = createMarkMv();
const result = await markmv.moveFiles([
  { source: 'docs/*.md', destination: 'archive/' }
]);
\`\`\`

## ⚙️ Configuration

Configuration options can be passed via command line flags. See each command's \`--help\` for available options.

## 📚 Library Usage

${cleanedApiDocs}

## 🧪 Examples

### Reorganising Documentation

\`\`\`bash
# Move all API docs to new structure
npx ${name} move api-docs/ docs/api/

# Split a large README into sections
npx ${name} split README.md --strategy headers --header-level 2 --output docs/

# Create a comprehensive guide from sections
npx ${name} join docs/intro.md docs/setup.md docs/usage.md --output GUIDE.md
\`\`\`

### Blog Post Management

\`\`\`bash
# Split a long blog post into parts
npx ${name} split long-post.md --strategy size --max-size 5KB

# Merge draft with main content
npx ${name} merge draft-additions.md main-post.md --strategy append

# Combine series into single post
npx ${name} join part-1.md part-2.md part-3.md --output complete-series.md
\`\`\`

### Knowledge Base Maintenance

\`\`\`bash
# Reorganise knowledge base structure
npx ${name} move kb/ knowledge-base/
npx ${name} split knowledge-base/large-article.md --strategy headers

# Create topic-specific guides
npx ${name} join kb/auth/*.md --output guides/authentication.md
npx ${name} join kb/deploy/*.md --output guides/deployment.md

# Generate comprehensive indexes
npx ${name} index knowledge-base/ --location all --type hybrid
npx ${name} index guides/ --type import --strategy metadata
\`\`\`

## 🛠️ Development

### Prerequisites

- Node.js >= 18.0.0
- npm >= 8.0.0
- TypeScript knowledge for contributions

### Setup

\`\`\`bash
# Clone repository
git clone ${repository.url}
cd ${name}

# Install dependencies
npm install

# Build project
npm run build

# Run in development mode
npm run dev
\`\`\`

### Available Scripts

\`\`\`bash
# Development
npm run dev          # Build with watch mode
npm run build        # Production build
npm run start        # Run built CLI

# Testing
npm test             # Run tests in watch mode
npm run test:run     # Run tests once
npm run test:coverage # Run tests with coverage

# Code Quality
npm run lint         # ESLint checking
npm run format       # Format code with Prettier
npm run check        # Lint + format + typecheck
npm run typecheck    # TypeScript type checking

# Release
npm run commit       # Interactive conventional commit
npm run release      # Semantic release
npm run release:dry  # Dry run release
\`\`\`

### Project Structure

\`\`\`
src/
├── cli.ts                 # CLI entry point
├── commands/              # Command implementations
│   ├── move.ts           # Move command
│   ├── split.ts          # Split command
│   ├── join.ts           # Join command
│   └── merge.ts          # Merge command
├── core/                 # Core functionality
│   ├── content-splitter.ts
│   ├── content-joiner.ts
│   ├── link-parser.ts
│   └── link-refactorer.ts
├── utils/                # Utility functions
│   ├── file-utils.ts
│   ├── path-utils.ts
│   └── transaction-manager.ts
└── types/                # TypeScript definitions
    ├── config.ts
    ├── links.ts
    └── operations.ts
\`\`\`

### Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

#### Quick Contribution Steps

1. Fork the repository
2. Create a feature branch: \`git checkout -b feat/amazing-feature\`
3. Make your changes following our coding standards
4. Write tests for new functionality
5. Commit using conventional commits: \`npm run commit\`
6. Push to your fork and submit a pull request

### Versioning

This project uses [semantic versioning](https://semver.org/) with [conventional commits](https://www.conventionalcommits.org/) for automatic release management. See [VERSIONING.md](VERSIONING.md) for details.

## 📚 Documentation

For detailed documentation and examples, see the sections below or visit the [GitHub repository](${repository.url.replace('.git', '')}).

## 🐛 Troubleshooting

### Common Issues

**Links not updating correctly:**
- Ensure files use consistent path formats (relative vs absolute)
- Check for syntax errors in markdown links
- Verify file extensions match exactly

**Split operation fails:**
- Confirm header syntax is valid markdown
- Check file permissions for output directory
- Ensure sufficient disk space

**Performance with large files:**
- Use \`--max-size\` option for size-based splitting
- Consider processing files in smaller batches
- Enable verbose mode to monitor progress

### Getting Help

- 📖 [API Documentation](https://exadev.github.io/${name}/) - Comprehensive TypeDoc documentation
- 🐛 [Report bugs](${repository.url.replace('.git', '')}/issues)
- 💬 [Start a discussion](${repository.url.replace('.git', '')}/discussions)
- ❓ [Ask questions](${repository.url.replace('.git', '')}/issues/new?template=question.md)

## 🙏 Acknowledgments

- Inspired by the need for better markdown tooling
- Built with [Commander.js](https://github.com/tj/commander.js/)
- Markdown parsing powered by [remark](https://github.com/remarkjs/remark)
- TypeScript for robust type safety

## 📄 License

[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) - see the [LICENSE](LICENSE) file for details.

This work is licensed under a Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License.

---

<div align="center">

**[🏠 Homepage](${homepage})** •
**[📖 Documentation](${repository.url.replace('.git', '')}#readme)** •
**[🐛 Report Bug](${repository.url.replace('.git', '')}/issues)** •
**[✨ Request Feature](${repository.url.replace('.git', '')}/issues)**

Made by [${author}](https://github.com/Mearman)

</div>
`;
}

function cleanupApiDocs(apiDocs, packageName = 'markmv') {
  // Remove everything up to the first ## heading, including title and any intro content
  let cleaned = apiDocs.replace(/^.*?(?=## )/s, '');
  
  // If no ## headings found, take everything after the title line
  if (!cleaned) {
    cleaned = apiDocs.replace(/^# markmv v[\d.]+.*?\n\n/, '');
  }
  
  // Create the programmatic API section
  const apiSection = `### Programmatic API

${packageName} provides a comprehensive TypeScript API for integration into your projects:

\`\`\`typescript
import { FileOperations, moveFile, createMarkMv } from '${packageName}';

// Simple file move
const result = await moveFile('old.md', 'new.md');

// Advanced usage with options
const fileOps = new FileOperations();
const result = await fileOps.moveFile('docs/api.md', 'reference/', {
  dryRun: true,
  verbose: true
});

// Glob pattern support
const result = await fileOps.moveFiles([
  { source: 'docs/*.md', destination: 'archive/' }
]);

// Check for broken links
const validation = await fileOps.validateOperation(result);
\`\`\`

See the [API Documentation](https://exadev.github.io/markmv/) for complete details.

#### API Reference

${cleaned}`;
  
  // Adjust heading levels (move everything down one level)
  const finalContent = apiSection.replace(/^## /gm, '##### ').replace(/^### /gm, '###### ');
  
  return finalContent;
}

// Run the script
generateCompleteReadme();