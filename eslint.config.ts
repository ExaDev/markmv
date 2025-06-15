import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import type { Linter } from 'eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', '**/*.d.ts', 'coverage/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      }
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off', // Allow dynamic imports
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-explicit-any': 'error', // Disallow 'any' types
      '@typescript-eslint/consistent-type-assertions': ['error', {
        assertionStyle: 'never' // Disallow type assertions (as Type)
      }],
      '@typescript-eslint/no-non-null-assertion': 'error', // Disallow non-null assertions (!)
      '@typescript-eslint/ban-ts-comment': ['error', {
        'ts-expect-error': 'allow-with-description',
        'ts-ignore': true,
        'ts-nocheck': true,
        'ts-check': false,
        minimumDescriptionLength: 10
      }],
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      '@typescript-eslint/no-require-imports': 'off', // Allow require for dynamic imports
      'complexity': 'off',
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
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
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
  prettier,
) satisfies Linter.Config[];