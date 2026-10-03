import { defineConfig } from "vitest/config";

/**
 * Forwards the named environment variables to the tests, leaving out any that are unset or empty.
 * Vitest turns an undefined `env` value into the string "undefined", which a test reading the
 * variable would take for a real setting.
 * @param names - The variables to forward
 * @returns The variables that are set, with their values
 */
function forwardedEnv(names: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    names.flatMap((name) => {
      const value = process.env[name];

      return value === undefined || value === "" ? [] : [[name, value]];
    }),
  );
}

/** Reads an environment variable, treating an empty value the same as an unset one. */
function envOrDefault(name: string, fallback: string): string {
  const value = process.env[name];

  return value === undefined || value === "" ? fallback : value;
}

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    env: {
      // Cross-platform test environment variables
      MARKMV_TEST_OS: envOrDefault("MARKMV_TEST_OS", "unknown"),
      MARKMV_TEST_CASE_SENSITIVE: envOrDefault(
        "MARKMV_TEST_CASE_SENSITIVE",
        "auto",
      ),
      MARKMV_TEST_PATH_SEP: envOrDefault("MARKMV_TEST_PATH_SEP", "auto"),
      ...forwardedEnv([
        "MARKMV_TEST_FILESYSTEM_CASE_SENSITIVE",
        "MARKMV_TEST_SUPPORTS_SYMLINKS",
      ]),
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html", "lcov"],
      reportsDirectory: "./coverage",
      allowExternal: false,
      skipFull: false,
      clean: true,
      exclude: [
        "node_modules/",
        "dist/",
        "coverage/",
        "**/*.d.ts",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/test/**",
        "**/tests/**",
        "**/__tests__/**",
        "vitest.config.ts",
        ".eslintrc.*",
        "commitlint.config.*",
        "release.config.*",
      ],
      include: ["src/**/*.ts"],
      // Floors set at the coverage measured when they were introduced, rounded down, so coverage can only be held or raised. A `global` key here is not one Vitest reads, which is how the earlier thresholds came to enforce nothing.
      thresholds: {
        branches: 69,
        functions: 86,
        lines: 80,
        statements: 80,
      },
    },
    include: [
      "src/**/*.test.ts",
      "src/**/*.spec.ts",
      ".github/scripts/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/coverage/**"],
  },
});
