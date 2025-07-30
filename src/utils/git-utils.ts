/**
 * Git integration utilities for incremental validation.
 *
 * @fileoverview Provides git operations for detecting changed files and managing validation caching
 * @category Utils
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Information about a file change in git.
 *
 * @category Utils
 */
export interface GitFileChange {
  /** Path to the changed file */
  path: string;
  /** Type of change */
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
  /** Previous path if renamed */
  previousPath?: string;
}

/**
 * Git repository information and status.
 *
 * @category Utils
 */
export interface GitStatus {
  /** Current branch name */
  branch: string;
  /** Current commit hash */
  commit: string;
  /** Whether repository has uncommitted changes */
  isDirty: boolean;
  /** Root directory of the git repository */
  rootDir: string;
}

/**
 * Git integration utility class.
 *
 * Provides methods for detecting file changes, managing git state,
 * and integrating with validation workflows.
 *
 * @category Utils
 *
 * @example
 *   Basic usage
 *   ```typescript
 *   const git = new GitUtils();
 *   
 *   if (git.isGitRepository()) {
 *     const changes = git.getChangedFiles('HEAD~1');
 *     console.log(`Found ${changes.length} changed files`);
 *   }
 *   ```
 *
 * @example
 *   Pre-commit validation
 *   ```typescript
 *   const git = new GitUtils();
 *   const stagedFiles = git.getStagedFiles();
 *   const markdownFiles = stagedFiles.filter(f => f.path.endsWith('.md'));
 *   ```
 */
export class GitUtils {
  private rootDir: string | undefined;

  constructor(private cwd: string = process.cwd()) {}

