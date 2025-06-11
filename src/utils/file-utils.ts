import { constants } from 'node:fs';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PathUtils } from './path-utils.js';

/**
 * File system statistics and metadata.
 *
 * Provides comprehensive information about a file or directory including size, type, and timestamp
 * information.
 *
 * @category Utilities
 */
export interface FileStats {
  path: string;
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  modified: Date;
  created: Date;
}

/**
 * Configuration options for file copy operations.
 *
 * Controls behavior during file copying including overwrite handling, timestamp preservation, and
 * directory creation.
 *
 * @category Utilities
 */
export interface CopyOptions {
  overwrite?: boolean;
  preserveTimestamps?: boolean;
  createDirectories?: boolean;
}

/**
 * Configuration options for file move operations.
 *
 * Extends copy options with move-specific features like backup creation. Move operations are
 * typically implemented as copy-then-delete.
 *
 * @category Utilities
 */
export interface MoveOptions extends CopyOptions {
  backup?: boolean;
}

/**
 * Utility class for common file system operations.
 *
 * Provides a comprehensive set of static methods for file and directory manipulation, with proper
 * error handling and cross-platform compatibility. All methods are async and use Node.js
 * promises-based file system APIs.
 *
 * @category Utilities
 *
 * @example
 *   Basic file operations
 *   ```typescript
 *   // Check if file exists
 *   const exists = await FileUtils.exists('document.md');
 *
 *   // Read file content
 *   const content = await FileUtils.readTextFile('document.md');
 *
 *   // Write new content
 *   await FileUtils.writeTextFile('output.md', content, {
 *   createDirectories: true
 *   });
 *
 *   // Find markdown files
 *   const files = await FileUtils.findMarkdownFiles('./docs', true);
 *   ```
 */
