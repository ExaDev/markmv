/**
 * Example usage of markmv MCP Server
 *
 * Demonstrates how to use the markmv MCP server with client code. The MCP server exposes markmv
 * functionality as tools for AI agents.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'node:child_process';

/** Example MCP client that connects to markmv server */
export async function createMcpClient(): Promise<Client> {
  // Start the markmv MCP server as a child process
  const serverProcess = spawn('node', ['dist/mcp-server.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Create transport and client
  const transport = new StdioClientTransport({
    readable: serverProcess.stdout!,
    writable: serverProcess.stdin!,
  });

  const client = new Client(
    {
      name: 'markmv-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);
  return client;
}

/** Example: Move a file using MCP */
async function moveFileExample() {
  console.log('🔧 Moving file via MCP...');

  const client = await createMcpClient();

  try {
    const result = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'move_file',
          arguments: {
            source: 'docs/old-guide.md',
            destination: 'docs/new-guide.md',
            options: {
              dryRun: true,
              verbose: true,
              createDirectories: true,
            },
          },
        },
      },
      CallToolResultSchema
    );

    console.log('✅ Move operation result:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

/** Example: Convert link formats using MCP */
async function convertLinksExample() {
  console.log('🔄 Converting link formats via MCP...');

  const client = await createMcpClient();

  try {
    const result = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'convert_links',
          arguments: {
            pattern: 'docs/**/*.md',
            options: {
              linkStyle: 'wikilink',
              pathResolution: 'relative',
              recursive: true,
              dryRun: true,
              verbose: true,
            },
          },
        },
      },
      CallToolResultSchema
    );

    console.log('✅ Convert operation result:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

/** Example: Split a large file using MCP */
async function splitFileExample() {
  console.log('✂️ Splitting file via MCP...');

  const client = await createMcpClient();

  try {
    const result = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'split_file',
          arguments: {
            filePath: 'docs/large-document.md',
            options: {
              strategy: 'headers',
              outputDir: 'docs/split-output',
              headerLevel: 2,
              dryRun: true,
              verbose: true,
            },
          },
        },
      },
      CallToolResultSchema
    );

    console.log('✅ Split operation result:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

/** Example: List available tools from MCP server */
async function listToolsExample() {
  console.log('📋 Listing available MCP tools...');

  const client = await createMcpClient();

  try {
    const result = await client.request(
      {
        method: 'tools/list',
        params: {},
      },
      ListToolsResultSchema
    );

    console.log('✅ Available tools:');
    result.tools.forEach((tool) => {
      console.log(`  • ${tool.name}: ${tool.description}`);
    });
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

/** Run all examples */
async function runExamples() {
  console.log('🚀 Starting markmv MCP examples...\n');

  try {
    await listToolsExample();
    console.log('\n' + '='.repeat(50) + '\n');

    await moveFileExample();
    console.log('\n' + '='.repeat(50) + '\n');

    await convertLinksExample();
    console.log('\n' + '='.repeat(50) + '\n');

    await splitFileExample();
    console.log('\n' + '='.repeat(50) + '\n');

    console.log('✅ All examples completed!');
  } catch (error) {
    console.error('❌ Example failed:', error);
  }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples().catch(console.error);
}

// Also support tsx execution
if (process.argv[1] && process.argv[1].endsWith('mcp-usage.ts')) {
  runExamples().catch(console.error);
}
