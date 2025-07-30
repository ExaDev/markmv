/**
 * Tests for git integration utilities.
 *
 * @fileoverview Tests for git operations and repository management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { GitUtils } from './git-utils.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

describe('GitUtils', () => {
  let gitUtils: GitUtils;
  let mockExecSync: ReturnType<typeof vi.mocked>;

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
      mockExecSync.mockReturnValue(Buffer.from('.git'));

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
      mockExecSync.mockReturnValue(Buffer.from('/test/repo\n'));

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
      mockExecSync.mockReturnValue(Buffer.from('main\n'));

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
        .mockImplementationOnce(() => {
          throw new Error('Not on any branch');
        })
        .mockReturnValueOnce(Buffer.from('abc123\n'));

      const result = gitUtils.getCurrentBranch();

      expect(result).toBe('abc123');
      expect(mockExecSync).toHaveBeenCalledWith('git rev-parse --short HEAD', {
        cwd: '/test/repo',
        encoding: 'utf8',
        stdio: 'pipe',
      });
    });

    it('should get current commit hash', () => {
      mockExecSync.mockReturnValue(Buffer.from('abc123def456\n'));

      const result = gitUtils.getCurrentCommit();

      expect(result).toBe('abc123def456');
      expect(mockExecSync).toHaveBeenCalledWith('git rev-parse HEAD', {
        cwd: '/test/repo',
        encoding: 'utf8',
        stdio: 'pipe',
      });
    });

    it('should detect uncommitted changes', () => {
      mockExecSync.mockReturnValue(Buffer.from('M  file1.md\n?? file2.md\n'));

      const result = gitUtils.hasUncommittedChanges();

      expect(result).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith('git status --porcelain', {
        cwd: '/test/repo',
        encoding: 'utf8',
        stdio: 'pipe',
      });
    });

    it('should return false when no uncommitted changes', () => {
      mockExecSync.mockReturnValue(Buffer.from(''));

      const result = gitUtils.hasUncommittedChanges();

      expect(result).toBe(false);
    });

    it('should get complete status information', () => {
      mockExecSync
        .mockReturnValueOnce(Buffer.from('/test/repo\n'))  // rev-parse --show-toplevel
        .mockReturnValueOnce(Buffer.from('main\n'))        // branch --show-current
        .mockReturnValueOnce(Buffer.from('abc123\n'))      // rev-parse HEAD
        .mockReturnValueOnce(Buffer.from(''));             // status --porcelain

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
        .mockReturnValueOnce(Buffer.from('/test/repo\n'))  // getRepositoryRoot
        .mockReturnValueOnce(Buffer.from(diffOutput));

      const result = gitUtils.getChangedFiles('HEAD~1', 'HEAD');

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        path: '/test/repo/docs/readme.md',
        status: 'modified',
        previousPath: undefined,
      });
      expect(result[1]).toEqual({
        path: '/test/repo/docs/new-file.md',
        status: 'added',
        previousPath: undefined,
      });
      expect(result[2]).toEqual({
        path: '/test/repo/oldfile.md',
        status: 'deleted',
        previousPath: undefined,
      });

      expect(mockExecSync).toHaveBeenCalledWith('git diff --name-status HEAD~1..HEAD', {
        cwd: '/test/repo',
        encoding: 'utf8',
        stdio: 'pipe',
      });
    });

    it('should handle renamed files', () => {
      const diffOutput = 'R100\told-name.md\tnew-name.md';
      mockExecSync
        .mockReturnValueOnce(Buffer.from('/test/repo\n'))
        .mockReturnValueOnce(Buffer.from(diffOutput));

      const result = gitUtils.getChangedFiles('HEAD~1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        path: '/test/repo/new-name.md',
        status: 'renamed',
        previousPath: '/test/repo/old-name.md',
      });
    });

    it('should get staged files', () => {
      const stagedOutput = 'M\tstaged-file.md\nA\tnew-staged.md';
      mockExecSync
        .mockReturnValueOnce(Buffer.from('/test/repo\n'))
        .mockReturnValueOnce(Buffer.from(stagedOutput));

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
      mockExecSync
        .mockReturnValueOnce(Buffer.from('/test/repo\n'))
        .mockReturnValueOnce(Buffer.from(unstagedOutput));

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
      mockExecSync
        .mockReturnValueOnce(Buffer.from('/test/repo\n'))
        .mockReturnValueOnce(Buffer.from(''));

      const result = gitUtils.getChangedFiles('HEAD~1');

      expect(result).toHaveLength(0);
    });
  });

  describe('Tracked Files', () => {
    it('should get all tracked files', () => {
      const lsFilesOutput = 'README.md\ndocs/guide.md\nsrc/main.ts';
      mockExecSync
        .mockReturnValueOnce(Buffer.from('/test/repo\n'))
        .mockReturnValueOnce(Buffer.from(lsFilesOutput));

      const result = gitUtils.getTrackedFiles();

      expect(result).toHaveLength(3);
      expect(result[0]).toBe('/test/repo/README.md');
      expect(result[1]).toBe('/test/repo/docs/guide.md');
      expect(result[2]).toBe('/test/repo/src/main.ts');

      expect(mockExecSync).toHaveBeenCalledWith('git ls-files', {
        cwd: '/test/repo',
        encoding: 'utf8',
        stdio: 'pipe',
      });
    });

    it('should get tracked files with pattern', () => {
      const lsFilesOutput = 'docs/guide.md\ndocs/api.md';
      mockExecSync
        .mockReturnValueOnce(Buffer.from('/test/repo\n'))
        .mockReturnValueOnce(Buffer.from(lsFilesOutput));

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
      mockExecSync.mockReturnValue(Buffer.from('abc123\n'));

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
      mockExecSync.mockReturnValue(Buffer.from('abc123def\n'));

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
        .mockReturnValueOnce(Buffer.from('/test/repo\n'))  // getRepositoryRoot for staged
        .mockReturnValueOnce(Buffer.from('M\tstaged.md'))  // getStagedFiles
        .mockReturnValueOnce(Buffer.from('/test/repo\n'))  // getRepositoryRoot for unstaged
        .mockReturnValueOnce(Buffer.from('M\tunstaged.md')) // getUnstagedFiles
        .mockReturnValueOnce(Buffer.from('/test/repo\n'))  // getRepositoryRoot for since
        .mockReturnValueOnce(Buffer.from('M\tcommitted.md')); // getChangedFiles

      const result = gitUtils.getAllModifiedFiles('HEAD~1');

      expect(result).toHaveLength(3);
      expect(result.some(f => f.path.endsWith('staged.md'))).toBe(true);
      expect(result.some(f => f.path.endsWith('unstaged.md'))).toBe(true);
      expect(result.some(f => f.path.endsWith('committed.md'))).toBe(true);
    });

    it('should deduplicate files in getAllModifiedFiles', () => {
      mockExecSync
        .mockReturnValueOnce(Buffer.from('/test/repo\n'))
        .mockReturnValueOnce(Buffer.from('M\tsame-file.md'))  // staged
        .mockReturnValueOnce(Buffer.from('/test/repo\n'))
        .mockReturnValueOnce(Buffer.from('M\tsame-file.md'))  // unstaged
        .mockReturnValueOnce(Buffer.from('/test/repo\n'))
        .mockReturnValueOnce(Buffer.from('M\tsame-file.md')); // committed

      const result = gitUtils.getAllModifiedFiles('HEAD~1');

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('/test/repo/same-file.md');
    });
  });

  describe('Error Handling', () => {
    it('should provide helpful error messages for git command failures', () => {
      mockExecSync.mockImplementation(() => {
        const error = new Error('Command failed') as any;
        error.stderr = Buffer.from('fatal: not a git repository');
        throw error;
      });

      expect(() => gitUtils.getCurrentBranch()).toThrow('Git command failed: git branch --show-current');
    });

    it('should handle non-Error exceptions', () => {
      mockExecSync.mockImplementation(() => {
        throw 'String error';
      });

      expect(() => gitUtils.getCurrentBranch()).toThrow('String error');
    });
  });
});