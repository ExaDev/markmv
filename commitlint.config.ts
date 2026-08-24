import type { UserConfig } from "@commitlint/types";
import { commitTypes } from "./release.config.ts";

const Configuration: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [2, "always", commitTypes.map((t) => t.type)],
    "subject-case": [2, "never", ["start-case", "pascal-case", "upper-case"]],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 100],
    "scope-enum": [
      2,
      "always",
      [
        // Interfaces (src/api-server.ts, src/cli.ts, src/mcp-server.ts, src/index.ts)
        "api",
        "cli",
        "mcp",
        "index",
        // src/ module directories
        "commands",
        "core",
        "generated",
        "integration",
        "schemas",
        "scripts",
        "strategies",
        "types",
        "utils",
        // Non-src areas
        "docs",
        "examples",
        // Tooling and process
        "build",
        "ci",
        "deps",
        "deps-dev",
        "lint",
        "release",
      ],
    ],
  },
};

export default Configuration;
