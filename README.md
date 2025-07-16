# markmv ✏️

```bash
npx markmv --help
```

[![CI](https://github.com/ExaDev/markmv/actions/workflows/ci.yml/badge.svg)](https://github.com/ExaDev/markmv/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/markmv.svg)](https://badge.fury.io/js/markmv)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)

> TypeScript CLI for markdown file operations with intelligent link refactoring

**markmv** revolutionises how you manage markdown documentation by providing intelligent file operations that automatically maintain link integrity across your entire project. Whether you're reorganising documentation, splitting large files, or combining related content, markmv ensures your links never break.

## ✨ Key Features

- 🚀 **Move files/directories** with automatic link updates
- ✂️ **Split large files** by headers, size, or manual markers  
- 🔗 **Join multiple files** with conflict resolution
- 🧠 **Merge content** with interactive conflict handling
- 📚 **Generate indexes** for documentation organization
- 🌐 **Multiple access methods**: CLI, REST API, MCP, and programmatic

## 📦 Installation

```bash
# Use directly with npx (recommended)
npx markmv --help

# Install globally
npm install -g markmv

# Install as library
npm install markmv
```

**Requirements:** Node.js >= 18.0.0

## 🚀 Quick Start

```bash
# Move a file and update all references
npx markmv move old-doc.md new-location/renamed-doc.md

# Split a large file by headers
npx markmv split large-guide.md --strategy headers --header-level 2

# Join multiple files
npx markmv join intro.md setup.md usage.md --output complete-guide.md

# Generate documentation index
npx markmv index --type links --strategy directory
```

## 🌐 Access Methods

markmv provides multiple interfaces for different use cases:

### CLI Tool
```bash
npx markmv move old.md new.md --json  # JSON output for scripting
```

### REST API Server
```bash
npx --package=markmv markmv-api  # Start HTTP server on port 3000
```

### MCP Server (AI Integration)
```bash
npx --package=markmv markmv-mcp  # Model Context Protocol server
```

### Programmatic API
```typescript
import { moveFile } from 'markmv';
const result = await moveFile('old.md', 'new.md');
```

## 🤖 MCP Setup (AI Integration)

The markmv MCP server enables AI agents (like Claude) to use markmv functionality directly. Here's how to set it up:

### Claude Desktop Configuration

Add markmv to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "markmv": {
      "command": "npx",
      "args": [
        "--package=markmv",
        "markmv-mcp"
      ],
      "env": {
        "NODE_OPTIONS": "--no-warnings"
      }
    }
  }
}
```

### Available MCP Tools

Once configured, Claude can use these markmv tools:

- **`move_file`** - Move/rename files with link updates
- **`move_files`** - Move multiple files in batch  
- **`validate_operation`** - Check for broken links

*Note: Additional tools (split, join, merge, convert, index) will be added in future releases.*

### Example Usage with Claude

After setup, you can ask Claude to:

> "Use markmv to move `docs/old-guide.md` to `guides/new-guide.md` and update all references"

> "Move multiple files from the `drafts/` folder to `published/` and update all links"

> "Validate my recent file moves to check for any broken links"

### Verification

Restart Claude Desktop and look for the 🔧 MCP icon in the chat. If configured correctly, you'll see "markmv" listed in the connected MCP servers.

## 📖 Command Reference

### convertCommand()

```typescript
function convertCommand(patterns: string[], options: ConvertOptions): Promise<void>;
```

Defined in: [commands/convert.ts:244](https://github.com/ExaDev/markmv/blob/main/src/commands/convert.ts#L244)

CLI command handler for convert operations.

Processes markdown files to convert link formats and path resolution according to specified
options. Supports dry run mode, verbose output, and various conversion strategies.

#### Example

```bash
  # Convert all links to relative paths
  markmv convert docs/star.md --path-resolution relative

  # Convert to wikilink style with absolute paths
  markmv convert starstar/star.md --link-style wikilink --path-resolution absolute

  # Dry run with verbose output
  markmv convert README.md --link-style claude --dry-run --verbose
```

### indexCommand()

```typescript
function indexCommand(directory: undefined | string, cliOptions: IndexCliOptions): Promise<void>;
```

Defined in: [commands/index.ts:140](https://github.com/ExaDev/markmv/blob/main/src/commands/index.ts#L140)

CLI command handler for generating documentation indexes.

Creates organized documentation indexes from markdown files using various strategies. Supports
multiple index types including links, imports, embeds, and hybrid modes.

#### Example

```bash
  # Generate a links-based index
  markmv index --type links --strategy directory

  # Generate with custom template
  markmv index docs/ --type hybrid --template custom.md

  # Dry run with verbose output
  markmv index --dry-run --verbose
