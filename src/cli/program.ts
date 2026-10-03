import { readFileSync } from "node:fs";
import { Command } from "commander";
import { registerFileCommands } from "./file-commands.js";
import { registerStructureCommands } from "./structure-commands.js";
import { registerValidationCommands } from "./validation-commands.js";
import { registerContentCommands } from "./content-commands.js";
import { registerServerCommands } from "./server-commands.js";

function isPackageJson(value: unknown): value is { version: string } {
  if (typeof value !== "object" || value === null) return false;
  if (!("version" in value)) return false;

  return typeof value.version === "string";
}

/**
 * Reads the package version from package.json at runtime so the reported version always matches the
 * published package instead of a literal that drifts between releases.
 */
function getPackageVersion(): string {
  const raw: unknown = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf-8"),
  );
  if (!isPackageJson(raw)) {
    throw new Error("package.json is missing a string version field");
  }

  return raw.version;
}

/**
 * Builds the markmv command tree without parsing arguments, so the CLI entry point and the generated
 * CLI reference read the same definitions.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name("markmv")
    .description(
      "CLI for markdown file operations with intelligent link refactoring",
    )
    .version(getPackageVersion());

  registerFileCommands(program);
  registerStructureCommands(program);
  registerValidationCommands(program);
  registerContentCommands(program);
  registerServerCommands(program);

  return program;
}
