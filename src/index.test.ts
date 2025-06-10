import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';

// Import the programmatic API
import {
  FileOperations,
  createMarkMv,
  moveFile,
  moveFiles,
  validateOperation,
  type MoveOperationOptions,
  type OperationResult
} from './index.js';

describe('Programmatic API', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'markmv-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('FileOperations class', () => {
    it('should be instantiable', () => {
      const fileOps = new FileOperations();
      expect(fileOps).toBeInstanceOf(FileOperations);
    });

    it('should move a file with dry run', async () => {
      const fileOps = new FileOperations();
      
      // Create test files
      const sourceFile = join(testDir, 'source.md');
      const destFile = join(testDir, 'dest.md');
      
      await writeFile(sourceFile, '# Test\n\nThis is a test file.\n');
      
      const result = await fileOps.moveFile(sourceFile, destFile, { dryRun: true });
      
      expect(result.success).toBe(true);
      expect(result.createdFiles).toContain(destFile);
      expect(result.deletedFiles).toContain(sourceFile);
      
      // File should still exist since it's a dry run
      const content = await readFile(sourceFile, 'utf-8');
      expect(content).toBe('# Test\n\nThis is a test file.\n');
    });
  });

  describe('createMarkMv factory function', () => {
    it('should create a FileOperations instance', () => {
      const markmv = createMarkMv();
      expect(markmv).toBeInstanceOf(FileOperations);
    });

    it('should allow method chaining style usage', async () => {
      const markmv = createMarkMv();
      
      // Create test file
      const sourceFile = join(testDir, 'test.md');
      const destFile = join(testDir, 'renamed.md');
      
      await writeFile(sourceFile, '# Test File\n\nContent here.\n');
      
      const result = await markmv.moveFile(sourceFile, destFile, { dryRun: true });
      
      expect(result.success).toBe(true);
      expect(result.createdFiles).toContain(destFile);
    });
  });

  describe('moveFile convenience function', () => {
    it('should move a single file', async () => {
      // Create test file
      const sourceFile = join(testDir, 'original.md');
      const destFile = join(testDir, 'moved.md');
      
      await writeFile(sourceFile, '# Original\n\nThis file will be moved.\n');
      
      const result = await moveFile(sourceFile, destFile, { dryRun: true });
      
      expect(result.success).toBe(true);
      expect(result.createdFiles).toContain(destFile);
      expect(result.deletedFiles).toContain(sourceFile);
    });

    it('should handle move options', async () => {
      const sourceFile = join(testDir, 'source.md');
      const destFile = join(testDir, 'dest.md');
      
      await writeFile(sourceFile, '# Source\n\nContent.\n');
      
      const options: MoveOperationOptions = {
        dryRun: true,
        verbose: true
      };
      
      const result = await moveFile(sourceFile, destFile, options);
      
      expect(result.success).toBe(true);
    });
  });

  describe('moveFiles convenience function', () => {
    it('should move multiple files', async () => {
      // Create test files
      const source1 = join(testDir, 'file1.md');
      const source2 = join(testDir, 'file2.md');
      const dest1 = join(testDir, 'renamed1.md');
      const dest2 = join(testDir, 'renamed2.md');
      
      await writeFile(source1, '# File 1\n\nFirst file.\n');
      await writeFile(source2, '# File 2\n\nSecond file.\n');
      
      const moves = [
        { source: source1, destination: dest1 },
        { source: source2, destination: dest2 }
      ];
      
      const result = await moveFiles(moves, { dryRun: true });
      
      expect(result.success).toBe(true);
      expect(result.createdFiles).toHaveLength(2);
      expect(result.deletedFiles).toHaveLength(2);
      expect(result.createdFiles).toContain(dest1);
      expect(result.createdFiles).toContain(dest2);
    });

    it('should handle empty moves array', async () => {
      const result = await moveFiles([], { dryRun: true });
      
      expect(result.success).toBe(true);
      expect(result.createdFiles).toHaveLength(0);
      expect(result.deletedFiles).toHaveLength(0);
    });
  });

  describe('validateOperation convenience function', () => {
    it('should validate operation results', async () => {
      // Create a mock operation result
      const mockResult: OperationResult = {
        success: true,
        modifiedFiles: [],
        createdFiles: [join(testDir, 'new.md')],
        deletedFiles: [],
        errors: [],
        warnings: [],
        changes: []
      };
      
      // Create the file that the result claims was created
      await writeFile(join(testDir, 'new.md'), '# New File\n\nContent.\n');
      
      const validation = await validateOperation(mockResult);
      
      expect(validation).toHaveProperty('valid');
      expect(validation).toHaveProperty('brokenLinks');
      expect(validation).toHaveProperty('errors');
      expect(typeof validation.valid).toBe('boolean');
      expect(typeof validation.brokenLinks).toBe('number');
      expect(Array.isArray(validation.errors)).toBe(true);
    });
  });

  describe('Type exports', () => {
    it('should export operation types', () => {
      // This is more of a compilation test - if types are properly exported,
      // this will compile without errors
      const options: MoveOperationOptions = {
        dryRun: true,
        verbose: false
      };
      
      expect(options.dryRun).toBe(true);
      expect(options.verbose).toBe(false);
    });
  });

  describe('Directory destination support', () => {
    it('should move file to directory', async () => {
      const sourceFile = join(testDir, 'source.md');
      const targetDir = join(testDir, 'target');
      
      await writeFile(sourceFile, '# Source\n\nContent.');
      await mkdir(targetDir);
      
      const result = await moveFile(sourceFile, targetDir, { dryRun: true });
      
      expect(result.success).toBe(true);
      expect(result.createdFiles[0]).toBe(join(targetDir, 'source.md'));
    });

    it('should move file to directory with trailing slash', async () => {
      const sourceFile = join(testDir, 'test.md');
      const targetDir = join(testDir, 'docs');
      
      await writeFile(sourceFile, '# Test\n\nContent.');
      await mkdir(targetDir);
      
      const result = await moveFile(sourceFile, `${targetDir}/`, { dryRun: true });
      
      expect(result.success).toBe(true);
      expect(result.createdFiles[0]).toBe(join(targetDir, 'test.md'));
    });
  });

  describe('Error handling', () => {
    it('should handle invalid source paths gracefully', async () => {
      const nonExistentFile = join(testDir, 'does-not-exist.md');
      const destFile = join(testDir, 'dest.md');
      
      const result = await moveFile(nonExistentFile, destFile, { dryRun: true });
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle invalid destination paths gracefully', async () => {
      const sourceFile = join(testDir, 'source.md');
      const invalidDest = '/invalid/path/dest.md';
      
      await writeFile(sourceFile, '# Test\n\nContent.\n');
      
      const result = await moveFile(sourceFile, invalidDest, { dryRun: true });
      
      // Should either succeed with dry run or fail gracefully
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });
});

