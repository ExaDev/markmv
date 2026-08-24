import path from 'node:path';
import { includeIgnoreFile } from '@eslint/config-helpers';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import json from '@eslint/json';
import markdown from '@eslint/markdown';
import depend from 'eslint-plugin-depend';
import * as yamlParser from 'yaml-eslint-parser';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import type { Linter } from 'eslint';

export default tseslint.config(
  // The lint script runs `eslint .`, so this keeps lint scope matching git's own idea of what belongs to the project -- generated/vendored output (dist/, docs/, docs-markdown/, coverage/, node_modules/, .turbo/, .markmv-cache/), editor/agent-local state (.vscode/, .claude/), and anything else .gitignore already excludes -- as one source of truth instead of a second, independently maintained ignore list that drifts from it.
  includeIgnoreFile(path.resolve(import.meta.dirname, '.gitignore')),
  {
    // Tracked but still not meant to be linted or reformatted: .d.ts is generated at build time, both lockfiles are machine-written, and CHANGELOG.md is entirely semantic-release output rewritten wholesale on every release -- all three are tracked, so .gitignore doesn't exclude them, and reformatting CHANGELOG.md by hand here would just be undone (noisily) by the next release anyway.
    ignores: ['**/*.d.ts', 'package-lock.json', 'pnpm-lock.yaml', 'CHANGELOG.md'],
  },
  {
    // Forces every lint exception through this file instead of an inline eslint-disable comment, so rule exceptions stay centrally reviewable rather than scattered across src/.
    linterOptions: {
      noInlineConfig: true,
    },
  },
  {
    // Scoped to JS/TS files specifically now that `eslint .` also reaches JSON, Markdown, and YAML files below -- eslint:recommended and typescript-eslint's rules assume a JS-compatible SourceCode (e.g. sourceCode.getAllComments), which the JSON/Markdown/YAML languages below don't implement, and applying them unscoped crashes rather than no-ops on those files. This also carries the TS parser for every .ts file, including root-level config files, which still need a parser assigned even though they never get type-aware linting (see below).
    files: ['**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
  },
  {
    // Type-aware rules need parserOptions.project, which only resolves for files tsconfig.json's include covers (src/**). Scoping the type-aware presets to that same set, rather than applying them unconditionally to every .ts file eslint touches, is what stops a crash the moment a new root .ts config file is linted.
    files: ['src/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommendedTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off', // Allow dynamic imports
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-explicit-any': 'error', // Disallow 'any' types
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'never', // Disallow type assertions (as Type)
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error', // Disallow non-null assertions (!)
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
          minimumDescriptionLength: 10,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-require-imports': 'off', // Allow require for dynamic imports
      complexity: 'off',
      'no-void': 'off',
      'no-undef': 'off', // TypeScript handles this
      'no-empty': 'off', // Allow empty catch blocks
      'no-dupe-else-if': 'off', // Allow defensive programming patterns
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn', // Warn but allow in tests
      '@typescript-eslint/consistent-type-assertions': 'off', // Allow type assertions in tests
      '@typescript-eslint/no-non-null-assertion': 'warn', // Warn but allow in tests
      '@typescript-eslint/ban-ts-comment': 'off', // Allow ts-ignore etc in tests
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      // @vitest/expect's own type declarations type expect.stringContaining/objectContaining/arrayContaining/any
      // as returning `any` unconditionally, so every use inside an object or array literal trips this rule with no way to narrow it from the call site without an elaborate type guard that adds nothing to the test.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      // Saving and restoring a prototype method or global (e.g. `const original = Class.prototype.method` / `const originalExit = process.exit`) around a `vi.spyOn` is idiomatic vitest setup/teardown, and every instance in this codebase rebinds context explicitly via `.call()` or reassignment, so the rule's unbound-`this` concern doesn't apply to this pattern.
      '@typescript-eslint/unbound-method': 'off',
      'no-undef': 'off',
      'no-empty': 'off',
    },
  },
  {
    files: ['src/generated/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn', // Warn but allow in generated files
      '@typescript-eslint/consistent-type-assertions': 'off', // Allow type assertions in generated files
      '@typescript-eslint/no-non-null-assertion': 'warn', // Warn but allow in generated files
      '@typescript-eslint/ban-ts-comment': 'off', // Allow ts-ignore etc in generated files
      '@typescript-eslint/no-unused-vars': 'off', // Allow unused vars in generated files
      'no-undef': 'off',
      'no-empty': 'off',
    },
  },
  {
    // This example's whole point is demonstrating markmv's CommonJS/require() usage for consumers not on ES modules -- rewriting it to `import` would demonstrate the wrong thing.
    files: ['examples/programmatic-usage.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.json'],
    language: 'json/json',
    plugins: { json },
    extends: [json.configs.recommended],
  },
  {
    // glob's flag is current and real (fs.glob/tinyglobby/fdir are genuine Node-22+ alternatives) -- allowlisted only because the actual migration is separate follow-up work, not because the flag is wrong. lint-staged's flag is a stale false positive: module-replacements only ever suggested nano-staged as the alternative, which es-tooling/module-replacements#214 got removed in 3.0.0 for being unmaintained for 3+ years while lint-staged itself is actively maintained -- eslint-plugin-depend@1.5.0 still pins module-replacements@^2.10.1, so the bad entry persists here until eslint-plugin-depend's own open es-tooling/eslint-plugin-depend#65 ("try updating module-replacements to v3") lands; module-replacements 3.x changed its manifest schema, so overriding the version locally isn't safe without that plugin-side update.
    files: ['package.json'],
    language: 'json/json',
    extends: [depend.configs['flat/recommended']],
    rules: {
      'depend/ban-dependencies': ['error', { allowed: ['lint-staged', 'glob'] }],
    },
  },
  ...markdown.configs.recommended,
  {
    files: ['**/*.md'],
    rules: {
      'markdown/no-html': 'error',
    },
  },
  {
    // TypeDoc's own generated section wraps a hand-authored template (templates/README-for-typedoc.md) around API docs, and both use raw <div>/<a> tags for layout GitHub's markdown renderer needs (centered badges, anchors) that CommonMark itself has no syntax for -- not a case of unreviewed HTML slipping into hand-written docs.
    files: ['README.md', 'templates/README-for-typedoc.md'],
    rules: {
      'markdown/no-html': 'off',
    },
  },
  {
    // typedoc-plugin-markdown's mergeReadme option only inlines the entry-point module's own page into README.md; a type referenced from that page but declared elsewhere (e.g. MoveOperationOptions, OperationResult in src/types/operations.ts, which isn't a typedoc.markdown.json entry point) still gets a real anchor on its own separate generated page, but the link to it inside the merged README points at a same-document fragment that page never brings along. This is a limitation of the docs:readme-generate pipeline's own output, regenerated on every release, not a hand-authored linking mistake.
    files: ['README.md'],
    rules: {
      'markdown/no-missing-link-fragments': 'off',
    },
  },
  {
    files: ['**/*.{yml,yaml}'],
    languageOptions: {
      parser: yamlParser,
    },
  },
  prettierRecommended
) satisfies Linter.Config[];
