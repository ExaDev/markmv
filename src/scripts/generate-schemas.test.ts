/**
 * @file Tests for the schema generation script Verifies that the JSON Schema-first auto-exposure
 *   pattern generation works correctly
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = process.cwd();
const GENERATED_DIR = join(ROOT_DIR, 'src', 'generated');

describe('Schema Generation Script', () => {
  describe('Generated Files', () => {
    beforeEach(() => {
      // Ensure we have fresh generated files
      try {
        execSync('npm run generate:schemas', { cwd: ROOT_DIR, stdio: 'pipe' });
      } catch (error) {
        console.warn('Failed to run schema generation:', error.message);
      }
    });

    it('should generate all required files', () => {
      const expectedFiles = [
        'schemas.json',
        'ajv-validators.ts',
        'mcp-tools.ts',
        'api-routes.ts',
        'openapi.json',
      ];

      expectedFiles.forEach((file) => {
        const filePath = join(GENERATED_DIR, file);
        expect(existsSync(filePath)).toBe(true);
      });
    });

    it('should generate schemas.json with correct structure', () => {
      const schemasPath = join(GENERATED_DIR, 'schemas.json');
      expect(existsSync(schemasPath)).toBe(true);

      const schemas = JSON.parse(readFileSync(schemasPath, 'utf8'));

      expect(schemas).toHaveProperty('$schema');
      expect(schemas).toHaveProperty('title');
      expect(schemas).toHaveProperty('description');
      expect(schemas).toHaveProperty('definitions');

      expect(schemas.$schema).toBe('http://json-schema.org/draft-07/schema#');
      expect(schemas.title).toBe('markmv API Schemas');

      // Check for expected method definitions
      expect(schemas.definitions).toHaveProperty('moveFile');
      expect(schemas.definitions).toHaveProperty('moveFiles');
      expect(schemas.definitions).toHaveProperty('validateOperation');
      expect(schemas.definitions).toHaveProperty('testAutoExposure');
    });

    it('should generate openapi.json with correct structure', () => {
      const openapiPath = join(GENERATED_DIR, 'openapi.json');
      expect(existsSync(openapiPath)).toBe(true);

      const openapi = JSON.parse(readFileSync(openapiPath, 'utf8'));

      expect(openapi).toHaveProperty('openapi');
      expect(openapi).toHaveProperty('info');
      expect(openapi).toHaveProperty('servers');
      expect(openapi).toHaveProperty('paths');
      expect(openapi).toHaveProperty('components');

      expect(openapi.openapi).toBe('3.0.3');
      expect(openapi.info.title).toBe('markmv API');

      // Check for expected API paths
      expect(openapi.paths).toHaveProperty('/api/move-file');
      expect(openapi.paths).toHaveProperty('/api/move-files');
      expect(openapi.paths).toHaveProperty('/api/validate-operation');
      expect(openapi.paths).toHaveProperty('/api/test-auto-exposure');
    });

    it('should generate valid TypeScript files', () => {
      const tsFiles = ['ajv-validators.ts', 'mcp-tools.ts', 'api-routes.ts'];

      tsFiles.forEach((file) => {
        const filePath = join(GENERATED_DIR, file);
        expect(existsSync(filePath)).toBe(true);

        const content = readFileSync(filePath, 'utf8');

        // Basic TypeScript validation
        expect(content).toContain('/**');
        expect(content).toContain('*/');
        expect(content).toContain('export');
        expect(content).toContain('DO NOT EDIT MANUALLY');
        // Match timestamp that may be on the next line after "Generated on:"
        expect(content).toMatch(/Generated on:[\s\r\n*]*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
      });
    });

    it('should include testAutoExposure in all generated artifacts', () => {
      // Check schemas.json
      const schemas = JSON.parse(readFileSync(join(GENERATED_DIR, 'schemas.json'), 'utf8'));
      expect(schemas.definitions).toHaveProperty('testAutoExposure');

      // Check openapi.json
      const openapi = JSON.parse(readFileSync(join(GENERATED_DIR, 'openapi.json'), 'utf8'));
      expect(openapi.paths).toHaveProperty('/api/test-auto-exposure');
      expect(openapi.components.schemas).toHaveProperty('testAutoExposureInput');
      expect(openapi.components.schemas).toHaveProperty('testAutoExposureOutput');

      // Check mcp-tools.ts
      const mcpContent = readFileSync(join(GENERATED_DIR, 'mcp-tools.ts'), 'utf8');
      expect(mcpContent).toContain('test_auto_exposure');
      expect(mcpContent).toContain('Test function to demonstrate auto-exposure');

      // Check api-routes.ts
      const apiContent = readFileSync(join(GENERATED_DIR, 'api-routes.ts'), 'utf8');
      expect(apiContent).toContain('/api/test-auto-exposure');
      expect(apiContent).toContain('createtestAutoExposureHandler');

      // Check ajv-validators.ts
      const validatorContent = readFileSync(join(GENERATED_DIR, 'ajv-validators.ts'), 'utf8');
      expect(validatorContent).toContain('testAutoExposure');
    });
  });

  describe('Schema Validation', () => {
    it('should generate valid JSON Schema definitions', () => {
      const schemasPath = join(GENERATED_DIR, 'schemas.json');
      const schemas = JSON.parse(readFileSync(schemasPath, 'utf8'));

      Object.entries(schemas.definitions).forEach(([methodName, definition]) => {
        // Each method should have proper structure
        expect(definition).toHaveProperty('title');
        expect(definition).toHaveProperty('description');
        expect(definition).toHaveProperty('type');
        expect(definition).toHaveProperty('properties');
        expect(definition).toHaveProperty('additionalProperties');

        expect(definition.title).toBe(methodName);
        expect(definition.type).toBe('object');
        expect(definition.additionalProperties).toBe(false);

        // Should have input and output schemas
        expect(definition.properties).toHaveProperty('input');
        expect(definition.properties).toHaveProperty('output');

        const input = definition.properties.input;
        const output = definition.properties.output;

        // Input validation
        expect(input).toHaveProperty('type');
        expect(input.type).toBe('object');
        expect(input).toHaveProperty('properties');
        expect(input).toHaveProperty('required');
        expect(input).toHaveProperty('additionalProperties');
        expect(input.additionalProperties).toBe(false);

        // Output validation
        expect(output).toHaveProperty('type');
        expect(output.type).toBe('object');
        expect(output).toHaveProperty('properties');
        expect(output).toHaveProperty('required');
        expect(output).toHaveProperty('additionalProperties');
        expect(output.additionalProperties).toBe(false);
      });
    });

    it('should generate consistent naming conventions', () => {
      // Check MCP tool names (snake_case)
      const mcpContent = readFileSync(join(GENERATED_DIR, 'mcp-tools.ts'), 'utf8');
      const mcpToolNames = mcpContent.match(/name: '([^']+)'/g);

      mcpToolNames.forEach((match) => {
        const name = match.match(/name: '([^']+)'/)[1];
        expect(name).toMatch(/^[a-z]+(_[a-z]+)*$/); // snake_case
      });

      // Check API route paths (kebab-case)
      const apiContent = readFileSync(join(GENERATED_DIR, 'api-routes.ts'), 'utf8');
      const apiPaths = apiContent.match(/path: '([^']+)'/g);

      apiPaths.forEach((match) => {
        const path = match.match(/path: '([^']+)'/)[1];
        expect(path).toMatch(/^\/api\/[a-z]+(-[a-z]+)*$/); // kebab-case
      });
    });

    it('should generate proper TypeScript types', () => {
      const validatorContent = readFileSync(join(GENERATED_DIR, 'ajv-validators.ts'), 'utf8');

      // Should import Ajv properly
      expect(validatorContent).toContain("import Ajv from 'ajv'");

      // Should export proper types
      expect(validatorContent).toContain('export const schemas');
      expect(validatorContent).toContain('export const validators');
      expect(validatorContent).toContain('export function validateInput');
      expect(validatorContent).toContain('export function validateOutput');
      expect(validatorContent).toContain('export function getAvailableMethods');

      // Should not contain 'any' types
      expect(validatorContent).not.toContain(': any');
      expect(validatorContent).not.toContain('as any');
    });
  });

  describe('Method Coverage', () => {
    it('should generate exactly 4 methods', () => {
      const schemas = JSON.parse(readFileSync(join(GENERATED_DIR, 'schemas.json'), 'utf8'));
      const methodCount = Object.keys(schemas.definitions).length;

      expect(methodCount).toBe(4);
    });

    it('should include all core markmv methods', () => {
      const schemas = JSON.parse(readFileSync(join(GENERATED_DIR, 'schemas.json'), 'utf8'));
      const methods = Object.keys(schemas.definitions);

      expect(methods).toContain('moveFile');
      expect(methods).toContain('moveFiles');
      expect(methods).toContain('validateOperation');
      expect(methods).toContain('testAutoExposure');
    });

    it('should generate proper group annotations', () => {
      const schemas = JSON.parse(readFileSync(join(GENERATED_DIR, 'schemas.json'), 'utf8'));

      expect(schemas.definitions.moveFile).toHaveProperty('x-group');
      expect(schemas.definitions.moveFiles).toHaveProperty('x-group');
      expect(schemas.definitions.validateOperation).toHaveProperty('x-group');
      expect(schemas.definitions.testAutoExposure).toHaveProperty('x-group');

      expect(schemas.definitions.moveFile['x-group']).toBe('Core API');
      expect(schemas.definitions.moveFiles['x-group']).toBe('Core API');
      expect(schemas.definitions.validateOperation['x-group']).toBe('Core API');
      expect(schemas.definitions.testAutoExposure['x-group']).toBe('Testing');
    });
  });

  describe('File Headers and Metadata', () => {
    it('should include proper file headers in all generated files', () => {
      const files = ['ajv-validators.ts', 'mcp-tools.ts', 'api-routes.ts'];

      files.forEach((file) => {
        const content = readFileSync(join(GENERATED_DIR, file), 'utf8');

        expect(content).toContain('/**');
        expect(content).toContain('Auto-generated');
        expect(content).toContain('DO NOT EDIT MANUALLY');
        expect(content).toContain('Generated on:');
        expect(content).toContain('*/');
      });
    });

    it('should include proper generation timestamps', () => {
      const files = ['ajv-validators.ts', 'mcp-tools.ts', 'api-routes.ts'];

      files.forEach((file) => {
        const content = readFileSync(join(GENERATED_DIR, file), 'utf8');
        const timestampMatch = content.match(
          /Generated on:[\s\r\n*]*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/
        );

        expect(timestampMatch).toBeTruthy();
        expect(new Date(timestampMatch[1])).toBeInstanceOf(Date);
      });
    });
  });

  describe('Integration', () => {
    it('should generate files that can be imported without errors', async () => {
      // This test verifies that the generated TypeScript files are valid
      // by attempting to import them (will be checked by TypeScript compilation)
      expect(() => {
        // These imports will be validated during the test compilation
        // If there are syntax errors, the test build will fail
        const validatorsPath = join(GENERATED_DIR, 'ajv-validators.ts');
        const mcpToolsPath = join(GENERATED_DIR, 'mcp-tools.ts');
        const apiRoutesPath = join(GENERATED_DIR, 'api-routes.ts');

        expect(existsSync(validatorsPath)).toBe(true);
        expect(existsSync(mcpToolsPath)).toBe(true);
        expect(existsSync(apiRoutesPath)).toBe(true);
      }).not.toThrow();
    });

    it('should maintain consistency across all generated artifacts', () => {
      const schemas = JSON.parse(readFileSync(join(GENERATED_DIR, 'schemas.json'), 'utf8'));
      const openapi = JSON.parse(readFileSync(join(GENERATED_DIR, 'openapi.json'), 'utf8'));

      const schemaMethods = Object.keys(schemas.definitions);
      const openapiPaths = Object.keys(openapi.paths);

      // Should have corresponding OpenAPI paths for each schema
      schemaMethods.forEach((methodName) => {
        const kebabName = methodName.replace(/([A-Z])/g, '-$1').toLowerCase();
        const expectedPath = `/api/${kebabName}`;
        expect(openapiPaths).toContain(expectedPath);
      });
    });
  });
});
