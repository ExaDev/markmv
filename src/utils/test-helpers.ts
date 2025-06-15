/**
 * Cross-platform test utilities for handling filesystem differences
 */

import { platform } from 'node:os';
import { join, sep, win32, posix } from 'node:path';
import { accessSync, constants, lstatSync } from 'node:fs';

export interface PlatformInfo {
  isWindows: boolean;
  isMacOS: boolean;
  isLinux: boolean;
  pathSeparator: string;
  caseSensitive: boolean;
  supportsSymlinks: boolean;
}

/**
 * Get current platform information
 */
export function getPlatformInfo(): PlatformInfo {
  const currentPlatform = platform();
  const isWindows = currentPlatform === 'win32';
  const isMacOS = currentPlatform === 'darwin';
  const isLinux = currentPlatform === 'linux';

  return {
    isWindows,
    isMacOS,
    isLinux,
    pathSeparator: sep,
    caseSensitive: getCaseSensitivity(),
    supportsSymlinks: getSymlinkSupport(),
  };
}

/**
 * Detect filesystem case sensitivity
 */
function getCaseSensitivity(): boolean {
  // Check environment variable first (from CI)
  const envVar = process.env.MARKMV_TEST_FILESYSTEM_CASE_SENSITIVE;
  if (envVar !== undefined) {
    return envVar === 'true';
  }

  // Default assumptions based on platform
  const currentPlatform = platform();
  switch (currentPlatform) {
    case 'win32':
      return false; // Windows is typically case-insensitive
    case 'darwin':
      return false; // macOS is typically case-insensitive (default APFS/HFS+)
    case 'linux':
      return true; // Linux is typically case-sensitive
    default:
      return true; // Default to case-sensitive for unknown platforms
  }
}

/**
 * Detect symbolic link support
 */
function getSymlinkSupport(): boolean {
  // Check environment variable first (from CI)
  const envVar = process.env.MARKMV_TEST_SUPPORTS_SYMLINKS;
  if (envVar !== undefined) {
    return envVar === 'true';
  }

  // Default assumptions based on platform
  const currentPlatform = platform();
  switch (currentPlatform) {
    case 'win32':
      return false; // Windows has limited symlink support
    case 'darwin':
    case 'linux':
      return true; // Unix-like systems generally support symlinks
    default:
      return false; // Default to no symlink support for unknown platforms
  }
}

/**
 * Normalize path for the current platform
 */
export function normalizePath(path: string): string {
  const platformInfo = getPlatformInfo();
  
  if (platformInfo.isWindows) {
    return win32.normalize(path);
  } else {
    return posix.normalize(path);
  }
}

/**
 * Create a path using the appropriate separator for the current platform
 */
export function createPath(...segments: string[]): string {
  const platformInfo = getPlatformInfo();
  
  if (platformInfo.isWindows) {
    return win32.join(...segments);
  } else {
    return posix.join(...segments);
  }
}

/**
 * Convert path separators to the current platform
 */
export function convertPathSeparators(path: string): string {
  const platformInfo = getPlatformInfo();
  
  if (platformInfo.isWindows) {
    return path.replace(/\//g, '\\');
  } else {
    return path.replace(/\\/g, '/');
  }
}

/**
 * Test if two filenames would conflict on the current filesystem
 */
export function wouldFilenamesConflict(filename1: string, filename2: string): boolean {
  const platformInfo = getPlatformInfo();
  
  if (platformInfo.caseSensitive) {
    return filename1 === filename2;
  } else {
    return filename1.toLowerCase() === filename2.toLowerCase();
  }
}

/**
 * Skip test if the current platform doesn't support the required feature
 */
export function skipIfUnsupported(feature: 'symlinks' | 'case-sensitivity'): boolean {
  const platformInfo = getPlatformInfo();
  
  switch (feature) {
    case 'symlinks':
      return !platformInfo.supportsSymlinks;
    case 'case-sensitivity':
      return !platformInfo.caseSensitive;
    default:
      return false;
  }
}

/**
 * Create test helper that conditionally runs based on platform capabilities
 */
export function conditionalTest(
  name: string,
  requirement: 'symlinks' | 'case-sensitivity' | 'windows' | 'unix',
  testFn: () => void | Promise<void>
): void {
  const platformInfo = getPlatformInfo();
  
  let shouldSkip = false;
  let skipReason = '';
  
  switch (requirement) {
    case 'symlinks':
      shouldSkip = !platformInfo.supportsSymlinks;
      skipReason = 'symbolic links not supported on this platform';
      break;
    case 'case-sensitivity':
      shouldSkip = !platformInfo.caseSensitive;
      skipReason = 'filesystem is not case-sensitive';
      break;
    case 'windows':
      shouldSkip = !platformInfo.isWindows;
      skipReason = 'test requires Windows';
      break;
    case 'unix':
      shouldSkip = platformInfo.isWindows;
      skipReason = 'test requires Unix-like system';
      break;
  }
  
  if (shouldSkip) {
    test.skip(`${name} (skipped: ${skipReason})`, testFn);
  } else {
    test(name, testFn);
  }
}

/**
 * Check if a file exists and is accessible
 */
export function fileExists(filePath: string): boolean {
  try {
    accessSync(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a path is a symbolic link
 */
export function isSymbolicLink(filePath: string): boolean {
  try {
    const stats = lstatSync(filePath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Get OS-specific temporary directory patterns
 */
export function getTempDirPatterns(): string[] {
  const platformInfo = getPlatformInfo();
  
  if (platformInfo.isWindows) {
    return ['C:\\temp', 'C:\\tmp', '%TEMP%', '%TMP%'];
  } else {
    return ['/tmp', '/var/tmp', '$TMPDIR'];
  }
}

/**
 * Platform-specific test data for path testing
 */
export const PLATFORM_TEST_PATHS = {
  windows: {
    absolute: ['C:\\Users\\test\\file.txt', 'D:\\projects\\readme.md'],
    relative: ['..\\parent\\file.txt', 'subfolder\\document.md'],
    invalid: ['C:', 'C:\\con', 'C:\\prn', 'C:\\aux'],
  },
  unix: {
    absolute: ['/home/test/file.txt', '/usr/local/bin/script'],
    relative: ['../parent/file.txt', 'subfolder/document.md'],
    invalid: ['/dev/null/../file', ''],
  },
};

/**
 * Get platform-appropriate test paths
 */
export function getTestPaths(): typeof PLATFORM_TEST_PATHS.windows | typeof PLATFORM_TEST_PATHS.unix {
  const platformInfo = getPlatformInfo();
  
  if (platformInfo.isWindows) {
    return PLATFORM_TEST_PATHS.windows;
  } else {
    return PLATFORM_TEST_PATHS.unix;
  }
}