#!/usr/bin/env node

import { createProgram } from "../cli/program.js";

/** Shortcut for `markmv api`, kept so `markmv-api` keeps working. */
await createProgram().parseAsync([
  process.argv[0] ?? "node",
  "markmv",
  "api",
  ...process.argv.slice(2),
]);
