/**
 * MCP Server implementation for markmv
 *
 * Provides Model Context Protocol server that exposes markmv functionality as tools for AI agents.
 * Tools, their input schemas, and validation all come directly from the Zod schemas in
 * schemas/index.ts, so a method's schema is the only place its shape is defined. Allows seamless
 * integration with Claude and other MCP clients.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMarkMv, testAutoExposure } from './index.js';
import {
  getDescription,
  methodSchemas,
  toMoveOptions,
  toOperationResult,
} from './schemas/index.js';

const markmv = createMarkMv();

/** Convert camelCase to snake_case for MCP tool naming */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** Wrap a method's result in the single text content block every markmv tool returns */
function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

/** Create and configure the MCP server for markmv */
export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'markmv-mcp', version: '1.0.0' });

  server.registerTool(
    camelToSnake('moveFile'),
    {
      description: getDescription(methodSchemas.moveFile.input),
      inputSchema: methodSchemas.moveFile.input,
    },
    async ({ sourcePath, destinationPath, options }) => {
      const result = await markmv.moveFile(
        sourcePath,
        destinationPath,
        toMoveOptions(options ?? {})
      );
      return textResult(result);
    }
  );

  server.registerTool(
    camelToSnake('moveFiles'),
    {
      description: getDescription(methodSchemas.moveFiles.input),
      inputSchema: methodSchemas.moveFiles.input,
    },
    async ({ moves, options }) => {
      const result = await markmv.moveFiles(moves, toMoveOptions(options ?? {}));
      return textResult(result);
    }
  );

  server.registerTool(
    camelToSnake('validateOperation'),
    {
      description: getDescription(methodSchemas.validateOperation.input),
      inputSchema: methodSchemas.validateOperation.input,
    },
    async ({ result: operationResult }) => {
      const result = await markmv.validateOperation(toOperationResult(operationResult));
      return textResult(result);
    }
  );

  server.registerTool(
    camelToSnake('testAutoExposure'),
    {
      description: getDescription(methodSchemas.testAutoExposure.input),
      inputSchema: methodSchemas.testAutoExposure.input,
    },
    async ({ input }) => {
      const result = await testAutoExposure(input);
      return textResult(result);
    }
  );

  return server;
}

/** Start the MCP server */
export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();

  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('markmv MCP server started');
}

// For direct execution
if (process.argv[1]?.endsWith('mcp-server.js')) {
  startMcpServer().catch((error: unknown) => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });
}
