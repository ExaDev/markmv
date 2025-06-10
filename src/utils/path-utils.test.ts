import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PathUtils } from './path-utils.js';

describe('PathUtils', () => {
  describe('resolvePath', () => {
    it('should resolve absolute paths', () => {
      const result = PathUtils.resolvePath('/absolute/path');
      expect(result).toBe(resolve('/absolute/path'));
    });

    it('should resolve home directory paths', () => {
      const result = PathUtils.resolvePath('~/documents');
      expect(result).toBe(resolve(join(homedir(), 'documents')));
    });

    it('should resolve relative paths with base', () => {
      const result = PathUtils.resolvePath('./relative', '/base/dir');
      expect(result).toBe(resolve('/base/dir/relative'));
    });

    it('should resolve relative paths without base', () => {
      const result = PathUtils.resolvePath('./relative');
      expect(result).toBe(resolve('./relative'));
    });
  });

  describe('makeRelative', () => {
    it('should create relative path between directories', () => {
      const result = PathUtils.makeRelative('/project/docs/file.md', '/project');
      expect(result).toBe('docs/file.md');
    });

    it('should create relative path for sibling files', () => {
      const result = PathUtils.makeRelative('/project/target.md', '/project');
      expect(result).toBe('target.md');
    });
  });

  describe('updateRelativePath', () => {
    it('should update relative path when source moves', () => {
      const result = PathUtils.updateRelativePath(
        './target.md',
        '/project/docs/source.md',
        '/project/moved/source.md'
      );
      expect(result).toBe('../docs/target.md');
    });

    it('should not change absolute paths', () => {
      const result = PathUtils.updateRelativePath(
        '/absolute/target.md',
        '/project/docs/source.md',
        '/project/moved/source.md'
      );
      expect(result).toBe('/absolute/target.md');
    });

    it('should not change home directory paths', () => {
      const result = PathUtils.updateRelativePath(
        '~/target.md',
        '/project/docs/source.md',
        '/project/moved/source.md'
      );
      expect(result).toBe('~/target.md');
    });
  });

  describe('updateClaudeImportPath', () => {
    it('should update relative Claude import paths', () => {
      const result = PathUtils.updateClaudeImportPath(
        './config.md',
        '/project/docs/source.md',
        '/project/moved/source.md'
      );
      expect(result).toBe('../docs/config.md');
    });

    it('should preserve absolute Claude import paths', () => {
      const result = PathUtils.updateClaudeImportPath(
        '/global/config.md',
        '/project/docs/source.md',
        '/project/moved/source.md'
      );
      expect(result).toBe('/global/config.md');
    });
  });

  describe('validatePath', () => {
    it('should validate normal paths', () => {
      const result = PathUtils.validatePath('/valid/path/file.md');
      expect(result.valid).toBe(true);
    });

    it('should reject empty paths', () => {
      const result = PathUtils.validatePath('');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Path cannot be empty');
    });

    it('should reject paths with null bytes', () => {
      const result = PathUtils.validatePath('/path/with\0null');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Path cannot contain null bytes');
    });
  });

  describe('isMarkdownFile', () => {
    it('should identify markdown files', () => {
      expect(PathUtils.isMarkdownFile('file.md')).toBe(true);
      expect(PathUtils.isMarkdownFile('file.markdown')).toBe(true);
      expect(PathUtils.isMarkdownFile('file.mdx')).toBe(true);
    });

    it('should reject non-markdown files', () => {
      expect(PathUtils.isMarkdownFile('file.txt')).toBe(false);
      expect(PathUtils.isMarkdownFile('file.html')).toBe(false);
      expect(PathUtils.isMarkdownFile('file')).toBe(false);
    });
  });

  describe('findCommonBase', () => {
    it('should find common base directory', () => {
      const paths = ['/project/docs/file1.md', '/project/docs/file2.md', '/project/src/file3.md'];
      const result = PathUtils.findCommonBase(paths);
      expect(result).toBe('/project');
    });

    it('should handle single path', () => {
      const result = PathUtils.findCommonBase(['/project/docs/file.md']);
      expect(result).toBe('/project/docs');
    });

    it('should handle empty array', () => {
      const result = PathUtils.findCommonBase([]);
      expect(result).toBe('');
    });
  });

  describe('toUnixPath', () => {
    it('should convert Windows paths to Unix style', () => {
      const result = PathUtils.toUnixPath('path\\to\\file.md');
      expect(result).toBe('path/to/file.md');
    });

    it('should leave Unix paths unchanged', () => {
      const result = PathUtils.toUnixPath('path/to/file.md');
      expect(result).toBe('path/to/file.md');
    });
  });
});
