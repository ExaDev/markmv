/**
 * @file Tests for generated OpenAPI specification accuracy Verifies that the OpenAPI spec correctly
 *   represents the auto-exposed API endpoints
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const openapiSpec = JSON.parse(readFileSync(join(__dirname, 'openapi.json'), 'utf8'));

describe('Generated OpenAPI Specification', () => {
  describe('Specification Structure', () => {
    it('should have valid OpenAPI 3.0.3 structure', () => {
      expect(openapiSpec).toHaveProperty('openapi');
      expect(openapiSpec).toHaveProperty('info');
      expect(openapiSpec).toHaveProperty('servers');
      expect(openapiSpec).toHaveProperty('paths');
      expect(openapiSpec).toHaveProperty('components');

      expect(openapiSpec.openapi).toBe('3.0.3');
    });

    it('should have proper info section', () => {
      expect(openapiSpec.info).toHaveProperty('title');
      expect(openapiSpec.info).toHaveProperty('description');
      expect(openapiSpec.info).toHaveProperty('version');
      expect(openapiSpec.info).toHaveProperty('contact');

      expect(openapiSpec.info.title).toBe('markmv API');
      expect(openapiSpec.info.description).toContain('Auto-generated API specification');
      expect(openapiSpec.info.version).toBe('1.0.0');
      expect(openapiSpec.info.contact.name).toBe('markmv');
    });

    it('should have development server configured', () => {
      expect(Array.isArray(openapiSpec.servers)).toBe(true);
      expect(openapiSpec.servers.length).toBeGreaterThan(0);

      const devServer = openapiSpec.servers[0];
      expect(devServer).toHaveProperty('url');
      expect(devServer).toHaveProperty('description');
      expect(devServer.url).toBe('http://localhost:3000');
      expect(devServer.description).toBe('Development server');
    });
  });

  describe('API Paths', () => {
    it('should include all expected endpoints', () => {
      const expectedPaths = [
        '/api/move-file',
        '/api/move-files',
        '/api/validate-operation',
        '/api/test-auto-exposure',
      ];

      expectedPaths.forEach((path) => {
        expect(openapiSpec.paths).toHaveProperty(path);
      });
    });

    it('should have exactly 4 endpoints', () => {
      const pathCount = Object.keys(openapiSpec.paths).length;
      expect(pathCount).toBe(4);
    });

    it('should use POST method for all endpoints', () => {
      Object.values(openapiSpec.paths).forEach((pathSpec: unknown) => {
        const spec = pathSpec as Record<string, unknown>;
        expect(spec).toHaveProperty('post');
        const post = spec.post as Record<string, unknown>;
        expect(post).toHaveProperty('summary');
        expect(post).toHaveProperty('tags');
        expect(post).toHaveProperty('requestBody');
        expect(post).toHaveProperty('responses');
      });
    });

    describe('Individual Endpoint Validation', () => {
      describe('/api/test-auto-exposure', () => {
        it('should have correct endpoint structure', () => {
          const endpoint = openapiSpec.paths['/api/test-auto-exposure'];
          expect(endpoint).toBeDefined();

          const postSpec = endpoint.post;
          expect(postSpec.summary).toBe('Test function to demonstrate auto-exposure pattern');
          expect(postSpec.tags).toContain('Testing');
        });

        it('should have correct request body schema', () => {
          const endpoint = openapiSpec.paths['/api/test-auto-exposure'];
          const requestBody = endpoint.post.requestBody;

          expect(requestBody.required).toBe(true);
          expect(requestBody.content).toHaveProperty('application/json');

          const schema = requestBody.content['application/json'].schema;
          expect(schema.$ref).toBe('#/components/schemas/testAutoExposureInput');
        });

        it('should have correct response schemas', () => {
          const endpoint = openapiSpec.paths['/api/test-auto-exposure'];
          const responses = endpoint.post.responses;

          // Success response
          expect(responses['200']).toBeDefined();
          expect(responses['200'].description).toBe('Success');
          expect(responses['200'].content['application/json'].schema.$ref).toBe(
            '#/components/schemas/testAutoExposureOutput'
          );

          // Error responses
          expect(responses['400']).toBeDefined();
          expect(responses['400'].description).toBe('Validation error');
          expect(responses['500']).toBeDefined();
          expect(responses['500'].description).toBe('Internal server error');
        });
      });

      describe('/api/move-file', () => {
        it('should have correct Core API tag', () => {
          const endpoint = openapiSpec.paths['/api/move-file'];
          expect(endpoint.post.tags).toContain('Core API');
          expect(endpoint.post.summary).toContain('Move a single markdown file');
        });
      });

      describe('/api/move-files', () => {
        it('should have correct Core API tag', () => {
          const endpoint = openapiSpec.paths['/api/move-files'];
          expect(endpoint.post.tags).toContain('Core API');
          expect(endpoint.post.summary).toContain('Move multiple markdown files');
        });
      });

      describe('/api/validate-operation', () => {
        it('should have correct Core API tag', () => {
          const endpoint = openapiSpec.paths['/api/validate-operation'];
          expect(endpoint.post.tags).toContain('Core API');
          expect(endpoint.post.summary).toContain('Validate the result');
        });
      });
    });
  });

  describe('Component Schemas', () => {
    it('should include all required schema components', () => {
      const expectedSchemas = [
        'moveFileInput',
        'moveFileOutput',
        'moveFilesInput',
        'moveFilesOutput',
        'validateOperationInput',
        'validateOperationOutput',
        'testAutoExposureInput',
        'testAutoExposureOutput',
      ];

      expectedSchemas.forEach((schema) => {
        expect(openapiSpec.components.schemas).toHaveProperty(schema);
      });
    });

    it('should have exactly 8 schema components', () => {
      const schemaCount = Object.keys(openapiSpec.components.schemas).length;
      expect(schemaCount).toBe(8);
    });

    describe('testAutoExposure Schemas', () => {
      it('should have correct input schema structure', () => {
        const inputSchema = openapiSpec.components.schemas.testAutoExposureInput;

        expect(inputSchema.type).toBe('object');
        expect(inputSchema.properties).toHaveProperty('input');
        expect(inputSchema.properties.input.type).toBe('string');
        expect(inputSchema.properties.input.description).toBe('The input message to echo');
        expect(inputSchema.required).toContain('input');
        expect(inputSchema.additionalProperties).toBe(false);
      });

      it('should have correct output schema structure', () => {
        const outputSchema = openapiSpec.components.schemas.testAutoExposureOutput;

        expect(outputSchema.type).toBe('object');
        expect(outputSchema.properties).toHaveProperty('message');
        expect(outputSchema.properties).toHaveProperty('timestamp');
        expect(outputSchema.properties).toHaveProperty('success');

        expect(outputSchema.properties.message.type).toBe('string');
        expect(outputSchema.properties.timestamp.type).toBe('string');
        expect(outputSchema.properties.success.type).toBe('boolean');

        expect(outputSchema.required).toContain('message');
        expect(outputSchema.required).toContain('timestamp');
        expect(outputSchema.required).toContain('success');
        expect(outputSchema.additionalProperties).toBe(false);
      });
    });

    describe('moveFile Schemas', () => {
      it('should have correct input schema with options', () => {
        const inputSchema = openapiSpec.components.schemas.moveFileInput;

        expect(inputSchema.type).toBe('object');
        expect(inputSchema.properties).toHaveProperty('sourcePath');
        expect(inputSchema.properties).toHaveProperty('destinationPath');
        expect(inputSchema.properties).toHaveProperty('options');

        expect(inputSchema.properties.sourcePath.type).toBe('string');
        expect(inputSchema.properties.destinationPath.type).toBe('string');
        expect(inputSchema.properties.options.type).toBe('object');

        expect(inputSchema.required).toContain('sourcePath');
        expect(inputSchema.required).toContain('destinationPath');
        expect(inputSchema.additionalProperties).toBe(false);

        // Options should have proper structure
        const options = inputSchema.properties.options;
        expect(options.properties).toHaveProperty('dryRun');
        expect(options.properties).toHaveProperty('verbose');
        expect(options.properties).toHaveProperty('force');
        expect(options.properties).toHaveProperty('createDirectories');
        expect(options.additionalProperties).toBe(false);
      });

      it('should have correct output schema with operation result', () => {
        const outputSchema = openapiSpec.components.schemas.moveFileOutput;

        expect(outputSchema.type).toBe('object');
        expect(outputSchema.properties).toHaveProperty('success');
        expect(outputSchema.properties).toHaveProperty('modifiedFiles');
        expect(outputSchema.properties).toHaveProperty('createdFiles');
        expect(outputSchema.properties).toHaveProperty('deletedFiles');
        expect(outputSchema.properties).toHaveProperty('errors');
        expect(outputSchema.properties).toHaveProperty('warnings');
        expect(outputSchema.properties).toHaveProperty('changes');

        expect(outputSchema.properties.success.type).toBe('boolean');
        expect(outputSchema.properties.modifiedFiles.type).toBe('array');
        expect(outputSchema.properties.modifiedFiles.items.type).toBe('string');
        expect(outputSchema.additionalProperties).toBe(false);
      });
    });
  });

  describe('Error Response Schemas', () => {
    it('should have consistent error response structure across all endpoints', () => {
      Object.values(openapiSpec.paths).forEach((pathSpec: unknown) => {
        const spec = pathSpec as Record<string, unknown>;
        const post = spec.post as Record<string, unknown>;
        const responses = post.responses;

        // 400 Error Response
        expect(responses['400']).toBeDefined();
        expect(responses['400'].description).toBe('Validation error');
        const error400Schema = responses['400'].content['application/json'].schema;
        expect(error400Schema.type).toBe('object');
        expect(error400Schema.properties).toHaveProperty('error');
        expect(error400Schema.properties).toHaveProperty('details');
        expect(error400Schema.properties.error.type).toBe('string');
        expect(error400Schema.properties.details.type).toBe('array');

        // 500 Error Response
        expect(responses['500']).toBeDefined();
        expect(responses['500'].description).toBe('Internal server error');
        const error500Schema = responses['500'].content['application/json'].schema;
        expect(error500Schema.type).toBe('object');
        expect(error500Schema.properties).toHaveProperty('error');
        expect(error500Schema.properties).toHaveProperty('message');
        expect(error500Schema.properties.error.type).toBe('string');
        expect(error500Schema.properties.message.type).toBe('string');
      });
    });
  });

  describe('Schema Validation', () => {
    it('should have valid JSON Schema structures', () => {
      Object.entries(openapiSpec.components.schemas).forEach(
        ([schemaName, schema]: [string, unknown]) => {
          const schemaObj = schema as Record<string, unknown>;
          expect(schema).toHaveProperty('type');
          expect(schema.type).toBe('object');
          expect(schema).toHaveProperty('properties');
          expect(schema).toHaveProperty('required');
          expect(schema).toHaveProperty('additionalProperties');
          expect(schema.additionalProperties).toBe(false);

          // All properties should have valid types
          Object.values(schemaObj.properties as Record<string, unknown>).forEach(
            (property: unknown) => {
              const prop = property as Record<string, unknown>;
              expect(property).toHaveProperty('type');
              expect(['string', 'number', 'boolean', 'array', 'object']).toContain(property.type);

              if (property.type === 'array') {
                expect(property).toHaveProperty('items');
                expect(property.items).toHaveProperty('type');
              }
            }
          );

          // Required fields should exist in properties
          schema.required.forEach((requiredField: string) => {
            expect(schema.properties).toHaveProperty(requiredField);
          });
        }
      );
    });

    it('should have consistent naming conventions', () => {
      // Schema names should be camelCase with Input/Output suffix
      Object.keys(openapiSpec.components.schemas).forEach((schemaName) => {
        expect(schemaName).toMatch(/^[a-z][a-zA-Z]*(Input|Output)$/);
      });

      // Path names should be kebab-case
      Object.keys(openapiSpec.paths).forEach((pathName) => {
        expect(pathName).toMatch(/^\/api\/[a-z]+(-[a-z]+)*$/);
      });
    });

    it('should have proper descriptions for all components', () => {
      Object.values(openapiSpec.paths).forEach((pathSpec: unknown) => {
        const spec = pathSpec as Record<string, unknown>;
        const pathSpec = spec as { post: { summary: string } };
        expect(pathSpec.post.summary).toBeTruthy();
        expect(pathSpec.post.summary.length).toBeGreaterThan(0);
      });

      Object.entries(openapiSpec.components.schemas).forEach(
        ([schemaName, schema]: [string, unknown]) => {
          const schemaObj = schema as Record<string, unknown>;
          const schemaWithProps = schemaObj as { properties: Record<string, { description?: string }> };
          Object.entries(schemaWithProps.properties).forEach(([propName, property]) => {
            if (property.description) {
              expect(property.description.length).toBeGreaterThan(0);
              expect(property.description.trim()).toBe(property.description);
            }
          });
        }
      );
    });
  });

  describe('Consistency Checks', () => {
    it('should have matching input/output pairs for each method', () => {
      const methods = ['moveFile', 'moveFiles', 'validateOperation', 'testAutoExposure'];

      methods.forEach((method) => {
        const inputSchema = `${method}Input`;
        const outputSchema = `${method}Output`;

        expect(openapiSpec.components.schemas).toHaveProperty(inputSchema);
        expect(openapiSpec.components.schemas).toHaveProperty(outputSchema);
      });
    });

    it('should have consistent tags across related endpoints', () => {
      const coreApiEndpoints = ['/api/move-file', '/api/move-files', '/api/validate-operation'];
      const testingEndpoints = ['/api/test-auto-exposure'];

      coreApiEndpoints.forEach((endpoint) => {
        expect(openapiSpec.paths[endpoint].post.tags).toContain('Core API');
      });

      testingEndpoints.forEach((endpoint) => {
        expect(openapiSpec.paths[endpoint].post.tags).toContain('Testing');
      });
    });

    it('should have all referenced schemas defined', () => {
      const referencedSchemas = new Set<string>();

      // Collect all $ref references
      Object.values(openapiSpec.paths).forEach((pathSpec: unknown) => {
        const spec = pathSpec as Record<string, unknown>;
        const postSpec = spec as { 
          post: { 
            requestBody?: { 
              content?: { 
                'application/json'?: { 
                  schema?: { $ref?: string } 
                } 
              } 
            };
            responses: Record<string, { 
              content?: { 
                'application/json'?: { 
                  schema?: { $ref?: string } 
                } 
              } 
            }>;
          } 
        };
        const post = postSpec.post;

        // Request body schema
        if (post.requestBody?.content?.['application/json']?.schema?.$ref) {
          const ref = post.requestBody.content['application/json'].schema.$ref;
          const schemaName = ref.replace('#/components/schemas/', '');
          referencedSchemas.add(schemaName);
        }

        // Response schemas
        Object.values(post.responses).forEach((response) => {
          if (response.content?.['application/json']?.schema?.$ref) {
            const ref = response.content['application/json'].schema.$ref;
            const schemaName = ref.replace('#/components/schemas/', '');
            referencedSchemas.add(schemaName);
          }
        });
      });

      // All referenced schemas should be defined
      referencedSchemas.forEach((schemaName) => {
        expect(openapiSpec.components.schemas).toHaveProperty(schemaName);
      });
    });
  });
});