  /**
   * Check if current directory is within a git repository.
   *
   * @returns True if in a git repository
   */
  isGitRepository(): boolean {
    try {
      this.execGit('rev-parse --git-dir');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get git repository root directory.
   *
   * @returns Absolute path to git root directory
   * @throws Error if not in a git repository
   */
  getRepositoryRoot(): string {
    if (this.rootDir) {
      return this.rootDir;
    }

    try {
      const output = this.execGit('rev-parse --show-toplevel');
      this.rootDir = output.trim();
      return this.rootDir;
    } catch (error) {
      throw new Error(`Not in a git repository: ${error}`);
    }
  }

  /**
   * Get current git status information.
   *
   * @returns Git status information
   */
  getStatus(): GitStatus {
    const rootDir = this.getRepositoryRoot();
    const branch = this.getCurrentBranch();
    const commit = this.getCurrentCommit();
    const isDirty = this.hasUncommittedChanges();

    return {
      branch,
      commit,
      isDirty,
      rootDir,
    };
  }

  /**
   * Get current branch name.
   *
   * @returns Current branch name
   */
  getCurrentBranch(): string {
    try {
      return this.execGit('branch --show-current').trim();
    } catch {
      // Fallback for detached HEAD
      return this.execGit('rev-parse --short HEAD').trim();
    }
  }

  /**
   * Get current commit hash.
   *
   * @returns Current commit hash (full)
   */
  getCurrentCommit(): string {
    return this.execGit('rev-parse HEAD').trim();
  }

  /**
   * Check if repository has uncommitted changes.
   *
   * @returns True if there are uncommitted changes
   */
  hasUncommittedChanges(): boolean {
    try {
      const output = this.execGit('status --porcelain');
      return output.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get files changed between two git references.
   *
   * @param base - Base reference (commit, branch, tag)
   * @param head - Head reference (defaults to current HEAD)
   * @returns Array of changed files
   *
   * @example
   *   ```typescript
   *   // Files changed since last commit
   *   const changes = git.getChangedFiles('HEAD~1');
   *   
   *   // Files changed in current branch vs main
   *   const branchChanges = git.getChangedFiles('main', 'HEAD');
   *   ```
   */
  getChangedFiles(base: string, head: string = 'HEAD'): GitFileChange[] {
    try {
      const output = this.execGit(`diff --name-status ${base}..${head}`);
      return this.parseFileChanges(output);
    } catch (error) {
      throw new Error(`Failed to get changed files: ${error}`);
    }
  }

  /**
   * Get currently staged files.
   *
   * @returns Array of staged files
   */
  getStagedFiles(): GitFileChange[] {
    try {
      const output = this.execGit('diff --cached --name-status');
      return this.parseFileChanges(output);
    } catch (error) {
      throw new Error(`Failed to get staged files: ${error}`);
    }
  }

  /**
   * Get files changed in working directory (unstaged).
   *
   * @returns Array of unstaged changes
   */
  getUnstagedFiles(): GitFileChange[] {
    try {
      const output = this.execGit('diff --name-status');
      return this.parseFileChanges(output);
    } catch (error) {
      throw new Error(`Failed to get unstaged files: ${error}`);
    }
  }

  /**
   * Get list of all tracked files.
   *
   * @param pattern - Optional file pattern to filter
   * @returns Array of tracked file paths
   */
  getTrackedFiles(pattern?: string): string[] {
    try {
      const cmd = pattern ? `ls-files ${pattern}` : 'ls-files';
      const output = this.execGit(cmd);
      return output
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(path => resolve(this.getRepositoryRoot(), path));
    } catch (error) {
      throw new Error(`Failed to get tracked files: ${error}`);
    }
  }

  /**
   * Check if a specific commit exists.
   *
   * @param ref - Git reference to check
   * @returns True if reference exists
   */
  refExists(ref: string): boolean {
    try {
      this.execGit(`rev-parse --verify ${ref}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the merge base between two references.
   *
   * @param ref1 - First reference
   * @param ref2 - Second reference
   * @returns Merge base commit hash
   */
  getMergeBase(ref1: string, ref2: string): string {
    try {
      return this.execGit(`merge-base ${ref1} ${ref2}`).trim();
    } catch (error) {
      throw new Error(`Failed to get merge base: ${error}`);
    }
  }

  /**
   * Get files that have been modified since a specific commit.
   * Includes both staged and unstaged changes.
   *
   * @param since - Commit to compare against
   * @returns Array of all modified files
   */
  getAllModifiedFiles(since?: string): GitFileChange[] {
    const changes: GitFileChange[] = [];
    
    // Get staged changes
    changes.push(...this.getStagedFiles());
    
    // Get unstaged changes
    changes.push(...this.getUnstagedFiles());
    
    // Get committed changes since specified commit
    if (since) {
      changes.push(...this.getChangedFiles(since));
    }
    
    // Remove duplicates (prefer staged over unstaged over committed)
    const uniqueChanges = new Map<string, GitFileChange>();
    for (const change of changes.reverse()) {
      if (!uniqueChanges.has(change.path)) {
        uniqueChanges.set(change.path, change);
      }
    }
    
    return Array.from(uniqueChanges.values());
  }

  /**
   * Execute a git command and return output.
   *
   * @private
   */
  private execGit(command: string): string {
    try {
      return execSync(`git ${command}`, {
        cwd: this.cwd,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Git command failed: git ${command}\n${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Parse git diff output into file change objects.
   *
   * @private
   */
  private parseFileChanges(output: string): GitFileChange[] {
    if (!output.trim()) {
      return [];
    }

    return output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        const [status, ...pathParts] = line.split('\t');
        const path = pathParts.join('\t'); // Handle paths with tabs

        let changeStatus: GitFileChange['status'];
        let previousPath: string | undefined;

        switch (status.charAt(0)) {
          case 'A':
            changeStatus = 'added';
            break;
          case 'M':
            changeStatus = 'modified';
            break;
          case 'D':
            changeStatus = 'deleted';
            break;
          case 'R':
            changeStatus = 'renamed';
            // For renames, git shows "R<score>\toldpath\tnewpath"
            const paths = pathParts;
            if (paths.length >= 2) {
              previousPath = paths[0];
              return {
                path: resolve(this.getRepositoryRoot(), paths[1]),
                status: changeStatus,
                previousPath: resolve(this.getRepositoryRoot(), previousPath),
              };
            }
            break;
          case 'C':
            changeStatus = 'copied';
            break;
          default:
            changeStatus = 'modified';
        }

        return {
          path: resolve(this.getRepositoryRoot(), path),
          status: changeStatus,
          previousPath: previousPath ? resolve(this.getRepositoryRoot(), previousPath) : undefined,
        };
      });
  }
}

/**
 * Default git utilities instance.
 *
 * @category Utils
 */
export const gitUtils = new GitUtils();