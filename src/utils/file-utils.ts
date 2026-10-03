import { constants } from "node:fs";
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
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { PathUtils } from "./path-utils.js";

/**
 * File system statistics and metadata.
 *
 * Provides comprehensive information about a file or directory including size, type, and timestamp
 * information.
 * @category Utilities
 */
export interface FileStats {
  /** The path the statistics were read for, exactly as passed to `getStats`. */
  path: string;
  /** Size in bytes. */
  size: number;
  /** Whether the path is a regular file. */
  isFile: boolean;
  /** Whether the path is a directory. */
  isDirectory: boolean;
  /** Time of last modification (`mtime`). */
  modified: Date;
  /** Creation (birth) time, as reported by the file system. */
  created: Date;
}

/**
 * Configuration options for file copy operations.
 *
 * Controls behavior during file copying including overwrite handling, timestamp preservation, and
 * directory creation.
 * @category Utilities
 */
export interface FileCopyOptions {
  /** Replace an existing destination file. When false (the default), copying onto an existing file throws. */
  overwrite?: boolean;
  /**
   * Set the destination's access and modification times to those of the source after copying.
   * @defaultValue false
   */
  preserveTimestamps?: boolean;
  /**
   * Create missing parent directories of the destination first.
   * @defaultValue true
   */
  createDirectories?: boolean;
}

/**
 * Configuration options for file move operations.
 *
 * Extends copy options with move-specific features like backup creation. Move operations are
 * typically implemented as copy-then-delete.
 * @category Utilities
 */
export interface FileMoveOptions extends FileCopyOptions {
  /**
   * When overwriting an existing destination, first copy it to the same path with a `.backup` suffix. Has no effect unless `overwrite` is also set.
   * @defaultValue false
   */
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

/** Whether the thrown value is an object carrying the given Node.js error code. */
function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

/** Ensure directory exists, creating it if necessary */
async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Ignore error if directory already exists
    if (!hasErrorCode(error, "EEXIST")) {
      throw error;
    }
  }
}

/** Safely read a file with encoding detection */
async function readTextFile(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);

  // Simple encoding detection - assume UTF-8 for now Could be enhanced with proper encoding detection library
  return buffer.toString("utf-8");
}

/** Safely write a file with directory creation */
async function writeTextFile(
  filePath: string,
  content: string,
  options: Readonly<{
    /**
     * Create missing parent directories of the file first.
     * @defaultValue false
     */
    createDirectories?: boolean;
  }> = {},
): Promise<void> {
  if (options.createDirectories === true) {
    await ensureDirectory(dirname(filePath));
  }

  await writeFile(filePath, content, "utf-8");
}

/** Copy a file with options */
async function copyFile(
  sourcePath: string,
  destinationPath: string,
  options: Readonly<FileCopyOptions> = {},
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
  if (options.preserveTimestamps === true) {
    const sourceStats = await stat(sourcePath);
    const { utimes } = await import("node:fs/promises");
    await utimes(destinationPath, sourceStats.atime, sourceStats.mtime);
  }
}

/** Move a file with options */
async function moveFile(
  sourcePath: string,
  destinationPath: string,
  options: Readonly<FileMoveOptions> = {},
): Promise<void> {
  const {
    overwrite = false,
    createDirectories = true,
    backup = false,
  } = options;

  // Validate paths
  const sourceValidation = PathUtils.validatePath(sourcePath);
  if (!sourceValidation.valid) {
    throw new Error(`Invalid source path: ${String(sourceValidation.reason)}`);
  }

  const destValidation = PathUtils.validatePath(destinationPath);
  if (!destValidation.valid) {
    throw new Error(
      `Invalid destination path: ${String(destValidation.reason)}`,
    );
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
    if (hasErrorCode(error, "EXDEV")) {
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
    /**
     * Descend into subdirectories.
     * @defaultValue false
     */
    recursive?: boolean;
    /** Only include files whose lower-cased extension, with its leading dot (for example `.md`), is in this list. Files of every extension are included when omitted. */
    extensions?: string[];
    /**
     * Also include directory paths in the result.
     * @defaultValue false
     */
    includeDirectories?: boolean;
  } = {},
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
        if (extensions !== undefined) {
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
async function findMarkdownFiles(
  dirPath: string,
  recursive = true,
): Promise<string[]> {
  return listFiles(dirPath, {
    recursive,
    extensions: [".md", ".markdown", ".mdown", ".mkd", ".mdx"],
  });
}

/** Create a backup of a file */
async function createBackup(
  filePath: string,
  suffix = ".backup",
): Promise<string> {
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
    const [content1, content2] = await Promise.all([
      readTextFile(path1),
      readTextFile(path2),
    ]);

    return content1 === content2;
  } catch {
    return false;
  }
}

/** Generate a safe filename by removing invalid characters */
function sanitizeFilename(filename: string): string {
  // Remove or replace invalid characters
  return filename
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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
 * @category Utilities
 * @example
 * ```typescript
 * // Check if file exists
 * const exists = await FileUtils.exists('document.md');
 *
 * // Read file content
 * const content = await FileUtils.readTextFile('document.md');
 *
 * // Write new content
 * await FileUtils.writeTextFile('output.md', content, { createDirectories: true });
 *
 * // Find markdown files
 * const files = await FileUtils.findMarkdownFiles('./docs', true);
 * ```
 */
export const FileUtils = {
  /** Resolves to true when the path exists, and false when it does not or cannot be accessed. */
  exists,
  /** Resolves to true when the current process has read permission on the path, and false when it lacks it or the path does not exist. */
  isReadable,
  /** Resolves to true when the current process has write permission on the path, and false when it lacks it or the path does not exist. */
  isWritable,
  /** Reads the size, type and timestamps of a path into a `FileStats`. Rejects when the path does not exist. */
  getStats,
  /** Creates a directory and any missing parents. Resolves without error when the directory already exists. */
  ensureDirectory,
  /** Reads a whole file and decodes it as UTF-8. No other encoding is detected. */
  readTextFile,
  /** Writes a string to a file as UTF-8, replacing any existing content. Optionally creates the parent directories first. */
  writeTextFile,
  /** Copies a file. Throws when the destination exists unless `overwrite` is set, creates the destination's parent directories by default, and can preserve the source timestamps. */
  copyFile,
  /** Moves a file after validating both paths and checking the source exists. Throws when the destination exists unless `overwrite` is set, optionally backing the old destination up first. Renames in place, falling back to copy and delete when the move crosses file systems. */
  moveFile,
  /** Deletes a file. Resolves without error when the path does not exist. */
  deleteFile,
  /** Lists the files in a directory as joined paths, optionally recursing, filtering by extension and including directories. */
  listFiles,
  /** Lists the markdown files (extensions `.md`, `.markdown`, `.mdown`, `.mkd` and `.mdx`) in a directory, recursing into subdirectories unless `recursive` is false. */
  findMarkdownFiles,
  /** Copies a file to its own path plus a suffix (`.backup` by default) and resolves to the backup's path. Throws when that backup already exists. */
  createBackup,
  /** Resolves to the size of a file in bytes. */
  getFileSize,
  /** Resolves to true when both files decode to identical text, and false when they differ or either cannot be read. */
  filesEqual,
  /** Replaces characters that are invalid in file names (`<>:"/\|?*`) and whitespace with hyphens, collapses repeated hyphens and trims hyphens from both ends. */
  sanitizeFilename,
  /** Computes the path to `toFile` relative to the directory containing `fromFile`, as used for a link written inside `fromFile`. */
  getRelativePath,
};
