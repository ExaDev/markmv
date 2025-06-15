import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      // Cross-platform test environment variables
      MARKMV_TEST_OS: process.env.MARKMV_TEST_OS || 'unknown',
      MARKMV_TEST_CASE_SENSITIVE: process.env.MARKMV_TEST_CASE_SENSITIVE || 'auto',
      MARKMV_TEST_PATH_SEP: process.env.MARKMV_TEST_PATH_SEP || 'auto',
      MARKMV_TEST_FILESYSTEM_CASE_SENSITIVE: process.env.MARKMV_TEST_FILESYSTEM_CASE_SENSITIVE,
      MARKMV_TEST_SUPPORTS_SYMLINKS: process.env.MARKMV_TEST_SUPPORTS_SYMLINKS,
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      allowExternal: false,
      skipFull: false,
      clean: true,
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/test/**',
        '**/tests/**',
        '**/__tests__/**',
        'vitest.config.ts',
        '.eslintrc.*',
        'commitlint.config.*',
        '.releaserc.*'
      ],
      include: ['src/**/*.ts'],
      thresholds: {
        global: {
          branches: 40,
          functions: 40,
          lines: 40,
          statements: 40
        }
      }
    },
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['node_modules/', 'dist/', 'coverage/']
  }
});