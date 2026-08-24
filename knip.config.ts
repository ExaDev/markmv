import type { KnipConfig } from "knip";

const config: KnipConfig = {
  // Entry points are already derived from package.json's bin/main/exports fields; declaring them again here only produces knip's own "redundant entry pattern" warning. The two CI scripts are genuine extra entry points: they're run directly by node (never imported by anything under src/), and at least one of them is invoked only indirectly through a composite action's `command` input rather than a literal workflow `run:` step, which knip's own GitHub Actions detection doesn't trace.
  entry: [".github/scripts/*.ts"],
  project: ["src/**/*.ts", ".github/scripts/**/*.ts"],
  ignoreDependencies: [
    // Referenced only in typedoc.markdown.json's `plugin` array; knip's typedoc plugin only auto-discovers the canonically-named typedoc.json, not alternate config files.
    "typedoc-plugin-markdown",
    // Resolved by semantic-release from the "conventionalcommits" preset string inside release.config.ts's commit-analyzer/release-notes-generator plugin options, not from the top-level plugins array knip's semantic-release plugin inspects.
    "conventional-changelog-conventionalcommits",
    // Resolved at runtime via require.resolve('tsx') in link-parser.test.ts to test the real ESM claude-import path, not imported anywhere statically.
    "tsx",
  ],
  // False positive: check-dependency-age.ts calls `execFileSync("pnpm", ["info", ...])`, and knip's binary-usage heuristic reads the literal string "info" as a reference to the real npm package of that name rather than pnpm's own `info` subcommand.
  ignoreBinaries: ["info"],
};

export default config;
