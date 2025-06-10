# markmv

TypeScript CLI for markdown file operations with intelligent link refactoring.

## Features

- **Move**: Relocate markdown files while updating all cross-references
- **Split**: Break large markdown files into smaller ones, maintaining link integrity  
- **Join**: Combine multiple markdown files into one, resolving link conflicts
- **Merge**: Intelligent merging of markdown content with link reconciliation

## Installation

```bash
npm install -g markmv
```

## Usage

### Move files
```bash
markmv move source.md destination.md
markmv move docs/ new-docs/
```

### Split files
```bash
markmv split large-file.md --strategy headers --output split-docs/
```

### Join files
```bash
markmv join file1.md file2.md file3.md --output combined.md
```

### Merge files
```bash
markmv merge source.md target.md --strategy append
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Development with watch
npm run dev

# Run tests
npm test
npm run test:coverage

# Type checking
npm run typecheck

# Linting and formatting
npm run lint
npm run format
npm run check  # lint + format together
```

## License

MIT