---
title: Integrations
---

# Integrations

markmv runs as a command line tool, and the same operations are available as a library, an HTTP server and a Model Context Protocol (MCP) server.

## Library

```typescript
import { moveFile } from "markmv";

const result = await moveFile("old.md", "new.md");
```

The full programmatic surface is in the API reference on this site.

## HTTP server

```bash
npx --package=markmv markmv-api
```

The server listens on port 3000, or on the port in the `PORT` environment variable. `GET /health` reports that it is running. Each operation is a `POST` to `/api/` followed by the operation name in kebab case, for example `/api/move-file`, `/api/move-files` and `/api/validate-operation`. Responses are JSON.

The server does not authenticate requests and allows requests from any origin, so run it only on a machine and network you trust.

## MCP server

```bash
npx --package=markmv markmv-mcp
```

The MCP server lets an AI agent such as Claude call markmv directly. To add it to Claude Desktop, put this in `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%/Claude/`):

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

It exposes `move_file`, `move_files` and `validate_operation`. After restarting Claude Desktop, markmv appears in the list of connected MCP servers.
