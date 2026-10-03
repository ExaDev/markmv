#!/usr/bin/env node

import { createProgram } from "../cli/program.js";

/** Shortcut for `markmv mcp`, kept so `markmv-mcp` keeps working. */
await createProgram().parseAsync([
  process.argv[0] ?? "node",
  "markmv",
  "mcp",
  ...process.argv.slice(2),
]);
