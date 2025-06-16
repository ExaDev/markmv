import { describe, test, expect } from 'vitest';
import { platform } from 'node:os';
import {
  getPlatformInfo,
  normalizePath,
  createPath,
  convertPathSeparators,
  wouldFilenamesConflict,
  skipIfUnsupported,
  createConditionalTest,
  fileExists,
  getTestPaths,
  PLATFORM_TEST_PATHS,
} from './test-helpers.js';

describe('Cross-Platform Test Helpers', () => {
  describe('getPlatformInfo', () => {
    test('should return valid platform information', () => {
      const info = getPlatformInfo();

      expect(typeof info.isWindows).toBe('boolean');
      expect(typeof info.isMacOS).toBe('boolean');
      expect(typeof info.isLinux).toBe('boolean');
      expect(typeof info.pathSeparator).toBe('string');
      expect(typeof info.caseSensitive).toBe('boolean');
      expect(typeof info.supportsSymlinks).toBe('boolean');

      // Exactly one platform should be true
      const platformCount = [info.isWindows, info.isMacOS, info.isLinux].filter(Boolean).length;
      expect(platformCount).toBe(1);
    });

    test('should correctly identify current platform', () => {
      const info = getPlatformInfo();
      const currentPlatform = platform();

      switch (currentPlatform) {
        case 'win32':
          expect(info.isWindows).toBe(true);
          expect(info.isMacOS).toBe(false);
          expect(info.isLinux).toBe(false);
          break;
        case 'darwin':
          expect(info.isWindows).toBe(false);
          expect(info.isMacOS).toBe(true);
          expect(info.isLinux).toBe(false);
          break;
        case 'linux':
          expect(info.isWindows).toBe(false);
          expect(info.isMacOS).toBe(false);
          expect(info.isLinux).toBe(true);
          break;
      }
    });
  });

  describe('normalizePath', () => {
    test('should normalize paths correctly', () => {
      const testPath = 'folder/../subfolder/./file.txt';
      const normalized = normalizePath(testPath);

      expect(normalized).toMatch(/subfolder/);
      expect(normalized).not.toMatch(/\.\./);
      expect(normalized).not.toMatch(/\.\//);
    });
  });

  describe('createPath', () => {
    test('should create paths with correct separators', () => {
      const path = createPath('folder', 'subfolder', 'file.txt');
      const info = getPlatformInfo();

      if (info.isWindows) {
        expect(path).toMatch(/folder\\subfolder\\file\.txt/);
      } else {
        expect(path).toMatch(/folder\/subfolder\/file\.txt/);
      }
    });
  });

  describe('convertPathSeparators', () => {
    test('should convert path separators for current platform', () => {
      const info = getPlatformInfo();

      if (info.isWindows) {
        const converted = convertPathSeparators('folder/subfolder/file.txt');
        expect(converted).toBe('folder\\subfolder\\file.txt');
      } else {
        const converted = convertPathSeparators('folder\\subfolder\\file.txt');
        expect(converted).toBe('folder/subfolder/file.txt');
      }
    });
  });

  describe('wouldFilenamesConflict', () => {
    test('should detect filename conflicts based on case sensitivity', () => {
      const info = getPlatformInfo();

      // Same case should always conflict
      expect(wouldFilenamesConflict('file.txt', 'file.txt')).toBe(true);

      // Different case behavior depends on filesystem
      const differentCaseConflict = wouldFilenamesConflict('file.txt', 'FILE.TXT');
      if (info.caseSensitive) {
        expect(differentCaseConflict).toBe(false);
      } else {
        expect(differentCaseConflict).toBe(true);
      }
    });
  });

  describe('skipIfUnsupported', () => {
    test('should return boolean for supported features', () => {
      const symlinkSkip = skipIfUnsupported('symlinks');
      const caseSkip = skipIfUnsupported('case-sensitivity');

      expect(typeof symlinkSkip).toBe('boolean');
      expect(typeof caseSkip).toBe('boolean');
    });
  });

  describe('fileExists', () => {
    test('should return false for non-existent file', () => {
      expect(fileExists('/non/existent/file.txt')).toBe(false);
    });

    test('should return true for this test file', () => {
      // This test file should exist
      expect(fileExists(__filename)).toBe(true);
    });
  });

  describe('getTestPaths', () => {
    test('should return appropriate test paths for current platform', () => {
      const testPaths = getTestPaths();
      const info = getPlatformInfo();

      expect(testPaths).toHaveProperty('absolute');
      expect(testPaths).toHaveProperty('relative');
      expect(testPaths).toHaveProperty('invalid');

      if (info.isWindows) {
        expect(testPaths).toBe(PLATFORM_TEST_PATHS.windows);
        // Windows paths should contain drive letters
        expect(testPaths.absolute.some((path) => path.match(/^[A-Z]:\\/i))).toBe(true);
      } else {
        expect(testPaths).toBe(PLATFORM_TEST_PATHS.unix);
        // Unix paths should start with /
        expect(testPaths.absolute.every((path) => path.startsWith('/'))).toBe(true);
      }
    });
  });

  // Conditional tests to demonstrate the helper
  const conditionalTest = createConditionalTest(test);

  conditionalTest('symlink test', 'symlinks', () => {
    // This test only runs if symlinks are supported
    expect(true).toBe(true);
  });

  conditionalTest('case sensitivity test', 'case-sensitivity', () => {
    // This test only runs on case-sensitive filesystems
    expect(true).toBe(true);
  });

  // Platform-specific tests
  describe('Platform-specific behavior', () => {
    const info = getPlatformInfo();

    if (info.isWindows) {
      test('Windows-specific behavior', () => {
        expect(info.pathSeparator).toBe('\\');
        // Case sensitivity can vary in CI environments, so check the actual detected value
        expect(typeof info.caseSensitive).toBe('boolean');
      });
    }

    if (info.isMacOS) {
      test('macOS-specific behavior', () => {
        expect(info.pathSeparator).toBe('/');
        // macOS can be either case-sensitive or insensitive
      });
    }

    if (info.isLinux) {
      test('Linux-specific behavior', () => {
        expect(info.pathSeparator).toBe('/');
        expect(info.caseSensitive).toBe(true);
      });
    }
  });

  describe('Environment variable override', () => {
    test('should respect CI environment variables', () => {
      // These tests check if CI environment variables are properly read
      const caseSensitiveEnv = process.env.MARKMV_TEST_FILESYSTEM_CASE_SENSITIVE;
      const symlinksEnv = process.env.MARKMV_TEST_SUPPORTS_SYMLINKS;

      if (caseSensitiveEnv !== undefined) {
        const info = getPlatformInfo();
        expect(info.caseSensitive).toBe(caseSensitiveEnv === 'true');
      }

      if (symlinksEnv !== undefined) {
        const info = getPlatformInfo();
        expect(info.supportsSymlinks).toBe(symlinksEnv === 'true');
      }
    });
  });
});
