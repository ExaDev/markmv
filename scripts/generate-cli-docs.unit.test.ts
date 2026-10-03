import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { renderCommand, renderOverview } from "./generate-cli-docs.ts";

function sampleProgram(): Command {
  const program = new Command("tool").description("A sample tool");
  program
    .command("move")
    .description("Move a file")
    .argument("<source>", "File to move")
    .argument("[extras...]", "Further files")
    .option("-d, --dry-run", "Show changes only")
    .option("--depth <n>", "Search depth | in levels", "3");

  return program;
}

describe("renderCommand", () => {
  const [move] = sampleProgram().commands;

  it("documents each argument with its required form", () => {
    const text = renderCommand(move, "tool");

    expect(text).toContain("| `<source>` | File to move |");
    expect(text).toContain("| `[extras...]` | Further files |");
  });

  it("documents each option with its default and escapes table pipes", () => {
    const text = renderCommand(move, "tool");

    expect(text).toContain(
      "| `--depth <n>` | Search depth \\| in levels | `3` |",
    );
    expect(text).toContain("| `-d, --dry-run` | Show changes only |  |");
  });

  it("titles the document with the full command name", () => {
    const text = renderCommand(move, "tool");

    expect(text.startsWith("---\ntitle: tool move\n---\n")).toBe(true);
  });
});

describe("default column", () => {
  it("is omitted when no row has a default", () => {
    const [move] = sampleProgram().commands;
    const text = renderCommand(move, "tool");

    expect(text).toContain("| Argument | Description |\n| --- | --- |");
    expect(text).toContain("| Option | Description | Default |");
  });
});

describe("renderOverview", () => {
  it("links every subcommand with its summary", () => {
    const text = renderOverview(sampleProgram());

    expect(text).toContain("| [`move`](./move.md) | Move a file |");
  });
});