```

## 🔧 Core API

### createMarkMv()

```ts
function createMarkMv(): FileOperations;
```

Defined in: [index.ts:155](https://github.com/ExaDev/markmv/blob/main/src/index.ts#L155)

Main entry point for the markmv library

Creates a new FileOperations instance for performing markdown file operations. This is the
recommended way to get started with the library.

#### Returns

[`FileOperations`](#fileoperations)

A new FileOperations instance

#### Example

```typescript
  import { createMarkMv } from 'markmv';

  const markmv = createMarkMv();
  const result = await markmv.moveFile('old.md', 'new.md');
  ```;

***

### moveFile()

```ts
function moveFile(
   sourcePath: string, 
   destinationPath: string, 
options: MoveOperationOptions): Promise<OperationResult>;
```

Defined in: [index.ts:179](https://github.com/ExaDev/markmv/blob/main/src/index.ts#L179)

Convenience function for moving a single markdown file

#### Parameters

##### sourcePath

`string`

The current file path

##### destinationPath

`string`

The target file path

##### options

[`MoveOperationOptions`](#moveoperationoptions) = `{}`

Optional configuration

#### Returns

`Promise`\<[`OperationResult`](#operationresult)\>

Promise resolving to operation result

#### Example

```typescript
  import { moveFile } from 'markmv';

  const result = await moveFile('docs/old.md', 'docs/new.md', {
    dryRun: true
  });
  ```;

***

### moveFiles()

```ts
function moveFiles(moves: object[], options: MoveOperationOptions): Promise<OperationResult>;
```

Defined in: [index.ts:208](https://github.com/ExaDev/markmv/blob/main/src/index.ts#L208)

Convenience function for moving multiple markdown files

#### Parameters

##### moves

`object`[]

Array of source/destination pairs

##### options

[`MoveOperationOptions`](#moveoperationoptions) = `{}`

Optional configuration

#### Returns

`Promise`\<[`OperationResult`](#operationresult)\>

Promise resolving to operation result

#### Example

```typescript
  import { moveFiles } from 'markmv';

  const result = await moveFiles([
    { source: 'old1.md', destination: 'new1.md' },
    { source: 'old2.md', destination: 'new2.md' }
  ]);
  ```;

***

### validateOperation()

```ts
function validateOperation(result: OperationResult): Promise<{
  valid: boolean;
  brokenLinks: number;
  errors: string[];
}>;
```

Defined in: [index.ts:237](https://github.com/ExaDev/markmv/blob/main/src/index.ts#L237)

Convenience function for validating markdown file operations

#### Parameters

##### result

[`OperationResult`](#operationresult)

The operation result to validate

#### Returns

`Promise`\<\{
  `valid`: `boolean`;
  `brokenLinks`: `number`;
  `errors`: `string`[];
\}\>

Promise resolving to validation result

#### Example

```typescript
  import { moveFile, validateOperation } from 'markmv';

  const result = await moveFile('old.md', 'new.md');
  const validation = await validateOperation(result);

  if (!validation.valid) {
  console.error(`Found ${validation.brokenLinks} broken links`);
  }
  ```

## 📖 Documentation

- 📚 **[Complete User Guide](https://exadev.github.io/markmv/)** - Detailed usage instructions and examples
- 🔧 **[API Reference](https://exadev.github.io/markmv/)** - TypeScript API documentation  
- 🌐 **[REST API Docs](https://exadev.github.io/markmv/)** - HTTP endpoints and examples
- 🤖 **[MCP Integration](https://exadev.github.io/markmv/)** - AI agent setup and configuration

## 🛠️ Development

```bash
git clone https://github.com/ExaDev/markmv.git
cd markmv
npm install
npm run build
npm test
```

**[Contributing Guide](https://github.com/ExaDev/markmv/blob/main/CONTRIBUTING.md)** | **[Development Setup](https://exadev.github.io/markmv/)**

## 📄 License

[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**[📖 Documentation](https://exadev.github.io/markmv/)** • **[🐛 Issues](https://github.com/ExaDev/markmv/issues)** • **[💬 Discussions](https://github.com/ExaDev/markmv/discussions)**

</div>

## Modules

- [commands/convert](commands.convert.md)
- [commands](commands.md)
- [index](index.md)
