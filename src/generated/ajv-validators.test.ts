/**
 * @fileoverview Tests for auto-generated AJV validators
 * Verifies that JSON Schema validation works correctly for all auto-exposed methods
 */

import { describe, it, expect } from 'vitest';
import { 
  schemas, 
  validators, 
  validateInput, 
  validateOutput, 
  getAvailableMethods 
} from './ajv-validators.js';

describe('Auto-Generated AJV Validators', () => {
  describe('Schema Definitions', () => {
    it('should have valid schema structure', () => {
      expect(schemas).toHaveProperty('$schema');
      expect(schemas).toHaveProperty('title');
      expect(schemas).toHaveProperty('description');
      expect(schemas).toHaveProperty('definitions');
      
      expect(schemas.$schema).toBe('http://json-schema.org/draft-07/schema#');
      expect(schemas.title).toBe('markmv API Schemas');
    });

    it('should include all expected method definitions', () => {
      const methodNames = Object.keys(schemas.definitions);
      
      expect(methodNames).toContain('moveFile');
      expect(methodNames).toContain('moveFiles');
      expect(methodNames).toContain('validateOperation');
      expect(methodNames).toContain('testAutoExposure');
      expect(methodNames).toHaveLength(4);
    });

    it('should have proper structure for each method definition', () => {
      Object.entries(schemas.definitions).forEach(([methodName, definition]) => {
        expect(definition).toHaveProperty('title');
        expect(definition).toHaveProperty('description');
        expect(definition).toHaveProperty('type');
        expect(definition).toHaveProperty('properties');
        expect(definition).toHaveProperty('additionalProperties');
        expect(definition).toHaveProperty('x-group');
        expect(definition).toHaveProperty('x-examples');
        
        expect(definition.title).toBe(methodName);
        expect(definition.type).toBe('object');
        expect(definition.additionalProperties).toBe(false);
        
        // Each method should have input and output properties
        expect(definition.properties).toHaveProperty('input');
        expect(definition.properties).toHaveProperty('output');
      });
    });
  });

  describe('Compiled Validators', () => {
    it('should have validators for all methods', () => {
      const methodNames = Object.keys(validators);
      
      expect(methodNames).toContain('moveFile');
      expect(methodNames).toContain('moveFiles');
      expect(methodNames).toContain('validateOperation');
      expect(methodNames).toContain('testAutoExposure');
      expect(methodNames).toHaveLength(4);
    });

    it('should have input and output validators for each method', () => {
      Object.entries(validators).forEach(([_methodName, validator]) => {
        expect(validator).toHaveProperty('input');
        expect(validator).toHaveProperty('output');
        expect(typeof validator.input).toBe('function');
        expect(typeof validator.output).toBe('function');
      });
    });
  });

  describe('Input Validation', () => {
    describe('moveFile validation', () => {
      it('should validate correct moveFile input', () => {
        const validInput = {
          sourcePath: 'old.md',
          destinationPath: 'new.md',
          options: { dryRun: true }
        };
        
        const result = validateInput('moveFile', validInput);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject moveFile input missing required fields', () => {
        const invalidInput = {
          sourcePath: 'old.md'
          // missing destinationPath
        };
        
        const result = validateInput('moveFile', invalidInput);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should reject moveFile input with wrong types', () => {
        const invalidInput = {
          sourcePath: 123, // should be string
          destinationPath: 'new.md'
        };
        
        const result = validateInput('moveFile', invalidInput);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    describe('moveFiles validation', () => {
      it('should validate correct moveFiles input', () => {
        const validInput = {
          moves: [
            { source: 'old1.md', destination: 'new1.md' },
            { source: 'old2.md', destination: 'new2.md' }
          ],
          options: { verbose: true }
        };
        
        const result = validateInput('moveFiles', validInput);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject moveFiles input with invalid moves array', () => {
        const invalidInput = {
          moves: [
            { source: 'old1.md' } // missing destination
          ]
        };
        
        const result = validateInput('moveFiles', invalidInput);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should reject moveFiles input missing moves array', () => {
        const invalidInput = {
          options: { verbose: true }
          // missing moves
        };
        
        const result = validateInput('moveFiles', invalidInput);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    describe('testAutoExposure validation', () => {
      it('should validate correct testAutoExposure input', () => {
        const validInput = {
          input: 'Hello World'
        };
        
        const result = validateInput('testAutoExposure', validInput);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject testAutoExposure input with wrong type', () => {
        const invalidInput = {
          input: 123 // should be string
        };
        
        const result = validateInput('testAutoExposure', invalidInput);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should reject testAutoExposure input missing required field', () => {
        const invalidInput = {};
        
        const result = validateInput('testAutoExposure', invalidInput);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should accept empty string input', () => {
        const validInput = {
          input: ''
        };
        
        const result = validateInput('testAutoExposure', validInput);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('validateOperation validation', () => {
      it('should validate correct validateOperation input', () => {
        const validInput = {
          result: {
            success: true,
            modifiedFiles: ['file1.md'],
            createdFiles: ['file2.md'],
            deletedFiles: [],
            errors: [],
            warnings: [],
            changes: []
          }
        };
        
        const result = validateInput('validateOperation', validInput);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject validateOperation input with incomplete result', () => {
        const invalidInput = {
          result: {
            success: true
            // missing required arrays
          }
        };
        
        const result = validateInput('validateOperation', invalidInput);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Output Validation', () => {
    describe('testAutoExposure output validation', () => {
      it('should validate correct testAutoExposure output', () => {
        const validOutput = {
          message: 'Echo: Hello World',
          timestamp: '2024-01-01T00:00:00.000Z',
          success: true
        };
        
        const result = validateOutput('testAutoExposure', validOutput);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject testAutoExposure output missing required fields', () => {
        const invalidOutput = {
          message: 'Echo: Hello World'
          // missing timestamp and success
        };
        
        const result = validateOutput('testAutoExposure', invalidOutput);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should reject testAutoExposure output with wrong types', () => {
        const invalidOutput = {
          message: 'Echo: Hello World',
          timestamp: '2024-01-01T00:00:00.000Z',
          success: 'true' // should be boolean
        };
        
        const result = validateOutput('testAutoExposure', invalidOutput);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    describe('moveFile output validation', () => {
      it('should validate correct moveFile output', () => {
        const validOutput = {
          success: true,
          modifiedFiles: ['file1.md'],
          createdFiles: ['file2.md'],
          deletedFiles: [],
          errors: [],
          warnings: [],
          changes: []
        };
        
        const result = validateOutput('moveFile', validOutput);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('validateOperation output validation', () => {
      it('should validate correct validateOperation output', () => {
        const validOutput = {
          valid: true,
          brokenLinks: 0,
          errors: []
        };
        
        const result = validateOutput('validateOperation', validOutput);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject validateOperation output with wrong brokenLinks type', () => {
        const invalidOutput = {
          valid: true,
          brokenLinks: '0', // should be number
          errors: []
        };
        
        const result = validateOutput('validateOperation', invalidOutput);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown method names gracefully', () => {
      const result = validateInput('unknownMethod', { test: 'data' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown method: unknownMethod');
    });

    it('should handle null and undefined inputs', () => {
      const nullResult = validateInput('moveFile', null);
      const undefinedResult = validateInput('moveFile', undefined);
      
      expect(nullResult.valid).toBe(false);
      expect(undefinedResult.valid).toBe(false);
    });

    it('should provide meaningful error messages', () => {
      const result = validateInput('moveFile', { sourcePath: 123 });
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(error => error.includes('string') || error.includes('type'))).toBe(true);
    });
  });

  describe('Helper Functions', () => {
    describe('getAvailableMethods', () => {
      it('should return array of all available methods', () => {
        const methods = getAvailableMethods();
        
        expect(Array.isArray(methods)).toBe(true);
        expect(methods).toContain('moveFile');
        expect(methods).toContain('moveFiles');
        expect(methods).toContain('validateOperation');
        expect(methods).toContain('testAutoExposure');
        expect(methods).toHaveLength(4);
      });

      it('should return methods in consistent order', () => {
        const methods1 = getAvailableMethods();
        const methods2 = getAvailableMethods();
        
        expect(methods1).toEqual(methods2);
      });
    });
  });

  describe('Performance', () => {
    it('should validate inputs quickly', () => {
      const validInput = {
        input: 'Performance test'
      };
      
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        validateInput('testAutoExposure', validInput);
      }
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(100); // Should complete 1000 validations in under 100ms
    });

    it('should handle concurrent validations', async () => {
      const validInput = {
        input: 'Concurrent test'
      };
      
      const promises = Array(100).fill(0).map(() => 
        Promise.resolve(validateInput('testAutoExposure', validInput))
      );
      
      const results = await Promise.all(promises);
      
      results.forEach(result => {
        expect(result.valid).toBe(true);
      });
    });
  });
});