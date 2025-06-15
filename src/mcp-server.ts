/**
 * MCP Server implementation for markmv
 *
 * Provides Model Context Protocol server that exposes markmv functionality as tools for AI agents.
 * Allows seamless integration with Claude and other MCP clients.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type ListToolsRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { createMarkMv } from './index.js';
import type { OperationResult } from './types/operations.js';

const markmv = createMarkMv();

/** Type guard to check if an object is a valid OperationResult */
function isOperationResult(obj: unknown): obj is OperationResult {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return false;
  }

  const record = obj;
  return (
    'success' in record &&
    typeof record.success === 'boolean' &&
    'modifiedFiles' in record &&
    Array.isArray(record.modifiedFiles) &&
    'createdFiles' in record &&
    Array.isArray(record.createdFiles) &&
    'deletedFiles' in record &&
    Array.isArray(record.deletedFiles) &&
    'errors' in record &&
    Array.isArray(record.errors) &&
    'warnings' in record &&
    Array.isArray(record.warnings) &&
    'changes' in record &&
    Array.isArray(record.changes)
  );
}

/** Create and configure the MCP server for markmv */
export function createMcpServer(): Server {
  const server = new Server(
    {
      name: 'markmv-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async (_request: ListToolsRequest) => {
    return {
      tools: [
        {
          name: 'move_file',
          description: 'Move a markdown file and update all references to it',
          inputSchema: {
            type: 'object',
            properties: {
              source: {
                type: 'string',
                description: 'Source file path',
              },
              destination: {
                type: 'string',
                description: 'Destination file path',
              },
              options: {
                type: 'object',
                description: 'Move operation options',
                properties: {
                  dryRun: {
                    type: 'boolean',
                    description: 'Show what would be changed without making changes',
                  },
                  verbose: {
                    type: 'boolean',
                    description: 'Show detailed output',
                  },
                  force: {
                    type: 'boolean',
                    description: 'Force operation even if conflicts exist',
                  },
                  createDirectories: {
                    type: 'boolean',
                    description: 'Create missing directories',
                  },
                },
              },
            },
            required: ['source', 'destination'],
          },
        },
        {
          name: 'move_files',
          description: 'Move multiple markdown files and update all references',
          inputSchema: {
            type: 'object',
            properties: {
              moves: {
                type: 'array',
                description: 'Array of source/destination pairs',
                items: {
                  type: 'object',
                  properties: {
                    source: { type: 'string' },
                    destination: { type: 'string' },
                  },
                  required: ['source', 'destination'],
                },
              },
              options: {
                type: 'object',
                description: 'Move operation options',
                properties: {
                  dryRun: { type: 'boolean' },
                  verbose: { type: 'boolean' },
                  force: { type: 'boolean' },
                  createDirectories: { type: 'boolean' },
                },
              },
            },
            required: ['moves'],
          },
        },
        {
          name: 'validate_operation',
          description: 'Validate the result of a previous operation for broken links',
          inputSchema: {
            type: 'object',
            properties: {
              result: {
                type: 'object',
                description: 'Operation result to validate',
                properties: {
                  success: { type: 'boolean' },
                  modifiedFiles: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  createdFiles: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  deletedFiles: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  errors: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  warnings: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  changes: {
                    type: 'array',
                    items: { type: 'object' },
                  },
                },
                required: [
                  'success',
                  'modifiedFiles',
                  'createdFiles',
                  'deletedFiles',
                  'errors',
                  'warnings',
                  'changes',
                ],
              },
            },
            required: ['result'],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'move_file': {
          if (!args || typeof args !== 'object' || Array.isArray(args)) {
            throw new Error('Invalid arguments for move_file');
          }
          const source = 'source' in args ? args.source : undefined;
          const destination = 'destination' in args ? args.destination : undefined;
          const options = 'options' in args && args.options ? args.options : {};

          if (typeof source !== 'string' || typeof destination !== 'string') {
            throw new Error('Source and destination must be strings');
          }

          const validOptions =
            typeof options === 'object' && !Array.isArray(options) ? options : {};
          const result = await markmv.moveFile(source, destination, validOptions);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'move_files': {
          if (!args || typeof args !== 'object' || Array.isArray(args)) {
            throw new Error('Invalid arguments for move_files');
          }
          const moves = 'moves' in args ? args.moves : undefined;
          const options = 'options' in args && args.options ? args.options : {};

          if (!Array.isArray(moves)) {
            throw new Error('Moves must be an array');
          }

          const validOptions =
            typeof options === 'object' && !Array.isArray(options) ? options : {};
          const result = await markmv.moveFiles(moves, validOptions);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'validate_operation': {
          if (!args || typeof args !== 'object' || Array.isArray(args)) {
            throw new Error('Invalid arguments for validate_operation');
          }
          const result = 'result' in args ? args.result : undefined;

          if (!isOperationResult(result)) {
            throw new Error('Invalid operation result format');
          }

          const validation = await markmv.validateOperation(result);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(validation, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

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
if (process.argv[1] && process.argv[1].endsWith('mcp-server.js')) {
  startMcpServer().catch((error) => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });
}
