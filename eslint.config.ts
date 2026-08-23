import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import type { Linter } from 'eslint';

export default tseslint.config(
  {
    // Mirrors the exclusions .prettierignore used to carry for Prettier's own CLI, now that eslint-plugin-prettier's `prettier/prettier` rule replaces that CLI and does not read .prettierignore itself.
    ignores: [
      'node_modules/**',
      'dist/**',
      '**/*.d.ts',
      'coverage/**',
      '**/*.md',
      'package-lock.json',
    ],
  },
  {
    // Forces every lint exception through this file instead of an inline eslint-disable comment, so rule exceptions stay centrally reviewable rather than scattered across src/.
    linterOptions: {
      noInlineConfig: true,
    },
  },
  js.configs.recommended,
  // Non-type-checked TS rules and the TS parser apply to every .ts file, including root-level config files (this file included) -- those never get type-aware linting (see below) but still need a parser assigned or eslint skips them with "no matching configuration".
  ...tseslint.configs.recommended,
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
  prettierRecommended
) satisfies Linter.Config[];
