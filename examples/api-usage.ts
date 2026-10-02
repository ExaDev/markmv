/**
 * Example usage of markmv REST API
 *
 * Demonstrates how to use the markmv REST API server for language-agnostic access. Shows HTTP
 * requests to various endpoints with different operation types.
 */

import type { ApiResponse, HealthResponse } from "../src/types/api.js";
import type { OperationResult } from "../src/types/operations.js";

/** Width of the divider printed between examples. */
const SEPARATOR_WIDTH = 50;

/** Options for a single API request. */
interface RequestOptions {
  /** HTTP method; defaults to POST. */
  method?: "GET" | "POST";
  /** JSON body, sent only with POST. */
  data?: unknown;
}

/**
 * Checks the response envelope shared by every endpoint.
 *
 * The payload under `data` is trusted to match `T`, as the server owns that contract.
 */
function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  if (typeof value !== "object" || value === null) return false;
  if (!("success" in value) || typeof value.success !== "boolean") return false;

  return "timestamp" in value && typeof value.timestamp === "string";
}

/** Example API client for markmv REST API */
class MarkMvApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl = "http://localhost:3000") {
    this.baseUrl = baseUrl;
  }

  /** Make HTTP request to API */
  private async makeRequest<T>(
    endpoint: string,
    { method = "POST", data }: RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (data !== undefined && method === "POST") {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);
      const result: unknown = await response.json();

      if (!isApiResponse<T>(result)) {
        throw new Error("API Error: malformed response envelope");
      }

      if (!response.ok) {
        throw new Error(`API Error: ${result.error ?? "Unknown error"}`);
      }

      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Request failed: ${error.message}`, { cause: error });
      }
      throw error;
    }
  }

  /** Check API health */
  async health(): Promise<ApiResponse<HealthResponse>> {
    return this.makeRequest("/health", { method: "GET" });
  }

  /** Move a single file */
  async moveFile(
    source: string,
    destination: string,
    options: Record<string, unknown> = {},
  ): Promise<ApiResponse<OperationResult>> {
    return this.makeRequest("/api/move", {
      data: {
        source,
        destination,
        options,
      },
    });
  }

  /** Move multiple files */
  async moveFiles(
    moves: readonly { source: string; destination: string }[],
    options: Record<string, unknown> = {},
  ): Promise<ApiResponse<OperationResult>> {
    return this.makeRequest("/api/move-batch", {
      data: {
        moves,
        options,
      },
    });
  }

  /** Convert link formats */
  async convertLinks(
    pattern: string,
    options: Record<string, unknown> = {},
  ): Promise<ApiResponse<OperationResult>> {
    return this.makeRequest("/api/convert", {
      data: {
        pattern,
        options,
      },
    });
  }

  /** Split a file */
  async splitFile(
    filePath: string,
    options: Record<string, unknown>,
  ): Promise<ApiResponse<OperationResult>> {
    return this.makeRequest("/api/split", {
      data: {
        filePath,
        options,
      },
    });
  }

  /** Join multiple files */
  async joinFiles(
    filePaths: readonly string[],
    options: Record<string, unknown>,
  ): Promise<ApiResponse<OperationResult>> {
    return this.makeRequest("/api/join", {
      data: {
        filePaths,
        options,
      },
    });
  }

  /** Merge files */
  async mergeFiles(
    filePaths: readonly string[],
    targetPath: string,
    options: Record<string, unknown>,
  ): Promise<ApiResponse<OperationResult>> {
    return this.makeRequest("/api/merge", {
      data: {
        filePaths,
        targetPath,
        options,
      },
    });
  }

  /** Validate operation result */
  async validateOperation(
    result: OperationResult,
  ): Promise<
    ApiResponse<{ valid: boolean; brokenLinks: number; errors: string[] }>
  > {
    return this.makeRequest("/api/validate", {
      data: {
        result,
      },
    });
  }
}

/** Example: Check API health */
async function healthCheckExample() {
  console.log("🔍 Checking API health...");

  const client = new MarkMvApiClient();

  try {
    const result = await client.health();
    console.log("✅ API Health:", result.data);
  } catch (error) {
    console.error(
      "❌ Health check failed:",
      error instanceof Error ? error.message : error,
    );
  }
}

/** Example: Move a file via REST API */
async function moveFileExample() {
  console.log("🔧 Moving file via REST API...");

  const client = new MarkMvApiClient();

  try {
    const result = await client.moveFile(
      "docs/old-guide.md",
      "docs/new-guide.md",
      {
        dryRun: true,
        verbose: true,
        createDirectories: true,
      },
    );

    console.log("✅ Move operation result:");
    console.log(`  Success: ${String(result.success)}`);
    console.log(
      `  Modified files: ${String(result.data.modifiedFiles.length)}`,
    );
    console.log(`  Created files: ${String(result.data.createdFiles.length)}`);
    console.log(`  Errors: ${String(result.data.errors.length)}`);
  } catch (error) {
    console.error(
      "❌ Move failed:",
      error instanceof Error ? error.message : error,
    );
  }
}

/** Example: Convert link formats via REST API */
async function convertLinksExample() {
  console.log("🔄 Converting link formats via REST API...");

  const client = new MarkMvApiClient();

  try {
    const result = await client.convertLinks("docs/**/*.md", {
      linkStyle: "wikilink",
      pathResolution: "relative",
      recursive: true,
      dryRun: true,
      verbose: true,
    });

    console.log("✅ Convert operation result:");
    console.log(`  Success: ${String(result.success)}`);
    console.log(
      `  Modified files: ${String(result.data.modifiedFiles.length)}`,
    );
    console.log(`  Changes made: ${String(result.data.changes.length)}`);
  } catch (error) {
    console.error(
      "❌ Convert failed:",
      error instanceof Error ? error.message : error,
    );
  }
}

/** Example: Split a file via REST API */
async function splitFileExample() {
  console.log("✂️ Splitting file via REST API...");

  const client = new MarkMvApiClient();

  try {
    const result = await client.splitFile("docs/large-document.md", {
      strategy: "headers",
      outputDir: "docs/split-output",
      headerLevel: 2,
      dryRun: true,
      verbose: true,
    });

    console.log("✅ Split operation result:");
    console.log(`  Success: ${String(result.success)}`);
    console.log(`  Created files: ${String(result.data.createdFiles.length)}`);
    console.log(`  Changes: ${String(result.data.changes.length)}`);
  } catch (error) {
    console.error(
      "❌ Split failed:",
      error instanceof Error ? error.message : error,
    );
  }
}

/** Example: Batch move files via REST API */
async function batchMoveExample() {
  console.log("📦 Batch moving files via REST API...");

  const client = new MarkMvApiClient();

  try {
    const moves = [
      { source: "docs/file1.md", destination: "docs/renamed/file1.md" },
      { source: "docs/file2.md", destination: "docs/renamed/file2.md" },
      { source: "docs/file3.md", destination: "docs/renamed/file3.md" },
    ];

    const result = await client.moveFiles(moves, {
      dryRun: true,
      verbose: true,
      createDirectories: true,
    });

    console.log("✅ Batch move operation result:");
    console.log(`  Success: ${String(result.success)}`);
    console.log(
      `  Total modified files: ${String(result.data.modifiedFiles.length)}`,
    );
    console.log(
      `  Total created files: ${String(result.data.createdFiles.length)}`,
    );
    console.log(`  Total changes: ${String(result.data.changes.length)}`);
  } catch (error) {
    console.error(
      "❌ Batch move failed:",
      error instanceof Error ? error.message : error,
    );
  }
}

/** Example: Join files via REST API */
async function joinFilesExample() {
  console.log("🔗 Joining files via REST API...");

  const client = new MarkMvApiClient();

  try {
    const filePaths = [
      "docs/intro.md",
      "docs/getting-started.md",
      "docs/advanced.md",
      "docs/conclusion.md",
    ];

    const result = await client.joinFiles(filePaths, {
      output: "docs/complete-guide.md",
      orderStrategy: "manual",
      dryRun: true,
      verbose: true,
    });

    console.log("✅ Join operation result:");
    console.log(`  Success: ${String(result.success)}`);
    console.log(`  Output file: ${result.data.createdFiles[0] || "N/A"}`);
    console.log(`  Changes: ${String(result.data.changes.length)}`);
  } catch (error) {
    console.error(
      "❌ Join failed:",
      error instanceof Error ? error.message : error,
    );
  }
}

/** Example usage with curl commands (for non-TypeScript users) */
function showCurlExamples() {
  console.log("🌐 Equivalent curl commands for API usage:\n");

  console.log("# Health check");
  console.log("curl http://localhost:3000/health\n");

  console.log("# Move a file");
  console.log(`curl -X POST http://localhost:3000/api/move \\
  -H "Content-Type: application/json" \\
  -d '{
    "source": "docs/old.md",
    "destination": "docs/new.md",
    "options": {"dryRun": true, "verbose": true}
  }'\n`);

  console.log("# Convert links");
  console.log(`curl -X POST http://localhost:3000/api/convert \\
  -H "Content-Type: application/json" \\
  -d '{
    "pattern": "docs/**/*.md",
    "options": {"linkStyle": "wikilink", "dryRun": true}
  }'\n`);

  console.log("# Split file");
  console.log(`curl -X POST http://localhost:3000/api/split \\
  -H "Content-Type: application/json" \\
  -d '{
    "filePath": "docs/large.md",
    "options": {"strategy": "headers", "outputDir": "docs/split", "dryRun": true}
  }'\n`);
}

/** Run all examples */
async function runExamples() {
  console.log("🚀 Starting markmv REST API examples...\n");

  try {
    await healthCheckExample();
    console.log("\n" + "=".repeat(SEPARATOR_WIDTH) + "\n");

    await moveFileExample();
    console.log("\n" + "=".repeat(SEPARATOR_WIDTH) + "\n");

    await convertLinksExample();
    console.log("\n" + "=".repeat(SEPARATOR_WIDTH) + "\n");

    await splitFileExample();
    console.log("\n" + "=".repeat(SEPARATOR_WIDTH) + "\n");

    await batchMoveExample();
    console.log("\n" + "=".repeat(SEPARATOR_WIDTH) + "\n");

    await joinFilesExample();
    console.log("\n" + "=".repeat(SEPARATOR_WIDTH) + "\n");

    showCurlExamples();

    console.log("✅ All examples completed!");
    console.log(
      '\n💡 Note: Start the API server with "npm run api-server" to test these examples',
    );
  } catch (error) {
    console.error("❌ Example failed:", error);
  }
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples().catch(console.error);
}

// Also support tsx execution
if (process.argv[1]?.endsWith("api-usage.ts")) {
  runExamples().catch(console.error);
}
