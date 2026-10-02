# markmv ✏️

```bash
npx markmv --help
```

[![GitHub](https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=white)](https://github.com/ExaDev/markmv) [![npm](https://img.shields.io/badge/npm-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/markmv) [![Release](https://img.shields.io/github/v/release/ExaDev/markmv)](https://github.com/ExaDev/markmv/releases/latest) [![CI](https://img.shields.io/github/actions/workflow/status/ExaDev/markmv/ci.yml?branch=main)](https://github.com/ExaDev/markmv/actions)

> TypeScript CLI for markdown file operations with intelligent link refactoring

[![npm downloads chart, log scale](https://shieldcn.dev/chart/npm/markmv.svg?bg=transparent&logo=false&yScale=log)](https://www.npmjs.com/package/markmv)
[![GitHub stars chart, log scale](https://shieldcn.dev/chart/stars/ExaDev/markmv.svg?bg=transparent&logo=false&yScale=log)](https://github.com/ExaDev/markmv/stargazers)

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
import { moveFile } from "markmv";
const result = await moveFile("old.md", "new.md");
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
      "args": ["--package=markmv", "markmv-mcp"],
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

_Note: Additional tools (split, join, merge, convert, index) will be added in future releases._

### Example Usage with Claude

After setup, you can ask Claude to:

> "Use markmv to move `docs/old-guide.md` to `guides/new-guide.md` and update all references"

> "Move multiple files from the `drafts/` folder to `published/` and update all links"

> "Validate my recent file moves to check for any broken links"

### Verification

Restart Claude Desktop and look for the 🔧 MCP icon in the chat. If configured correctly, you'll see "markmv" listed in the connected MCP servers.

## 📖 Documentation

The [API reference](https://exadev.github.io/markmv/) is generated from the TypeScript sources on every release: [commands](https://exadev.github.io/markmv/modules.html#Commands), [core classes](https://exadev.github.io/markmv/modules.html#Core), the join, merge and split [strategies](https://exadev.github.io/markmv/modules.html#Strategies), and the exported types. See the [changelog](https://github.com/ExaDev/markmv/blob/main/CHANGELOG.md) for what changed in each release.

## 🛠️ Development

```bash
git clone https://github.com/ExaDev/markmv.git
cd markmv
pnpm install
pnpm run build
pnpm test
```

**[Contributing Guide](https://github.com/ExaDev/markmv/blob/main/CONTRIBUTING.md)**

## 📄 License

[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**[📖 Documentation](https://exadev.github.io/markmv/)** • **[🐛 Issues](https://github.com/ExaDev/markmv/issues)** • **[💬 Discussions](https://github.com/ExaDev/markmv/discussions)**

</div>