describe('Integration with existing functionality', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'markmv-integration-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should handle files with cross-references', async () => {
    // Create files that reference each other
    const file1 = join(testDir, 'file1.md');
    const file2 = join(testDir, 'file2.md');
    const file1Moved = join(testDir, 'renamed-file1.md');
    
    await writeFile(file1, '# File 1\n\nSee [File 2](./file2.md) for more info.\n');
    await writeFile(file2, '# File 2\n\nReferences [File 1](./file1.md).\n');
    
    const result = await moveFile(file1, file1Moved, { dryRun: true });
    
    expect(result.success).toBe(true);
    // Should detect that file2.md needs to be modified to update the link
    expect(result.modifiedFiles.length).toBeGreaterThan(0);
  });

  it('should work with the FileOperations class directly', async () => {
    const fileOps = new FileOperations();
    
    const sourceFile = join(testDir, 'direct.md');
    const destFile = join(testDir, 'direct-moved.md');
    
    await writeFile(sourceFile, '# Direct Usage\n\nTesting direct class usage.\n');
    
    const result = await fileOps.moveFile(sourceFile, destFile, { 
      dryRun: true,
      verbose: true 
    });
    
    expect(result.success).toBe(true);
    expect(result.createdFiles).toContain(destFile);
    
    // Test validation
    const validation = await fileOps.validateOperation(result);
    expect(validation).toHaveProperty('valid');
  });
});