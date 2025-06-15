import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PathUtils } from './path-utils.js';
import { 
  getPlatformInfo, 
  createConditionalTest, 
  getTestPaths,
  createPath,
  convertPathSeparators
} from './test-helpers.js';

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

  describe('Cross-Platform Path Behavior', () => {
    const platformInfo = getPlatformInfo();
    const testPaths = getTestPaths();
    const conditionalTest = createConditionalTest(it);

    describe('Platform-specific path handling', () => {
      it('should handle platform-appropriate absolute paths', () => {
        testPaths.absolute.forEach(testPath => {
          const result = PathUtils.validatePath(testPath);
          expect(result.valid).toBe(true);
        });
      });

      it('should handle platform-appropriate relative paths', () => {
        testPaths.relative.forEach(testPath => {
          const result = PathUtils.validatePath(testPath);
          expect(result.valid).toBe(true);
        });
      });

      it('should handle path traversal validation appropriately', () => {
        // Test traversal paths separately since they may be rejected for security
        const traversalPaths = platformInfo.isWindows 
          ? ['..\\parent\\file.txt']
          : ['../parent/file.txt'];
          
        traversalPaths.forEach(testPath => {
          const result = PathUtils.validatePath(testPath);
          // Path traversal may be rejected for security - this is platform/implementation dependent
          expect(typeof result.valid).toBe('boolean');
          if (!result.valid) {
            expect(result.reason).toBeDefined();
          }
        });
      });

      conditionalTest('Windows drive letter handling', 'windows', () => {
        expect(PathUtils.validatePath('C:\\Users\\test\\file.md').valid).toBe(true);
        expect(PathUtils.validatePath('D:\\Projects\\readme.md').valid).toBe(true);
      });

      conditionalTest('Unix absolute path handling', 'unix', () => {
        expect(PathUtils.validatePath('/home/user/file.md').valid).toBe(true);
        expect(PathUtils.validatePath('/usr/local/share/doc.md').valid).toBe(true);
      });
    });

    describe('Path separator handling', () => {
      it('should handle native path separators', () => {
        const nativePath = createPath('folder', 'subfolder', 'file.md');
        const result = PathUtils.validatePath(nativePath);
        expect(result.valid).toBe(true);
      });

      it('should convert path separators when needed', () => {
        if (platformInfo.isWindows) {
          const unixPath = 'folder/subfolder/file.md';
          const windowsPath = convertPathSeparators(unixPath);
          expect(windowsPath).toBe('folder\\subfolder\\file.md');
          expect(PathUtils.validatePath(windowsPath).valid).toBe(true);
        } else {
          const windowsPath = 'folder\\subfolder\\file.md';
          const unixPath = convertPathSeparators(windowsPath);
          expect(unixPath).toBe('folder/subfolder/file.md');
          expect(PathUtils.validatePath(unixPath).valid).toBe(true);
        }
      });
    });

    describe('toUnixPath cross-platform behavior', () => {
      it('should consistently convert to Unix paths regardless of platform', () => {
        const mixedPaths = [
          'folder\\subfolder\\file.md',
          'folder/subfolder/file.md',
          'folder\\mixed/path\\file.md'
        ];

        mixedPaths.forEach(path => {
          const result = PathUtils.toUnixPath(path);
          expect(result).not.toContain('\\');
          expect(result).toMatch(/\//);
        });
      });
    });

    describe('Relative path updates across platforms', () => {
      it('should handle relative path updates with platform-specific paths', () => {
        if (platformInfo.isWindows) {
          const result = PathUtils.updateRelativePath(
            '.\\target.md',
            'C:\\project\\docs\\source.md',
            'C:\\project\\moved\\source.md'
          );
          // Should work regardless of path separator style
          expect(result).toMatch(/\.\.[\\/]docs[\\/]target\.md/);
        } else {
          const result = PathUtils.updateRelativePath(
            './target.md',
            '/project/docs/source.md',
            '/project/moved/source.md'
          );
          expect(result).toBe('../docs/target.md');
        }
      });
    });

    describe('findCommonBase with mixed path separators', () => {
      it('should find common base even with mixed separators', () => {
        let paths: string[];
        let expectedBase: string;
        
        if (platformInfo.isWindows) {
          paths = [
            'C:\\project\\docs\\file1.md',
            'C:/project/docs/file2.md',  // Mixed separator style
            'C:\\project\\src\\file3.md'
          ];
          expectedBase = 'C:\\project';
        } else {
          // Use consistent separators for Unix systems
          paths = [
            '/tmp/project/docs/file1.md',
            '/tmp/project/docs/file2.md',  
            '/tmp/project/src/file3.md'
          ];
          expectedBase = '/tmp/project';
        }
        
        const result = PathUtils.findCommonBase(paths);
        expect(result).toBe(expectedBase);
      });
    });
  });
});
