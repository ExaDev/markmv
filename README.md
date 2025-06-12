# markmv ✏️

```bash
npx markmv --help
```

[![CI](https://github.com/ExaDev/markmv/actions/workflows/ci.yml/badge.svg)](https://github.com/ExaDev/markmv/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/markmv.svg)](https://badge.fury.io/js/markmv)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)
[![Test Coverage](https://img.shields.io/badge/coverage-78.58-yellow.svg)](https://github.com/ExaDev/markmv/commit/1e73647d14948bfd2a60166c34ea9d695d78ca02)
[![Documentation Coverage](https://img.shields.io/badge/docs-98.8-brightgreen.svg)](https://github.com/ExaDev/markmv/commit/1e73647d14948bfd2a60166c34ea9d695d78ca02)

> TypeScript CLI for markdown file operations with intelligent link refactoring

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

## 📦 Installation

### Direct Usage with npx (Recommended)
```bash
npx markmv --help
npx markmv move old-doc.md new-doc.md
```

### Global Installation
```bash
npm install -g markmv
markmv --help
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
npx markmv move old-doc.md new-location/renamed-doc.md

# Split a large file by headers
npx markmv split large-guide.md --strategy headers --header-level 2

# Join multiple files
npx markmv join intro.md setup.md usage.md --output complete-guide.md

# Interactive merge with conflict resolution
npx markmv merge draft.md master.md --interactive

# Generate documentation index
npx markmv index --type links --strategy directory
```

## 📖 Usage Guide

### Moving Files

Move individual files or entire directories while preserving link integrity:

```bash
# Move a single file
npx markmv move source.md destination.md

# Preview move operation
npx markmv move source.md destination.md --dry-run

# Move entire directory
npx markmv move old-docs/ new-docs/

# Verbose output for detailed logging
npx markmv move source.md destination.md --verbose
```

**Options:**
- `--dry-run, -d`: Preview changes without executing
- `--verbose, -v`: Detailed operation logging

### Splitting Files

Break large markdown files into manageable sections:

```bash
# Split by header level
npx markmv split large-file.md --strategy headers --header-level 2

# Split by file size
npx markmv split large-file.md --strategy size --max-size 50KB

# Split by manual markers
npx markmv split manual-file.md --strategy manual

# Split by number of lines
npx markmv split large-file.md --strategy lines --split-lines 100
```

**Splitting Strategies:**
- **Headers**: Split at specified header levels (h1-h6)
- **Size**: Split when sections exceed size limits
- **Manual**: Split at custom markers (`<!-- split -->` or `---split---`)
- **Lines**: Split after specified number of lines

**Options:**
- `--strategy`: Splitting strategy (headers, size, manual, lines)
- `--header-level, -l`: Header level for header strategy (1-6)
- `--max-size, -m`: Maximum section size for size strategy
- `--split-lines`: Number of lines per section for lines strategy
- `--output, -o`: Output directory for split files
- `--dry-run, -d`: Preview changes without executing
- `--verbose, -v`: Detailed operation logging

### Joining Files

Combine multiple markdown files intelligently:

```bash
# Basic join
npx markmv join file1.md file2.md file3.md --output combined.md

# Join with custom ordering strategy
npx markmv join *.md --output master.md --order-strategy alphabetical

# Preview join operation
npx markmv join docs/*.md --output guide.md --dry-run
```

**Options:**
- `--output, -o`: Output file path (required)
- `--order-strategy`: Strategy for ordering joined content
- `--dry-run, -d`: Preview changes without executing
- `--verbose, -v`: Detailed operation logging

### Merging Files

Intelligently merge content from multiple sources:

```bash
# Basic merge
npx markmv merge source.md target.md

# Merge with specific strategy
npx markmv merge source.md target.md --strategy append

# Interactive merge
npx markmv merge source.md target.md --interactive

# Merge with Obsidian transclusion
npx markmv merge source.md target.md --create-transclusions
```

**Merge Strategies:**
- **append**: Add source content to end of target
- **prepend**: Add source content to beginning of target
- **interactive**: Manual conflict resolution

### Generating Documentation Indexes

Automatically create organized indexes for markdown documentation:

```bash
# Generate basic link index
npx markmv index

# Generate in all directories with imports
npx markmv index --location all --type import

# Generate with Obsidian embeds
npx markmv index --type embed --embed-style obsidian

# Organize by frontmatter metadata
npx markmv index --strategy metadata --type hybrid

# Preview without creating files
npx markmv index --dry-run --verbose
```

**Index Types:**
- **links**: Standard markdown links with descriptions
- **import**: Claude-style imports (`@./file.md`)
- **embed**: Content embedding (`![[file.md]]` or `![title](file.md)`)
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

## ⚙️ Configuration

Configuration options can be passed via command line flags. See each command's `--help` for available options.

## 📚 Library Usage

###### Programmatic API

markmv provides a comprehensive TypeScript API for integration into your projects:

```typescript
import { FileOperations, moveFile, createMarkMv } from 'markmv';

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
```

See the [API Documentation](https://exadev.github.io/markmv/) for complete details.

#### API Reference

##### Classes

###### Core

- [ContentJoiner](classes/ContentJoiner.md)
- [ContentSplitter](classes/ContentSplitter.md)
- [DependencyGraph](classes/DependencyGraph.md)
- [FileOperations](classes/FileOperations.md)
- [LinkConverter](classes/LinkConverter.md)
- [LinkParser](classes/LinkParser.md)
- [LinkRefactorer](classes/LinkRefactorer.md)
- [LinkValidator](classes/LinkValidator.md)

###### Strategies

- [BaseJoinStrategy](classes/BaseJoinStrategy.md)
- [DependencyOrderJoinStrategy](classes/DependencyOrderJoinStrategy.md)
- [AlphabeticalJoinStrategy](classes/AlphabeticalJoinStrategy.md)
- [ManualOrderJoinStrategy](classes/ManualOrderJoinStrategy.md)
- [ChronologicalJoinStrategy](classes/ChronologicalJoinStrategy.md)
- [BaseMergeStrategy](classes/BaseMergeStrategy.md)
- [AppendMergeStrategy](classes/AppendMergeStrategy.md)
- [PrependMergeStrategy](classes/PrependMergeStrategy.md)
- [InteractiveMergeStrategy](classes/InteractiveMergeStrategy.md)
- [BaseSplitStrategy](classes/BaseSplitStrategy.md)
- [HeaderBasedSplitStrategy](classes/HeaderBasedSplitStrategy.md)
- [SizeBasedSplitStrategy](classes/SizeBasedSplitStrategy.md)
- [ManualSplitStrategy](classes/ManualSplitStrategy.md)
- [LineBasedSplitStrategy](classes/LineBasedSplitStrategy.md)

###### Utilities

- [FileUtils](classes/FileUtils.md)
- [PathUtils](classes/PathUtils.md)
- [TransactionManager](classes/TransactionManager.md)

##### Interfaces

###### Commands

- [IndexOptions](interfaces/IndexOptions.md)
- [FileMetadata](interfaces/FileMetadata.md)
- [IndexableFile](interfaces/IndexableFile.md)

###### Strategies

- [JoinSection](interfaces/JoinSection.md)
- [JoinResult](interfaces/JoinResult.md)
- [JoinConflict](interfaces/JoinConflict.md)
- [JoinStrategyOptions](interfaces/JoinStrategyOptions.md)
- [MergeSection](interfaces/MergeSection.md)
- [MergeResult](interfaces/MergeResult.md)
- [MergeConflict](interfaces/MergeConflict.md)
- [MergeStrategyOptions](interfaces/MergeStrategyOptions.md)
- [SplitSection](interfaces/SplitSection.md)
- [SplitResult](interfaces/SplitResult.md)
- [SplitStrategyOptions](interfaces/SplitStrategyOptions.md)

###### Types

- [MarkdownLink](interfaces/MarkdownLink.md)
- [ParsedMarkdownFile](interfaces/ParsedMarkdownFile.md)
- [OperationOptions](interfaces/OperationOptions.md)
- [MoveOperationOptions](interfaces/MoveOperationOptions.md)
- [SplitOperationOptions](interfaces/SplitOperationOptions.md)
- [JoinOperationOptions](interfaces/JoinOperationOptions.md)
- [MergeOperationOptions](interfaces/MergeOperationOptions.md)
- [ConvertOperationOptions](interfaces/ConvertOperationOptions.md)
- [OperationResult](interfaces/OperationResult.md)
- [OperationChange](interfaces/OperationChange.md)

##### Type Aliases

###### Types

- [LinkType](type-aliases/LinkType.md)
- [LinkStyle](type-aliases/LinkStyle.md)

##### Functions

###### Commands

- [convertCommand](functions/convertCommand.md)

###### Other

- [indexCommand](functions/indexCommand.md)
- [createMarkMv](functions/createMarkMv.md)
- [moveFile](functions/moveFile.md)
- [moveFiles](functions/moveFiles.md)
- [validateOperation](functions/validateOperation.md)


## 🧪 Examples

### Reorganising Documentation

```bash
# Move all API docs to new structure
npx markmv move api-docs/ docs/api/

# Split a large README into sections
npx markmv split README.md --strategy headers --header-level 2 --output docs/

# Create a comprehensive guide from sections
npx markmv join docs/intro.md docs/setup.md docs/usage.md --output GUIDE.md
```

### Blog Post Management

```bash
# Split a long blog post into parts
npx markmv split long-post.md --strategy size --max-size 5KB

# Merge draft with main content
npx markmv merge draft-additions.md main-post.md --strategy append

# Combine series into single post
npx markmv join part-1.md part-2.md part-3.md --output complete-series.md
```

### Knowledge Base Maintenance

```bash
# Reorganise knowledge base structure
npx markmv move kb/ knowledge-base/
npx markmv split knowledge-base/large-article.md --strategy headers

# Create topic-specific guides
npx markmv join kb/auth/*.md --output guides/authentication.md
npx markmv join kb/deploy/*.md --output guides/deployment.md

# Generate comprehensive indexes
npx markmv index knowledge-base/ --location all --type hybrid
npx markmv index guides/ --type import --strategy metadata
```

## 🛠️ Development

### Prerequisites

- Node.js >= 18.0.0
- npm >= 8.0.0
- TypeScript knowledge for contributions

### Setup

```bash
# Clone repository
git clone https://github.com/ExaDev/markmv.git
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
npm run format       # Format code with Prettier
npm run check        # Lint + format + typecheck
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

For detailed documentation and examples, see the sections below or visit the [GitHub repository](https://github.com/ExaDev/markmv).

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

- 📖 [API Documentation](https://exadev.github.io/markmv/) - Comprehensive TypeDoc documentation
- 🐛 [Report bugs](https://github.com/ExaDev/markmv/issues)
- 💬 [Start a discussion](https://github.com/ExaDev/markmv/discussions)
- ❓ [Ask questions](https://github.com/ExaDev/markmv/issues/new?template=question.md)

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

**[🏠 Homepage](https://github.com/ExaDev/markmv#readme)** •
**[📖 Documentation](https://github.com/ExaDev/markmv#readme)** •
**[🐛 Report Bug](https://github.com/ExaDev/markmv/issues)** •
**[✨ Request Feature](https://github.com/ExaDev/markmv/issues)**

Made by [Joe Mearman](https://github.com/Mearman)

</div>
