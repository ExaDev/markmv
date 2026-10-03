import { InvalidArgumentError, type Command } from "commander";

const MIN_PORT = 1;
const MAX_PORT = 65_535;

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new InvalidArgumentError(
      `Port must be an integer from ${String(MIN_PORT)} to ${String(MAX_PORT)}.`,
    );
  }

  return port;
}

/**
 * Registers the commands that start markmv's long-running servers. The servers are loaded on demand
 * so ordinary commands do not pay for the HTTP and Model Context Protocol dependencies.
 * @param program - The commander program to add the commands to
 */
export function registerServerCommands(program: Command): void {
  program
    .command("api")
    .description("Start the REST API server")
    .option(
      "-p, --port <number>",
      "Port to listen on (defaults to the PORT environment variable, then 3000)",
      parsePort,
    )
    .action(async (options: Readonly<{ port?: number }>) => {
      const { startApiServer } = await import("../api-server.js");
      startApiServer(options.port);
    });

  program
    .command("mcp")
    .description(
      "Start the Model Context Protocol server on standard input and output",
    )
    .action(async () => {
      const { startMcpServer } = await import("../mcp-server.js");
      await startMcpServer();
    });
}
