/**
 * Tests for git integration utilities.
 *
 * @file Tests for git operations and repository management
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { GitUtils } from './git-utils.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

/** Normalise a resolved path to forward slashes so assertions hold on every platform */
const toPosix = (path: string): string => path.replace(/\\/g, '/');

/**
 * The repository root the mocked `rev-parse --show-toplevel` reports, as resolve() shapes it on the
 * current platform: '/test/repo' on unix, but drive-prefixed ('D:/test/repo') on Windows, which
 * resolves the mocked POSIX root against the current drive.
 */
const resolvedRoot = toPosix(resolve('/test/repo'));

describe('GitUtils', () => {
  let gitUtils: GitUtils;
  let mockExecSync: MockedFunction<typeof execSync>;

  beforeEach(() => {
    mockExecSync = vi.mocked(execSync);
    gitUtils = new GitUtils('/test/repo');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Repository Detection', () => {
    it('should detect git repository correctly', () => {
      mockExecSync.mockReturnValue('.git');

      const result = gitUtils.isGitRepository();

      expect(result).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith('git rev-parse --git-dir', {
        cwd: '/test/repo',
        encoding: 'utf8',
        stdio: 'pipe',
      });
    });

    it('should return false when not in git repository', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Not a git repository');
      });

      const result = gitUtils.isGitRepository();

      expect(result).toBe(false);
    });

    it('should get repository root directory', () => {
      mockExecSync.mockReturnValue('/test/repo\n');

      const result = gitUtils.getRepositoryRoot();

      expect(result).toBe('/test/repo');
      expect(mockExecSync).toHaveBeenCalledWith('git rev-parse --show-toplevel', {
        cwd: '/test/repo',
        encoding: 'utf8',
        stdio: 'pipe',
      });
    });

    it('should throw error when getting root of non-git directory', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Not a git repository');
      });

      expect(() => gitUtils.getRepositoryRoot()).toThrow('Not in a git repository');
    });
  });

  describe('Git Status Information', () => {
    it('should get current branch name', () => {
      mockExecSync.mockReturnValue('main\n');

      const result = gitUtils.getCurrentBranch();

      expect(result).toBe('main');
      expect(mockExecSync).toHaveBeenCalledWith('git branch --show-current', {
        cwd: '/test/repo',
        encoding: 'utf8',
        stdio: 'pipe',
      });
    });

    it('should fallback to commit hash for detached HEAD', () => {
      mockExecSync
        .mockReturnValueOnce('') // detached HEAD: --show-current prints nothing, exits 0
        .mockReturnValueOnce('abc123\n');

      const result = gitUtils.getCurrentBranch();

      expect(result).toBe('abc123');
      expect(mockExecSync).toHaveBeenCalledWith('git rev-parse --short HEAD', {
        cwd: '/test/repo',
        encoding: 'utf8',
        stdio: 'pipe',
      });
    });

    it('should get current commit hash', () => {
      mockExecSync.mockReturnValue('abc123def456\n');

      const result = gitUtils.getCurrentCommit();

      expect(result).toBe('abc123def456');
      expect(mockExecSync).toHaveBeenCalledWith('git rev-parse HEAD', {
        cwd: '/test/repo',
        encoding: 'utf8',
        stdio: 'pipe',
      });
    });

    it('should detect uncommitted changes', () => {
      mockExecSync.mockReturnValue('M  file1.md\n?? file2.md\n');

      const result = gitUtils.hasUncommittedChanges();

      expect(result).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith('git status --porcelain', {
        cwd: '/test/repo',
        encoding: 'utf8',
        stdio: 'pipe',
      });
    });

    it('should return false when no uncommitted changes', () => {
      mockExecSync.mockReturnValue('');

      const result = gitUtils.hasUncommittedChanges();

      expect(result).toBe(false);
    });

    it('should get complete status information', () => {
      mockExecSync
        .mockReturnValueOnce('/test/repo\n') // rev-parse --show-toplevel
        .mockReturnValueOnce('main\n') // branch --show-current
        .mockReturnValueOnce('abc123\n') // rev-parse HEAD
        .mockReturnValueOnce(''); // status --porcelain

      const result = gitUtils.getStatus();

      expect(result).toEqual({
        branch: 'main',
        commit: 'abc123',
        isDirty: false,
        rootDir: '/test/repo',
      });
    });
  });

  describe('File Changes Detection', () => {
    it('should get changed files between references', () => {
      const diffOutput = 'M\tdocs/readme.md\nA\tdocs/new-file.md\nD\toldfile.md';
      mockExecSync
        .mockReturnValueOnce('/test/repo\n') // getRepositoryRoot
        .mockReturnValueOnce(diffOutput);

      const result = gitUtils.getChangedFiles('HEAD~1', 'HEAD');

      expect(result).toHaveLength(3);
      const [first, second, third] = result;
      expect(toPosix(first?.path ?? '')).toBe(`${resolvedRoot}/docs/readme.md`);
      expect(first?.status).toBe('modified');
      expect(toPosix(second?.path ?? '')).toBe(`${resolvedRoot}/docs/new-file.md`);
      expect(second?.status).toBe('added');
      expect(toPosix(third?.path ?? '')).toBe(`${resolvedRoot}/oldfile.md`);
      expect(third?.status).toBe('deleted');

      expect(mockExecSync).toHaveBeenCalledWith('git diff --name-status HEAD~1..HEAD', {
        cwd: '/test/repo',
        encoding: 'utf8',
        stdio: 'pipe',
      });
    });

    it('should handle renamed files', () => {
      const diffOutput = 'R100\told-name.md\tnew-name.md';
      mockExecSync.mockReturnValueOnce('/test/repo\n').mockReturnValueOnce(diffOutput);

      const result = gitUtils.getChangedFiles('HEAD~1');

      expect(result).toHaveLength(1);
      const [rename] = result;
      expect(toPosix(rename?.path ?? '')).toBe(`${resolvedRoot}/new-name.md`);
      expect(rename?.status).toBe('renamed');
      expect(toPosix(rename?.previousPath ?? '')).toBe(`${resolvedRoot}/old-name.md`);
    });

    it('should get staged files', () => {
      const stagedOutput = 'M\tstaged-file.md\nA\tnew-staged.md';
      mockExecSync.mockReturnValueOnce('/test/repo\n').mockReturnValueOnce(stagedOutput);

      const result = gitUtils.getStagedFiles();

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('modified');
      expect(result[1].status).toBe('added');

      expect(mockExecSync).toHaveBeenCalledWith('git diff --cached --name-status', {
        cwd: '/test/repo',
        encoding: 'utf8',
        stdio: 'pipe',
      });
    });

    it('should get unstaged files', () => {
      const unstagedOutput = 'M\tunstaged-file.md';
      mockExecSync.mockReturnValueOnce('/test/repo\n').mockReturnValueOnce(unstagedOutput);

      const result = gitUtils.getUnstagedFiles();

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('modified');

      expect(mockExecSync).toHaveBeenCalledWith('git diff --name-status', {
        cwd: '/test/repo',
        encoding: 'utf8',
        stdio: 'pipe',
      });
    });

    it('should handle empty diff output', () => {
      mockExecSync.mockReturnValueOnce('/test/repo\n').mockReturnValueOnce('');

      const result = gitUtils.getChangedFiles('HEAD~1');

      expect(result).toHaveLength(0);
    });
  });

  describe('Tracked Files', () => {
    it('should get all tracked files', () => {
      const lsFilesOutput = 'README.md\ndocs/guide.md\nsrc/main.ts';
      mockExecSync.mockReturnValueOnce('/test/repo\n').mockReturnValueOnce(lsFilesOutput);

      const result = gitUtils.getTrackedFiles();

      expect(result).toHaveLength(3);
      expect(toPosix(result[0] ?? '')).toBe(`${resolvedRoot}/README.md`);
      expect(toPosix(result[1] ?? '')).toBe(`${resolvedRoot}/docs/guide.md`);
      expect(toPosix(result[2] ?? '')).toBe(`${resolvedRoot}/src/main.ts`);

      expect(mockExecSync).toHaveBeenCalledWith('git ls-files', {
        cwd: '/test/repo',
        encoding: 'utf8',
        stdio: 'pipe',
      });
    });

    it('should get tracked files with pattern', () => {
      const lsFilesOutput = 'docs/guide.md\ndocs/api.md';
      mockExecSync.mockReturnValueOnce('/test/repo\n').mockReturnValueOnce(lsFilesOutput);

      const result = gitUtils.getTrackedFiles('*.md');

      expect(result).toHaveLength(2);

      expect(mockExecSync).toHaveBeenCalledWith('git ls-files *.md', {
        cwd: '/test/repo',
        encoding: 'utf8',
        stdio: 'pipe',
      });
    });
  });

  describe('Reference Operations', () => {
    it('should check if reference exists', () => {
      mockExecSync.mockReturnValue('abc123\n');

      const result = gitUtils.refExists('main');

      expect(result).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith('git rev-parse --verify main', {
        cwd: '/test/repo',
        encoding: 'utf8',
        stdio: 'pipe',
      });
    });

    it('should return false for non-existent reference', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('bad revision');
      });

      const result = gitUtils.refExists('nonexistent');

      expect(result).toBe(false);
    });

    it('should get merge base', () => {
      mockExecSync.mockReturnValue('abc123def\n');

      const result = gitUtils.getMergeBase('main', 'feature');

      expect(result).toBe('abc123def');
      expect(mockExecSync).toHaveBeenCalledWith('git merge-base main feature', {
        cwd: '/test/repo',
        encoding: 'utf8',
        stdio: 'pipe',
      });
    });
  });

  describe('Combined Operations', () => {
    it('should get all modified files including staged, unstaged, and committed', () => {
      mockExecSync
        .mockReturnValueOnce('/test/repo\n') // getRepositoryRoot (cached across the three calls)
        .mockReturnValueOnce('M\tstaged.md') // getStagedFiles
        .mockReturnValueOnce('M\tunstaged.md') // getUnstagedFiles
        .mockReturnValueOnce('M\tcommitted.md'); // getChangedFiles

      const result = gitUtils.getAllModifiedFiles('HEAD~1');

      expect(result).toHaveLength(3);
      expect(result.some((f) => f.path.endsWith('staged.md'))).toBe(true);
      expect(result.some((f) => f.path.endsWith('unstaged.md'))).toBe(true);
      expect(result.some((f) => f.path.endsWith('committed.md'))).toBe(true);
    });

    it('should deduplicate files in getAllModifiedFiles', () => {
      mockExecSync
        .mockReturnValueOnce('/test/repo\n') // getRepositoryRoot (cached across the three calls)
        .mockReturnValueOnce('M\tsame-file.md') // staged
        .mockReturnValueOnce('M\tsame-file.md') // unstaged
        .mockReturnValueOnce('M\tsame-file.md'); // committed

      const result = gitUtils.getAllModifiedFiles('HEAD~1');

      expect(result).toHaveLength(1);
      expect(toPosix(result[0]?.path ?? '')).toBe(`${resolvedRoot}/same-file.md`);
    });
  });

  describe('Error Handling', () => {
    it('should provide helpful error messages for git command failures', () => {
      mockExecSync.mockImplementation(() => {
        const error = new Error('Command failed') as Error & { stderr: string };
        error.stderr = 'fatal: not a git repository';
        throw error;
      });

      expect(() => gitUtils.getCurrentBranch()).toThrow(
        'Git command failed: git branch --show-current'
      );
    });

    it('should handle non-Error exceptions', () => {
      mockExecSync.mockImplementation(() => {
        const nonErrorValue: unknown = 'String error';
        throw nonErrorValue;
      });

      expect(() => gitUtils.getCurrentBranch()).toThrow('String error');
    });
  });
});
