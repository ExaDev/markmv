# markmv ✏️

[![CI](https://github.com/ExaDev/markmv/actions/workflows/ci.yml/badge.svg)](https://github.com/ExaDev/markmv/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/markmv.svg)](https://badge.fury.io/js/markmv)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)

> A powerful TypeScript CLI tool for intelligent markdown file operations with automatic link refactoring

**markmv** revolutionises how you manage markdown documentation by providing intelligent file operations that automatically maintain link integrity across your entire project. Whether you're reorganising documentation, splitting large files, or combining related content, markmv ensures your links never break.

## ✨ Features

### 🚀 **Intelligent File Movement**
- Move markdown files and directories with automatic link updates
- Supports relative and absolute path references
- Handles Claude import syntax (`@./file.md`)
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

### 🛡️ **Robust Operations**
- Transactional operations with automatic rollback
- Comprehensive error handling and validation
- Dry-run mode for safe testing
- Detailed operation reporting

## 📦 Installation

### Global Installation (Recommended)
```bash
npm install -g markmv
```

### Local Installation
```bash
npm install markmv
npx markmv --help
```

### Requirements
- Node.js >= 18.0.0
- npm >= 8.0.0

## 🚀 Quick Start

```bash
# Move a file and update all references
markmv move old-doc.md new-location/renamed-doc.md

# Split a large file by headers
markmv split large-guide.md --strategy headers --level 2

# Join multiple files
markmv join intro.md setup.md usage.md --output complete-guide.md

# Interactive merge with conflict resolution  
markmv merge draft.md master.md --interactive
```

## 📖 Usage Guide

### Moving Files

Move individual files or entire directories while preserving link integrity:

```bash
# Move a single file
markmv move source.md destination.md

# Move with custom output directory
markmv move source.md --output docs/

# Move entire directory
markmv move old-docs/ new-docs/

# Dry run to preview changes
markmv move source.md destination.md --dry-run
```

**Options:**
- `--output, -o`: Specify output directory
- `--dry-run`: Preview changes without executing
- `--verbose, -v`: Detailed operation logging
- `--force`: Overwrite existing files

### Splitting Files

Break large markdown files into manageable sections:

```bash
# Split by header level
markmv split large-file.md --strategy headers --level 2

# Split by file size
markmv split large-file.md --strategy size --max-size 50KB

# Split by manual markers
markmv split manual-file.md --strategy manual
```

**Splitting Strategies:**
- **Headers**: Split at specified header levels (h1-h6)
- **Size**: Split when sections exceed size limits
- **Manual**: Split at custom markers (`<!-- split -->` or `---split---`)

**Options:**
- `--strategy`: Splitting strategy (headers, size, manual)
- `--level`: Header level for header strategy (1-6)
- `--max-size`: Maximum section size for size strategy
- `--output, -o`: Output directory for split files
- `--preserve-structure`: Keep original file with frontmatter

### Joining Files

Combine multiple markdown files intelligently:

```bash
# Basic join
markmv join file1.md file2.md file3.md --output combined.md

# Join with header adjustment
markmv join *.md --output master.md --adjust-headers

# Join with conflict resolution
markmv join docs/*.md --output guide.md --resolve-conflicts
```

**Options:**
- `--output, -o`: Output file path (required)
- `--adjust-headers`: Automatically adjust header levels
- `--resolve-conflicts`: Enable conflict resolution
- `--separator`: Custom section separator
- `--table-of-contents`: Generate table of contents

### Merging Files

Intelligently merge content from multiple sources:

```bash
# Basic merge
markmv merge source.md target.md

# Merge with specific strategy
markmv merge source.md target.md --strategy append

# Interactive merge
markmv merge source.md target.md --interactive

# Merge with Obsidian transclusion
markmv merge source.md target.md --transclusion
```

**Merge Strategies:**
- **append**: Add source content to end of target
- **prepend**: Add source content to beginning of target
- **section**: Merge specific sections only
- **interactive**: Manual conflict resolution

## ⚙️ Configuration

Create a `.markmvrc.json` file in your project root:

```json
{
  "linkStyle": "relative",
  "preserveFormatting": true,
  "autoBackup": true,
  "verboseOutput": false,
  "splitOptions": {
    "defaultStrategy": "headers",
    "headerLevel": 2,
    "maxSize": "100KB"
  },
  "joinOptions": {
    "adjustHeaders": true,
    "generateToc": false,
    "separator": "\\n\\n---\\n\\n"
  }
}
```

## 🧪 Examples

### Reorganising Documentation

```bash
# Move all API docs to new structure
markmv move api-docs/ docs/api/

# Split a large README into sections
markmv split README.md --strategy headers --level 2 --output docs/

# Create a comprehensive guide from sections
markmv join docs/intro.md docs/setup.md docs/usage.md --output GUIDE.md
```

### Blog Post Management

```bash
# Split a long blog post into parts
markmv split long-post.md --strategy size --max-size 5KB

# Merge draft with main content
markmv merge draft-additions.md main-post.md --strategy section

# Combine series into single post
markmv join part-1.md part-2.md part-3.md --output complete-series.md
```

### Knowledge Base Maintenance

```bash
# Reorganise knowledge base structure
markmv move kb/ knowledge-base/
markmv split knowledge-base/large-article.md --strategy headers

# Create topic-specific guides
markmv join kb/auth/*.md --output guides/authentication.md
markmv join kb/deploy/*.md --output guides/deployment.md
```

## 🛠️ Development

### Prerequisites

- Node.js >= 18.0.0
- npm >= 8.0.0
- TypeScript knowledge for contributions

### Setup

```bash
# Clone repository
git clone https://github.com/joe-mearman/markmv.git
cd markmv

# Install dependencies  
npm install

# Build project
npm run build

# Run in development mode
npm run dev
```

### Available Scripts

```bash
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
npm run format       # Format code with Biome
npm run check        # Lint + format
npm run typecheck    # TypeScript type checking

# Release
npm run commit       # Interactive conventional commit
npm run release      # Semantic release
npm run release:dry  # Dry run release
```

### Project Structure

```
src/
├── cli.ts                 # CLI entry point
├── commands/              # Command implementations
│   ├── move.ts           # Move command
│   ├── split.ts          # Split command  
│   ├── join.ts           # Join command
│   └── merge.ts          # Merge command
├── core/                 # Core functionality
│   ├── content-splitter.ts
│   ├── file-joiner.ts
│   ├── link-parser.ts
│   └── link-refactorer.ts
├── utils/                # Utility functions
│   ├── file-utils.ts
│   ├── path-utils.ts
│   └── transaction-manager.ts
└── types/                # TypeScript definitions
    ├── commands.ts
    ├── links.ts
    └── operations.ts
```

### Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

#### Quick Contribution Steps

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/amazing-feature`
3. Make your changes following our coding standards
4. Write tests for new functionality
5. Commit using conventional commits: `npm run commit`
6. Push to your fork and submit a pull request

### Versioning

This project uses [semantic versioning](https://semver.org/) with [conventional commits](https://www.conventionalcommits.org/) for automatic release management. See [VERSIONING.md](VERSIONING.md) for details.

## 📚 Documentation

- [API Documentation](docs/api.md)
- [Configuration Guide](docs/configuration.md)
- [Advanced Usage](docs/advanced.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Migration Guide](docs/migration.md)

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
- Use `--max-size` option for size-based splitting
- Consider processing files in smaller batches
- Enable verbose mode to monitor progress

### Getting Help

- 📖 Check the [documentation](docs/)
- 🐛 [Report bugs](https://github.com/joe-mearman/markmv/issues)
- 💬 [Start a discussion](https://github.com/joe-mearman/markmv/discussions)
- ❓ [Ask questions](https://github.com/joe-mearman/markmv/issues/new?template=question.md)

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

**[🏠 Homepage](https://github.com/ExaDev/markmv)** •
**[📖 Documentation](docs/)** •
**[🐛 Report Bug](https://github.com/ExaDev/markmv/issues)** •
**[✨ Request Feature](https://github.com/ExaDev/markmv/issues)**

Made with ❤️ by [Joe Mearman](https://github.com/joe-mearman)

</div>