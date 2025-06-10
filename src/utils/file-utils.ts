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

export interface FileStats {
  path: string;
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  modified: Date;
  created: Date;
}

export interface CopyOptions {
  overwrite?: boolean;
  preserveTimestamps?: boolean;
  createDirectories?: boolean;
}

export interface MoveOptions extends CopyOptions {
  backup?: boolean;
}

export class FileUtils {
  /**
   * Check if a file or directory exists
   */
  static async exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a path is readable
   */
  static async isReadable(path: string): Promise<boolean> {
    try {
      await access(path, constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a path is writable
   */
  static async isWritable(path: string): Promise<boolean> {
    try {
      await access(path, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file statistics
   */
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

  /**
   * Ensure directory exists, creating it if necessary
   */
  static async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await mkdir(dirPath, { recursive: true });
    } catch (error) {
      // Ignore error if directory already exists
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Safely read a file with encoding detection
   */
  static async readTextFile(filePath: string): Promise<string> {
    const buffer = await readFile(filePath);

    // Simple encoding detection - assume UTF-8 for now
    // Could be enhanced with proper encoding detection library
    return buffer.toString('utf-8');
  }

  /**
   * Safely write a file with directory creation
   */
  static async writeTextFile(
    filePath: string,
    content: string,
    options: { createDirectories?: boolean } = {}
  ): Promise<void> {
    if (options.createDirectories) {
      await this.ensureDirectory(dirname(filePath));
    }

    await writeFile(filePath, content, 'utf-8');
  }

  /**
   * Copy a file with options
   */
  static async copyFile(
    sourcePath: string,
    destinationPath: string,
    options: CopyOptions = {}
  ): Promise<void> {
    const { overwrite = false, createDirectories = true } = options;

    // Check if destination exists
    if (!overwrite && (await this.exists(destinationPath))) {
      throw new Error(`Destination file already exists: ${destinationPath}`);
    }

    // Create destination directory if needed
    if (createDirectories) {
      await this.ensureDirectory(dirname(destinationPath));
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

  /**
   * Move a file with options
   */
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
    if (!(await this.exists(sourcePath))) {
      throw new Error(`Source file does not exist: ${sourcePath}`);
    }

    // Handle destination conflicts
    if (await this.exists(destinationPath)) {
      if (!overwrite) {
        throw new Error(`Destination file already exists: ${destinationPath}`);
      }

      if (backup) {
        const backupPath = `${destinationPath}.backup`;
        await this.copyFile(destinationPath, backupPath);
      }
    }

    // Create destination directory if needed
    if (createDirectories) {
      await this.ensureDirectory(dirname(destinationPath));
    }

    // Try atomic rename first (works if on same filesystem)
    try {
      await rename(sourcePath, destinationPath);
    } catch (error) {
      // If rename fails, fall back to copy + delete
      if ((error as NodeJS.ErrnoException).code === 'EXDEV') {
        await this.copyFile(sourcePath, destinationPath, { overwrite: true });
        await unlink(sourcePath);
      } else {
        throw error;
      }
    }
  }

  /**
   * Delete a file safely
   */
  static async deleteFile(filePath: string): Promise<void> {
    if (await this.exists(filePath)) {
      await unlink(filePath);
    }
  }

  /**
   * List files in a directory with filtering
   */
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
        const stats = await this.getStats(fullPath);

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

  /**
   * Find markdown files in a directory
   */
  static async findMarkdownFiles(dirPath: string, recursive = true): Promise<string[]> {
    return this.listFiles(dirPath, {
      recursive,
      extensions: ['.md', '.markdown', '.mdown', '.mkd', '.mdx'],
    });
  }

  /**
   * Create a backup of a file
   */
  static async createBackup(filePath: string, suffix = '.backup'): Promise<string> {
    const backupPath = `${filePath}${suffix}`;
    await this.copyFile(filePath, backupPath);
    return backupPath;
  }

  /**
   * Get file size in bytes
   */
  static async getFileSize(filePath: string): Promise<number> {
    const stats = await this.getStats(filePath);
    return stats.size;
  }

  /**
   * Check if two files have the same content
   */
  static async filesEqual(path1: string, path2: string): Promise<boolean> {
    try {
      const [content1, content2] = await Promise.all([
        this.readTextFile(path1),
        this.readTextFile(path2),
      ]);
      return content1 === content2;
    } catch {
      return false;
    }
  }

  /**
   * Generate a safe filename by removing invalid characters
   */
  static sanitizeFilename(filename: string): string {
    // Remove or replace invalid characters
    return filename
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Get relative path between two files
   */
  static getRelativePath(fromFile: string, toFile: string): string {
    return PathUtils.makeRelative(toFile, dirname(fromFile));
  }
}
