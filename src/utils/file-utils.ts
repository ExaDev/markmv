import { constants } from 'node:fs';
import {
  access,
  copyFile as fsCopyFile,
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

/** Check if a file or directory exists */
async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Check if a path is readable */
async function isReadable(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/** Check if a path is writable */
async function isWritable(path: string): Promise<boolean> {
  try {
    await access(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** Get file statistics */
async function getStats(path: string): Promise<FileStats> {
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
async function ensureDirectory(dirPath: string): Promise<void> {
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
async function readTextFile(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);

  // Simple encoding detection - assume UTF-8 for now Could be enhanced with proper encoding detection library
  return buffer.toString('utf-8');
}

/** Safely write a file with directory creation */
async function writeTextFile(
  filePath: string,
  content: string,
  options: { createDirectories?: boolean } = {}
): Promise<void> {
  if (options.createDirectories) {
    await ensureDirectory(dirname(filePath));
  }

  await writeFile(filePath, content, 'utf-8');
}

/** Copy a file with options */
async function copyFile(
  sourcePath: string,
  destinationPath: string,
  options: CopyOptions = {}
): Promise<void> {
  const { overwrite = false, createDirectories = true } = options;

  // Check if destination exists
  if (!overwrite && (await exists(destinationPath))) {
    throw new Error(`Destination file already exists: ${destinationPath}`);
  }

  // Create destination directory if needed
  if (createDirectories) {
    await ensureDirectory(dirname(destinationPath));
  }

  // Copy the file
  await fsCopyFile(sourcePath, destinationPath);

  // TODO: Preserve timestamps if requested
  if (options.preserveTimestamps) {
    const sourceStats = await stat(sourcePath);
    const { utimes } = await import('node:fs/promises');
    await utimes(destinationPath, sourceStats.atime, sourceStats.mtime);
  }
}

/** Move a file with options */
async function moveFile(
  sourcePath: string,
  destinationPath: string,
  options: MoveOptions = {}
): Promise<void> {
  const { overwrite = false, createDirectories = true, backup = false } = options;

  // Validate paths
  const sourceValidation = PathUtils.validatePath(sourcePath);
  if (!sourceValidation.valid) {
    throw new Error(`Invalid source path: ${String(sourceValidation.reason)}`);
  }

  const destValidation = PathUtils.validatePath(destinationPath);
  if (!destValidation.valid) {
    throw new Error(`Invalid destination path: ${String(destValidation.reason)}`);
  }

  // Check if source exists
  if (!(await exists(sourcePath))) {
    throw new Error(`Source file does not exist: ${sourcePath}`);
  }

  // Handle destination conflicts
  if (await exists(destinationPath)) {
    if (!overwrite) {
      throw new Error(`Destination file already exists: ${destinationPath}`);
    }

    if (backup) {
      const backupPath = `${destinationPath}.backup`;
      await copyFile(destinationPath, backupPath);
    }
  }

  // Create destination directory if needed
  if (createDirectories) {
    await ensureDirectory(dirname(destinationPath));
  }

  // Try atomic rename first (works if on same filesystem)
  try {
    await rename(sourcePath, destinationPath);
  } catch (error) {
    // If rename fails, fall back to copy + delete
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EXDEV') {
      await copyFile(sourcePath, destinationPath, { overwrite: true });
      await unlink(sourcePath);
    } else {
      throw error;
    }
  }
}

/** Delete a file safely */
async function deleteFile(filePath: string): Promise<void> {
  if (await exists(filePath)) {
    await unlink(filePath);
  }
}

/** List files in a directory with filtering */
async function listFiles(
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
      const stats = await getStats(fullPath);

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
async function findMarkdownFiles(dirPath: string, recursive = true): Promise<string[]> {
  return listFiles(dirPath, {
    recursive,
    extensions: ['.md', '.markdown', '.mdown', '.mkd', '.mdx'],
  });
}

/** Create a backup of a file */
async function createBackup(filePath: string, suffix = '.backup'): Promise<string> {
  const backupPath = `${filePath}${suffix}`;
  await copyFile(filePath, backupPath);
  return backupPath;
}

/** Get file size in bytes */
async function getFileSize(filePath: string): Promise<number> {
  const stats = await getStats(filePath);
  return stats.size;
}

/** Check if two files have the same content */
async function filesEqual(path1: string, path2: string): Promise<boolean> {
  try {
    const [content1, content2] = await Promise.all([readTextFile(path1), readTextFile(path2)]);
    return content1 === content2;
  } catch {
    return false;
  }
}

/** Generate a safe filename by removing invalid characters */
function sanitizeFilename(filename: string): string {
  // Remove or replace invalid characters
  return filename
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Get relative path between two files */
function getRelativePath(fromFile: string, toFile: string): string {
  return PathUtils.makeRelative(toFile, dirname(fromFile));
}

/**
 * Utility namespace for common file system operations.
 *
 * Provides a comprehensive set of functions for file and directory manipulation, with proper error
 * handling and cross-platform compatibility. All methods are async and use Node.js promises-based
 * file system APIs.
 *
 * @category Utilities
 *
 * @example
 *   Basic file operations ```typescript // Check if file exists const exists = await FileUtils.exists('document.md');
 *
 *   // Read file content const content = await FileUtils.readTextFile('document.md');
 *
 *   // Write new content await FileUtils.writeTextFile('output.md', content, { createDirectories: true });
 *
 *   // Find markdown files const files = await FileUtils.findMarkdownFiles('./docs', true); ```
 */
export const FileUtils = {
  exists,
  isReadable,
  isWritable,
  getStats,
  ensureDirectory,
  readTextFile,
  writeTextFile,
  copyFile,
  moveFile,
  deleteFile,
  listFiles,
  findMarkdownFiles,
  createBackup,
  getFileSize,
  filesEqual,
  sanitizeFilename,
  getRelativePath,
};
