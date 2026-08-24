import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// Mock console.error to avoid output during tests
const mockConsoleError = vi
  .spyOn(console, "error")
  .mockImplementation(() => undefined);

// Mock the markmv index module
vi.mock("./index.js", () => ({
  createMarkMv: vi.fn(() => ({
    moveFile: vi.fn().mockResolvedValue({
      success: true,
      modifiedFiles: [],
      createdFiles: ["test.md"],
      deletedFiles: [],
      errors: [],
      warnings: [],
      changes: [],
    }),
    moveFiles: vi.fn().mockResolvedValue({
      success: true,
      modifiedFiles: [],
      createdFiles: ["test1.md", "test2.md"],
      deletedFiles: [],
      errors: [],
      warnings: [],
      changes: [],
    }),
    validateOperation: vi.fn().mockResolvedValue({
      valid: true,
      brokenLinks: 0,
      errors: [],
    }),
  })),
  testAutoExposure: vi.fn().mockResolvedValue({
    message: "Test response",
    timestamp: "2023-01-01T00:00:00.000Z",
    success: true,
  }),
}));

// startMcpServer connects over stdio; give it one end of a real in-memory transport pair instead (the other end is left unconnected, since nothing in this test sends it anything) so server.connect() satisfies the real Transport contract rather than a hand-rolled stub.
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi
    .fn()
    .mockImplementation(() => InMemoryTransport.createLinkedPair()[0]),
}));

import { createMcpServer, startMcpServer } from "./mcp-server.js";

/**
 * Connect a real MCP Client to a real createMcpServer() over an in-memory transport pair, so every
 * test exercises the actual protocol (tool listing, Zod input validation, error-to-CallToolResult
 * conversion) rather than mocking the SDK away.
 */
async function connectClient() {
  const server = createMcpServer();
  const client = new Client({ name: "markmv-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  return client;
}

/**
 * Array.isArray's own lib.es5.d.ts signature narrows to any[], not unknown[] -- this narrows
 * properly instead.
 */
function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Extract the single text content block every markmv tool call returns (never a CreateTaskResult,
 * since no tool here is task-augmented)
 */
function textOf(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content: unknown = "content" in result ? result.content : undefined;
  if (!isUnknownArray(content)) {
    throw new Error("Expected a CallToolResult with content");
  }
  const [first] = content;
  if (
    typeof first !== "object" ||
    first === null ||
    !("type" in first) ||
    first.type !== "text" ||
    !("text" in first) ||
    typeof first.text !== "string"
  ) {
    throw new Error("Expected a single text content block");
  }
  return first.text;
}

describe("MCP Server", () => {
  let client: Client;

  beforeEach(async () => {
    vi.clearAllMocks();
    client = await connectClient();
  });

  afterEach(async () => {
    await client.close();
  });

  describe("Tool Listing", () => {
    it("should list all four exposed tools with their schema-derived descriptions", async () => {
      const { tools } = await client.listTools();

      expect(tools).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "move_file",
            description:
              "Move a single markdown file and update all references",
          }),
          expect.objectContaining({
            name: "move_files",
            description:
              "Move multiple markdown files and update all references",
          }),
          expect.objectContaining({
            name: "validate_operation",
            description:
              "Validate the result of a previous operation for broken links",
          }),
          expect.objectContaining({
            name: "test_auto_exposure",
            description: "Test function to demonstrate auto-exposure pattern",
          }),
        ]),
      );
      expect(tools).toHaveLength(4);
    });
  });

  describe("Tool Execution", () => {
    it("should execute move_file tool successfully", async () => {
      const result = await client.callTool({
        name: "move_file",
        arguments: {
          sourcePath: "source.md",
          destinationPath: "dest.md",
          options: { dryRun: true },
        },
      });

      expect(textOf(result)).toContain('"success": true');
      expect(result.isError).toBeUndefined();
    });

    it("should execute move_files tool successfully", async () => {
      const result = await client.callTool({
        name: "move_files",
        arguments: {
          moves: [
            { source: "file1.md", destination: "dest1.md" },
            { source: "file2.md", destination: "dest2.md" },
          ],
          options: { dryRun: true },
        },
      });

      expect(textOf(result)).toContain('"success": true');
      expect(result.isError).toBeUndefined();
    });

    it("should execute validate_operation tool successfully", async () => {
      const result = await client.callTool({
        name: "validate_operation",
        arguments: {
          result: {
            success: true,
            modifiedFiles: ["test.md"],
            createdFiles: [],
            deletedFiles: [],
            errors: [],
            warnings: [],
            changes: [],
          },
        },
      });

      expect(textOf(result)).toContain('"valid": true');
      expect(result.isError).toBeUndefined();
    });

    it("should execute test_auto_exposure tool successfully", async () => {
      const result = await client.callTool({
        name: "test_auto_exposure",
        arguments: { input: "test message" },
      });

      expect(textOf(result)).toContain('"success": true');
      expect(result.isError).toBeUndefined();
    });

    it("should report an error for an unknown tool", async () => {
      const result = await client.callTool({
        name: "unknown_tool",
        arguments: {},
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("unknown_tool");
    });

    it("should reject move_file arguments with the wrong type", async () => {
      const result = await client.callTool({
        name: "move_file",
        arguments: {
          sourcePath: 123,
          destinationPath: "dest.md",
        },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("move_file");
    });

    it("should reject move_files arguments with the wrong type", async () => {
      const result = await client.callTool({
        name: "move_files",
        arguments: { moves: "not an array" },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("move_files");
    });

    it("should reject validate_operation arguments with an incomplete OperationResult", async () => {
      const result = await client.callTool({
        name: "validate_operation",
        arguments: { result: "not an object" },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("validate_operation");
    });

    it("should reject test_auto_exposure arguments with the wrong type", async () => {
      const result = await client.callTool({
        name: "test_auto_exposure",
        arguments: { input: 123 },
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("test_auto_exposure");
    });
  });

  describe("Server Startup", () => {
    it("should start MCP server successfully", async () => {
      await startMcpServer();

      expect(mockConsoleError).toHaveBeenCalledWith(
        "markmv MCP server started",
      );
    });
  });
});
