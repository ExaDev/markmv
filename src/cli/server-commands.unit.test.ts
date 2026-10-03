import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerServerCommands } from "./server-commands.js";

const startApiServer = vi.hoisted(() => vi.fn());
const startMcpServer = vi.hoisted(() => vi.fn());

vi.mock("../api-server.js", () => ({ startApiServer }));
vi.mock("../mcp-server.js", () => ({ startMcpServer }));

function program(): Command {
  const result = new Command("markmv").exitOverride();
  registerServerCommands(result);

  return result;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("markmv api", () => {
  it("starts the API server on the port given by --port", async () => {
    await program().parseAsync(["node", "markmv", "api", "--port", "4321"]);

    expect(startApiServer).toHaveBeenCalledWith(4321);
  });

  it("leaves the port to the environment and default when --port is absent", async () => {
    await program().parseAsync(["node", "markmv", "api"]);

    expect(startApiServer).toHaveBeenCalledWith(undefined);
  });

  it.each(["0", "65536", "abc", "80.5"])(
    "rejects the port %s",
    async (port) => {
      const command = program();
      command.configureOutput({ writeErr: () => undefined });

      await expect(
        command.parseAsync(["node", "markmv", "api", "--port", port]),
      ).rejects.toThrow();
      expect(startApiServer).not.toHaveBeenCalled();
    },
  );
});

describe("markmv mcp", () => {
  it("starts the MCP server", async () => {
    await program().parseAsync(["node", "markmv", "mcp"]);

    expect(startMcpServer).toHaveBeenCalledTimes(1);
  });
});
