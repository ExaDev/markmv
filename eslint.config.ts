import { readFileSync } from "node:fs";
import { defineConfig } from "eslint/config";
import { exadevConfig } from "@exadev/eslint-config";
import globals from "globals";
import markdown from "@eslint/markdown";
import depend from "eslint-plugin-depend";
import * as yamlParser from "yaml-eslint-parser";
import prettierRecommended from "eslint-plugin-prettier/recommended";

/**
 * The source files `src/index.ts` re-exports from, read from that file so the list cannot drift from
 * the library's actual public surface.
 */
const publicModules = [
  ...new Set(
    [
      ...readFileSync("src/index.ts", "utf8").matchAll(
        /from "\.\/([^"]+)\.js"/g,
      ),
    ].map(([, module]) => `src/${module}.ts`),
  ),
];

export default defineConfig(
  ...exadevConfig({
    turbo: {},
    // The `root` section is switched off on purpose: its knip check expects a script that runs knip itself, which the turbo convention (a public script delegating to `_knip`) rules out, so both cannot hold in a turbo repository (ExaDev/eslint-config#110).
    toolingWiring: {
      root: false,
      hooks: true,
      publish: { tools: ["publint", "attw"] },
    },
    importPolicies: [
      {
        files: ["src/**"],
        ignores: ["**/*.test.ts", "src/test-support/**"],
        deny: [
          {
            specifiers: ["src/test-support", "src/utils/test-helpers"],
            message:
              "test doubles and helpers stay out of shipped code; import them from tests only",
          },
        ],
        computedSpecifiers: "report",
      },
    ],
  }),
  {
    // Tracked but still not meant to be linted or reformatted: .d.ts is generated at build time, both lockfiles are machine-written, and CHANGELOG.md is entirely semantic-release output rewritten wholesale on every release -- all three are tracked, so .gitignore doesn't exclude them, and reformatting CHANGELOG.md by hand here would just be undone (noisily) by the next release anyway.
    ignores: [
      "**/*.d.ts",
      "package-lock.json",
      "pnpm-lock.yaml",
      "CHANGELOG.md",
    ],
  },
  {
    // Every plain .js/.mjs/.cjs file here runs directly under Node (scripts/, examples/programmatic-usage.js), so no-undef needs the real Node global set to tell an actual typo apart from a legitimate global like require/__dirname/process.
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Type-aware rules need a program that contains every linted TypeScript and JavaScript file: tsconfig.json's own include is src/** only, so the root config files, the CI scripts, the examples and scripts/ would otherwise have no type information and the rules that require it would refuse to run on them.
    files: ["**/*.{ts,tsx,mts,cts,js,mjs,cjs}"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.lint.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // These loops are sequential by design, never an oversight: output and result order follow input order, a fail-fast loop must stop at the first failure, retries depend on the previous attempt failing, external link checks are rate limited, a transaction applies and rolls back its steps in order, and an unbounded fan-out over a large tree risks exhausting file handles. Loops whose iterations are independent were rewritten with Promise.all instead.
    files: [
      "src/commands/check-links.ts",
      "src/commands/clip.ts",
      "src/commands/convert.ts",
      "src/commands/embed.ts",
      "src/commands/extract.ts",
      "src/commands/generate-index.ts",
      "src/commands/move.ts",
      "src/commands/toc.ts",
      "src/commands/tree.ts",
      "src/commands/validate.ts",
      "src/core/file-operations.ts",
      "src/core/link-converter.ts",
      "src/core/link-validator.ts",
      "src/utils/content-freshness.integration.test.ts",
      "src/utils/file-utils.ts",
      "src/utils/transaction-manager.ts",
    ],
    rules: { "no-await-in-loop": "off" },
  },
  {
    // What readers of the published API see is every exported function and class re-exported from src/index.ts, so each must show how it is used. Methods, constructors and internal modules are left to their class's own example.
    files: ["src/index.ts", ...publicModules],
    ignores: ["**/*.test.ts"],
    rules: {
      "jsdoc/require-example": [
        "error",
        {
          contexts: [
            "ExportNamedDeclaration > FunctionDeclaration",
            "ExportNamedDeclaration > ClassDeclaration",
          ],
          checkConstructors: false,
          checkGetters: false,
          checkSetters: false,
        },
      ],
    },
  },
  {
    // TypeDoc renders a module comment only when it carries @packageDocumentation, so without the tag the entry point's overview and examples are silently dropped from the published site.
    files: ["src/index.ts"],
    rules: {
      "jsdoc/require-file-overview": [
        "error",
        {
          tags: {
            packageDocumentation: { mustExist: true, preventDuplicates: true },
          },
        },
      ],
    },
  },
  {
    // TypeDoc renders @defaultValue as its own block, which a default buried in a sentence never gets.
    files: ["src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "jsdoc/match-description": [
        "error",
        {
          contexts: ["TSPropertySignature"],
          matchDescription:
            "^(?![\\s\\S]*(\\(default|\\bdefaults? to\\b))[\\s\\S]*$",
          message:
            "State a default with @defaultValue, not in the description.",
        },
      ],
    },
  },
  {
    // A function that throws must say when, wherever it lives: callers cannot read that from the signature.
    files: ["src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "jsdoc/require-throws": "error",
      "jsdoc/require-throws-description": "error",
    },
  },
  {
    // Test fixtures legitimately encode raw literal values (sizes, counts, line numbers, timestamps) that are the point of the assertion; naming each would obscure what the test checks.
    files: ["**/*.test.ts"],
    rules: { "@typescript-eslint/no-magic-numbers": "off" },
  },
  {
    // @vitest/expect's own type declarations type expect.stringContaining/objectContaining/arrayContaining/any as returning `any` unconditionally, so every use inside an object or array literal trips no-unsafe-assignment with no way to narrow it from the call site without an elaborate type guard that adds nothing to the test. Saving and restoring a prototype method or global around a `vi.spyOn` is idiomatic vitest setup/teardown, and every instance in this codebase rebinds context explicitly via `.call()` or reassignment, so unbound-method's unbound-`this` concern doesn't apply to that pattern.
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },
  {
    // This example's whole point is demonstrating markmv's CommonJS/require() usage for consumers not on ES modules -- rewriting it to `import` would demonstrate the wrong thing.
    files: ["examples/programmatic-usage.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // glob's flag is current and real (fs.glob/tinyglobby/fdir are genuine Node-22+ alternatives) -- allowlisted only because the actual migration is separate follow-up work, not because the flag is wrong. lint-staged's flag is a stale false positive: module-replacements only ever suggested nano-staged as the alternative, which es-tooling/module-replacements#214 got removed in 3.0.0 for being unmaintained for 3+ years while lint-staged itself is actively maintained -- eslint-plugin-depend@1.5.0 still pins module-replacements@^2.10.1, so the bad entry persists here until eslint-plugin-depend's own open es-tooling/eslint-plugin-depend#65 ("try updating module-replacements to v3") lands; module-replacements 3.x changed its manifest schema, so overriding the version locally isn't safe without that plugin-side update.
    files: ["package.json"],
    extends: [depend.configs["flat/recommended"]],
    rules: {
      "depend/ban-dependencies": [
        "error",
        { allowed: ["lint-staged", "glob"] },
      ],
    },
  },
  ...markdown.configs.recommended,
  {
    files: ["**/*.md"],
    rules: {
      "markdown/no-html": "error",
    },
  },
  {
    // The README uses raw <div>/<a> tags for layout GitHub's markdown renderer needs (centred badges and links) that CommonMark itself has no syntax for, so it is not a case of unreviewed HTML slipping into hand-written docs.
    files: ["README.md"],
    rules: {
      "markdown/no-html": "off",
    },
  },
  {
    files: ["**/*.{yml,yaml}"],
    languageOptions: {
      parser: yamlParser,
    },
  },
  {
    // JSON layout belongs to the RFC 8785 canonical formatter the shared config applies to every JSON file; Prettier would collapse short arrays onto one line, which that formatter then rejects, so each tool is kept to the files it can format consistently.
    ...prettierRecommended,
    files: ["**/*.{ts,tsx,mts,cts,js,mjs,cjs,md,yml,yaml}"],
  },
);