export class FileUtils {
  /** Check if a file or directory exists */
  static async exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /** Check if a path is readable */
  static async isReadable(path: string): Promise<boolean> {
    try {
      await access(path, constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /** Check if a path is writable */
  static async isWritable(path: string): Promise<boolean> {
    try {
      await access(path, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  /** Get file statistics */
  static async getStats(path: string): Promise<FileStats> {
    const stats = await stat(path);
    return {
      path,
      size: stats.size,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      modified: stats.mtime,
      created: stats.birthtime,
    };
  }

  /** Ensure directory exists, creating it if necessary */
  static async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await mkdir(dirPath, { recursive: true });
    } catch (error) {
      // Ignore error if directory already exists
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) {
        throw error;
      }
    }
  }

  /** Safely read a file with encoding detection */
  static async readTextFile(filePath: string): Promise<string> {
    const buffer = await readFile(filePath);

    // Simple encoding detection - assume UTF-8 for now
    // Could be enhanced with proper encoding detection library
    return buffer.toString('utf-8');
  }

  /** Safely write a file with directory creation */
  static async writeTextFile(
    filePath: string,
    content: string,
    options: { createDirectories?: boolean } = {}
  ): Promise<void> {
    if (options.createDirectories) {
      await FileUtils.ensureDirectory(dirname(filePath));
    }

    await writeFile(filePath, content, 'utf-8');
  }

  /** Copy a file with options */
  static async copyFile(
    sourcePath: string,
    destinationPath: string,
    options: CopyOptions = {}
  ): Promise<void> {
    const { overwrite = false, createDirectories = true } = options;

    // Check if destination exists
    if (!overwrite && (await FileUtils.exists(destinationPath))) {
      throw new Error(`Destination file already exists: ${destinationPath}`);
    }

    // Create destination directory if needed
    if (createDirectories) {
      await FileUtils.ensureDirectory(dirname(destinationPath));
    }

    // Copy the file
    await copyFile(sourcePath, destinationPath);

    // TODO: Preserve timestamps if requested
    if (options.preserveTimestamps) {
      const sourceStats = await stat(sourcePath);
      const { utimes } = await import('node:fs/promises');
      await utimes(destinationPath, sourceStats.atime, sourceStats.mtime);
    }
  }

  /** Move a file with options */
  static async moveFile(
    sourcePath: string,
    destinationPath: string,
    options: MoveOptions = {}
  ): Promise<void> {
    const { overwrite = false, createDirectories = true, backup = false } = options;

    // Validate paths
    const sourceValidation = PathUtils.validatePath(sourcePath);
    if (!sourceValidation.valid) {
      throw new Error(`Invalid source path: ${sourceValidation.reason}`);
    }

    const destValidation = PathUtils.validatePath(destinationPath);
    if (!destValidation.valid) {
      throw new Error(`Invalid destination path: ${destValidation.reason}`);
    }

    // Check if source exists
    if (!(await FileUtils.exists(sourcePath))) {
      throw new Error(`Source file does not exist: ${sourcePath}`);
    }

    // Handle destination conflicts
    if (await FileUtils.exists(destinationPath)) {
      if (!overwrite) {
        throw new Error(`Destination file already exists: ${destinationPath}`);
      }

      if (backup) {
        const backupPath = `${destinationPath}.backup`;
        await FileUtils.copyFile(destinationPath, backupPath);
      }
    }

    // Create destination directory if needed
    if (createDirectories) {
      await FileUtils.ensureDirectory(dirname(destinationPath));
    }

    // Try atomic rename first (works if on same filesystem)
    try {
      await rename(sourcePath, destinationPath);
    } catch (error) {
      // If rename fails, fall back to copy + delete
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EXDEV') {
        await FileUtils.copyFile(sourcePath, destinationPath, { overwrite: true });
        await unlink(sourcePath);
      } else {
        throw error;
      }
    }
  }

  /** Delete a file safely */
  static async deleteFile(filePath: string): Promise<void> {
    if (await FileUtils.exists(filePath)) {
      await unlink(filePath);
    }
  }

  /** List files in a directory with filtering */
  static async listFiles(
    dirPath: string,
    options: {
      recursive?: boolean;
      extensions?: string[];
      includeDirectories?: boolean;
    } = {}
  ): Promise<string[]> {
    const { recursive = false, extensions, includeDirectories = false } = options;
    const files: string[] = [];

    const processDirectory = async (currentDir: string): Promise<void> => {
      const entries = await readdir(currentDir);

      for (const entry of entries) {
        const fullPath = join(currentDir, entry);
        const stats = await FileUtils.getStats(fullPath);

        if (stats.isDirectory) {
          if (includeDirectories) {
            files.push(fullPath);
          }
          if (recursive) {
            await processDirectory(fullPath);
          }
        } else if (stats.isFile) {
          // Filter by extensions if specified
          if (extensions) {
            const ext = PathUtils.getExtension(fullPath).toLowerCase();
            if (extensions.includes(ext)) {
              files.push(fullPath);
            }
          } else {
            files.push(fullPath);
          }
        }
      }
    };

    await processDirectory(dirPath);
    return files;
  }

  /** Find markdown files in a directory */
  static async findMarkdownFiles(dirPath: string, recursive = true): Promise<string[]> {
    return FileUtils.listFiles(dirPath, {
      recursive,
      extensions: ['.md', '.markdown', '.mdown', '.mkd', '.mdx'],
    });
  }

  /** Create a backup of a file */
  static async createBackup(filePath: string, suffix = '.backup'): Promise<string> {
    const backupPath = `${filePath}${suffix}`;
    await FileUtils.copyFile(filePath, backupPath);
    return backupPath;
  }

  /** Get file size in bytes */
  static async getFileSize(filePath: string): Promise<number> {
    const stats = await FileUtils.getStats(filePath);
    return stats.size;
  }

  /** Check if two files have the same content */
  static async filesEqual(path1: string, path2: string): Promise<boolean> {
    try {
      const [content1, content2] = await Promise.all([
        FileUtils.readTextFile(path1),
        FileUtils.readTextFile(path2),
      ]);
      return content1 === content2;
    } catch {
      return false;
    }
  }

  /** Generate a safe filename by removing invalid characters */
  static sanitizeFilename(filename: string): string {
    // Remove or replace invalid characters
    return filename
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /** Get relative path between two files */
  static getRelativePath(fromFile: string, toFile: string): string {
    return PathUtils.makeRelative(toFile, dirname(fromFile));
  }
}
