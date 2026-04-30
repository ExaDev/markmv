/**
 * OpenAPI specification derived from Zod schemas
 *
 * Replaces the generated openapi.json. The spec is built at runtime
 * from Zod schemas using z.toJSONSchema() with the openapi-3.0 target.
 */

import * as z from 'zod';
import { methodSchemas } from './index.js';

/** Convert camelCase to kebab-case for REST path naming */
function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** Derive the description from the schema's JSON Schema output */
function getDescription(schema: z.ZodType): string {
  const jsonSchema = z.toJSONSchema(schema, { unrepresentable: 'any' });
  const desc = jsonSchema.description;
  return typeof desc === 'string' ? desc : '';
}

/** Build OpenAPI specification from Zod schemas at runtime */
export function buildOpenApiSpec(): object {
  const componentSchemas: Record<string, unknown> = {};
  const paths: Record<string, unknown> = {};

  for (const [methodName, methodDef] of Object.entries(methodSchemas)) {
    const inputSchema = z.toJSONSchema(methodDef.input, {
      target: 'openapi-3.0',
      unrepresentable: 'any',
    });
    const outputSchema = z.toJSONSchema(methodDef.output, {
      target: 'openapi-3.0',
      unrepresentable: 'any',
    });
    const description = getDescription(methodDef.input);

    componentSchemas[`${methodName}Input`] = inputSchema;
    componentSchemas[`${methodName}Output`] = outputSchema;

    const routePath = `/api/${camelToKebab(methodName)}`;
    paths[routePath] = {
      post: {
        summary: description,
        tags: ['API'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: `#/components/schemas/${methodName}Input` },
            },
          },
        },
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { $ref: `#/components/schemas/${methodName}Output` },
              },
            },
          },
          '400': {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    details: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          '500': {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    };
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'markmv API',
      description: 'Auto-generated API specification for markmv methods',
      version: '1.0.0',
      contact: {
        name: 'markmv',
        url: 'https://github.com/ExaDev/markmv',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    paths,
    components: {
      schemas: componentSchemas,
    },
  };
}
