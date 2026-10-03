import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Argument, Command, Option } from "commander";

const OUTPUT_DIRECTORY = "docs-generated/cli";

/** The overview needs a name no subcommand can have, since each subcommand is written to its own name's file. */
const OVERVIEW_FILE = "cli-reference.md";

/** Escapes the characters that would end or split a markdown table cell. */
function cell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function defaultCell(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return `\`${cell(value)}\``;

  return `\`${cell(JSON.stringify(value))}\``;
}

interface Row {
  readonly label: string;
  readonly description: string;
  readonly defaultValue: unknown;
}

function argumentRow(argument: Argument): Row {
  const name = argument.variadic ? `${argument.name()}...` : argument.name();

  return {
    label: argument.required ? `<${name}>` : `[${name}]`,
    description: argument.description,
    defaultValue: argument.defaultValue,
  };
}

function optionRow(option: Option): Row {
  return {
    label: option.flags,
    description: option.description,
    defaultValue: option.defaultValue,
  };
}

/** Renders a table, leaving out the Default column when no row has a default so it never shows as an empty column. */
function table(heading: string, rows: readonly Row[]): string[] {
  const hasDefaults = rows.some((row) => row.defaultValue !== undefined);
  const header = hasDefaults
    ? `| ${heading} | Description | Default |`
    : `| ${heading} | Description |`;
  const divider = hasDefaults ? "| --- | --- | --- |" : "| --- | --- |";
  const body = rows.map((row) => {
    const base = `| \`${cell(row.label)}\` | ${cell(row.description)} |`;

    return hasDefaults ? `${base} ${defaultCell(row.defaultValue)} |` : base;
  });

  return [header, divider, ...body];
}

/** Renders one subcommand as a TypeDoc project document, taking every fact from the commander definition. */
export function renderCommand(command: Command, programName: string): string {
  const lines = [
    "---",
    `title: ${programName} ${command.name()}`,
    "---",
    "",
    `# ${programName} ${command.name()}`,
    "",
    command.description(),
    "",
    "## Usage",
    "",
    "```bash",
    `${programName} ${command.name()} ${command.usage()}`,
    "```",
    "",
  ];

  const argumentRows = command.registeredArguments.map(argumentRow);
  if (argumentRows.length > 0) {
    lines.push("## Arguments", "", ...table("Argument", argumentRows), "");
  }

  const optionRows = command.options
    .filter((option) => !option.hidden)
    .map(optionRow);
  if (optionRows.length > 0) {
    lines.push("## Options", "", ...table("Option", optionRows), "");
  }

  return lines.join("\n");
}

/** Renders the overview document that lists every subcommand with its summary. */
export function renderOverview(program: Command): string {
  const rows = program.commands.map(
    (command) =>
      `| [\`${command.name()}\`](./${command.name()}.md) | ${cell(command.description())} |`,
  );

  return [
    "---",
    "title: CLI reference",
    "---",
    "",
    "# CLI reference",
    "",
    program.description(),
    "",
    "```bash",
    `${program.name()} <command> [options]`,
    "```",
    "",
    "| Command | Description |",
    "| --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function hasCreateProgram(
  value: unknown,
): value is { createProgram: () => Command } {
  return (
    typeof value === "object" &&
    value !== null &&
    "createProgram" in value &&
    typeof value.createProgram === "function"
  );
}

async function main(): Promise<void> {
  const loaded: unknown = await import(
    pathToFileURL(join(process.cwd(), "dist/cli/program.js")).href
  );
  if (!hasCreateProgram(loaded)) {
    throw new Error("dist/cli/program.js does not export createProgram");
  }
  const program = loaded.createProgram();

  rmSync(OUTPUT_DIRECTORY, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  writeFileSync(join(OUTPUT_DIRECTORY, OVERVIEW_FILE), renderOverview(program));
  for (const command of program.commands) {
    writeFileSync(
      join(OUTPUT_DIRECTORY, `${command.name()}.md`),
      renderCommand(command, program.name()),
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
