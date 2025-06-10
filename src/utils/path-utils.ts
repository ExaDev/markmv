import { resolve, relative, dirname, basename, extname, isAbsolute, join, sep } from 'node:path';
import { homedir } from 'node:os';

export class PathUtils {
  /**
   * Resolve a path that may be relative, absolute, or use home directory notation
   */
  static resolvePath(path: string, basePath?: string): string {
    if (path.startsWith('~/')) {
      return resolve(join(homedir(), path.slice(2)));
    }
    
    if (isAbsolute(path)) {
      return resolve(path);
    }
    
    if (basePath) {
      return resolve(join(basePath, path));
    }
    
    return resolve(path);
  }

  /**
   * Convert an absolute path back to a relative path from a base directory
   */
  static makeRelative(absolutePath: string, fromDir: string): string {
    return relative(fromDir, absolutePath);
  }

  /**
   * Update a relative path when a file is moved
   */
  static updateRelativePath(
    originalLinkPath: string, 
    sourceFilePath: string, 
    newSourceFilePath: string
  ): string {
    // If it's not a relative path, return as-is
    if (isAbsolute(originalLinkPath) || originalLinkPath.startsWith('~/')) {
      return originalLinkPath;
    }

    // Resolve the original target
    const sourceDir = dirname(sourceFilePath);
    const targetPath = this.resolvePath(originalLinkPath, sourceDir);
    
    // Create new relative path from new location
    const newSourceDir = dirname(newSourceFilePath);
    return this.makeRelative(targetPath, newSourceDir);
  }

  /**
   * Update a Claude import path when a file is moved
   */
  static updateClaudeImportPath(
    originalImportPath: string,
    sourceFilePath: string,
    newSourceFilePath: string
  ): string {
    // Handle absolute paths and home directory paths - they don't need updating
    if (isAbsolute(originalImportPath) || originalImportPath.startsWith('~/')) {
      return originalImportPath;
    }

    // For relative imports, update the path
    const sourceDir = dirname(sourceFilePath);
    const targetPath = this.resolvePath(originalImportPath, sourceDir);
    const newSourceDir = dirname(newSourceFilePath);
    
    return this.makeRelative(targetPath, newSourceDir);
  }

  /**
   * Normalize path separators for cross-platform compatibility
   */
  static normalizePath(path: string): string {
    return path.split(/[/\\]/).join(sep);
  }

  /**
   * Check if a path is within a given directory
   */
  static isWithinDirectory(filePath: string, directoryPath: string): boolean {
    const relativePath = relative(directoryPath, filePath);
    return !relativePath.startsWith('..') && !isAbsolute(relativePath);
  }

  /**
   * Generate a unique filename if a file already exists
   */
  static generateUniqueFilename(desiredPath: string): string {
    const dir = dirname(desiredPath);
    const name = basename(desiredPath, extname(desiredPath));
    const ext = extname(desiredPath);
    
    let counter = 1;
    let uniquePath = desiredPath;
    
    const fs = require('node:fs');
    while (fs.existsSync(uniquePath)) {
      uniquePath = join(dir, `${name}-${counter}${ext}`);
      counter++;
    }
    
    return uniquePath;
  }

  /**
   * Validate that a path is safe for file operations
   */
  static validatePath(path: string): { valid: boolean; reason?: string } {
    if (!path || path.trim() === '') {
      return { valid: false, reason: 'Path cannot be empty' };
    }

    if (path.includes('\0')) {
      return { valid: false, reason: 'Path cannot contain null bytes' };
    }

    // Check for dangerous path traversal patterns
    const normalized = resolve(path);
    if (path.includes('..') && !this.isWithinDirectory(normalized, process.cwd())) {
      return { valid: false, reason: 'Path traversal outside working directory is not allowed' };
    }

    return { valid: true };
  }

  /**
   * Extract directory depth from a path
   */
  static getDirectoryDepth(path: string): number {
    const normalized = resolve(path);
    return normalized.split(sep).filter(part => part !== '').length;
  }

  /**
   * Find common base directory for multiple paths
   */
  static findCommonBase(paths: string[]): string {
    if (paths.length === 0) return '';
    if (paths.length === 1) return dirname(paths[0]);

    const resolvedPaths = paths.map(p => resolve(p));
    const splitPaths = resolvedPaths.map(p => p.split(sep));
    
    let commonParts: string[] = [];
    const minLength = Math.min(...splitPaths.map(p => p.length));
    
    for (let i = 0; i < minLength; i++) {
      const part = splitPaths[0][i];
      if (splitPaths.every(splitPath => splitPath[i] === part)) {
        commonParts.push(part);
      } else {
        break;
      }
    }
    
    return commonParts.join(sep) || sep;
  }

  /**
   * Convert Windows paths to Unix-style for markdown links
   */
  static toUnixPath(path: string): string {
    return path.replace(/\\/g, '/');
  }

  /**
   * Get file extension with fallback handling
   */
  static getExtension(path: string): string {
    const ext = extname(path);
    return ext || '';
  }

  /**
   * Check if path represents a markdown file
   */
  static isMarkdownFile(path: string): boolean {
    const ext = this.getExtension(path).toLowerCase();
    return ['.md', '.markdown', '.mdown', '.mkd', '.mdx'].includes(ext);
  }

  /**
   * Safely join paths, handling edge cases
   */
  static safejoin(...parts: string[]): string {
    const filteredParts = parts.filter(part => part && part.trim() !== '');
    if (filteredParts.length === 0) return '';
    
    return resolve(join(...filteredParts));
  }
}