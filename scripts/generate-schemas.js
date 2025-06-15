#!/usr/bin/env node
/**
 * JSON Schema-First Auto-Exposure Pattern Generator
 * 
 * Implements the recommended approach from our research:
 * TypeScript AST → JSON Schema → Multi-target generation (AJV + OpenAPI + MCP + Types)
 */

import { createGenerator } from 'ts-json-schema-generator';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const GENERATED_DIR = join(ROOT_DIR, 'src', 'generated');

// Ensure generated directory exists
if (!existsSync(GENERATED_DIR)) {
  mkdirSync(GENERATED_DIR, { recursive: true });
}

/**
 * Extract method information from TypeScript source using AST parsing
 */
function extractMethodsFromTS() {
  console.log('🔍 Extracting methods with @group annotations from TypeScript...');
  
  const config = {
    path: join(ROOT_DIR, 'src/index.ts'),
    tsconfig: join(ROOT_DIR, 'tsconfig.json'),
    type: '*', // Generate for all exported types
    expose: 'export',
    topRef: true,
    jsDoc: 'extended',
    skipTypeCheck: true,
    additionalProperties: false,
  };

  try {
    const generator = createGenerator(config);
    const schema = generator.createSchema();
    
    // Extract methods that have @group annotations
    const methods = [];
    
    // Look for function definitions in the schema
    if (schema.definitions) {
      for (const [typeName, definition] of Object.entries(schema.definitions)) {
        if (definition.type === 'object' && definition.properties) {
          for (const [propName, propDef] of Object.entries(definition.properties)) {
            if (propDef.description && propDef.description.includes('@group')) {
              methods.push({
                name: propName,
                typeName,
                schema: propDef,
                group: extractGroupFromDescription(propDef.description),
                description: cleanDescription(propDef.description),
                examples: extractExamples(propDef.description)
              });
            }
          }
        }
      }
    }

    console.log(`✅ Extracted ${methods.length} methods with @group annotations`);
    return { methods, fullSchema: schema };
  } catch (error) {
    console.error('❌ Failed to extract methods:', error.message);
    throw error;
  }
}

/**
 * Alternative approach: Use file parsing to extract @group methods
 */
function extractMethodsFromFileOperations() {
  console.log('🔍 Extracting FileOperations methods with @group annotations...');
  
  // For now, manually define the core methods based on our existing codebase
  // This ensures we have a working implementation while the full AST parsing is refined
  const methods = [
    {
      name: 'moveFile',
      group: 'Core API',
      description: 'Move a single markdown file and update all references',
      inputSchema: {
        type: 'object',
        properties: {
          sourcePath: { type: 'string', description: 'Source file path' },
          destinationPath: { type: 'string', description: 'Destination file path' },
          options: {
            type: 'object',
            properties: {
              dryRun: { type: 'boolean', description: 'Show changes without executing' },
              verbose: { type: 'boolean', description: 'Show detailed output' },
              force: { type: 'boolean', description: 'Force operation even if conflicts exist' },
              createDirectories: { type: 'boolean', description: 'Create missing directories' }
            },
            additionalProperties: false
          }
        },
        required: ['sourcePath', 'destinationPath'],
        additionalProperties: false
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          modifiedFiles: { type: 'array', items: { type: 'string' } },
          createdFiles: { type: 'array', items: { type: 'string' } },
          deletedFiles: { type: 'array', items: { type: 'string' } },
          errors: { type: 'array', items: { type: 'string' } },
          warnings: { type: 'array', items: { type: 'string' } },
          changes: { type: 'array', items: { type: 'object' } }
        },
        required: ['success', 'modifiedFiles', 'createdFiles', 'deletedFiles', 'errors', 'warnings', 'changes'],
        additionalProperties: false
      },
      examples: [
        'markmv move old.md new.md',
        'markmv move docs/old.md archive/renamed.md --dry-run'
      ]
    },
    {
      name: 'moveFiles',
      group: 'Core API',
      description: 'Move multiple markdown files and update all references',
      inputSchema: {
        type: 'object',
        properties: {
          moves: {
            type: 'array',
            description: 'Array of source/destination pairs',
            items: {
              type: 'object',
              properties: {
                source: { type: 'string' },
                destination: { type: 'string' }
              },
              required: ['source', 'destination'],
              additionalProperties: false
            }
          },
          options: {
            type: 'object',
            properties: {
              dryRun: { type: 'boolean', description: 'Show changes without executing' },
              verbose: { type: 'boolean', description: 'Show detailed output' },
              force: { type: 'boolean', description: 'Force operation even if conflicts exist' },
              createDirectories: { type: 'boolean', description: 'Create missing directories' }
            },
            additionalProperties: false
          }
        },
        required: ['moves'],
        additionalProperties: false
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          modifiedFiles: { type: 'array', items: { type: 'string' } },
          createdFiles: { type: 'array', items: { type: 'string' } },
          deletedFiles: { type: 'array', items: { type: 'string' } },
          errors: { type: 'array', items: { type: 'string' } },
          warnings: { type: 'array', items: { type: 'string' } },
          changes: { type: 'array', items: { type: 'object' } }
        },
        required: ['success', 'modifiedFiles', 'createdFiles', 'deletedFiles', 'errors', 'warnings', 'changes'],
        additionalProperties: false
      },
      examples: [
        'markmv move-files --batch file1.md:new1.md file2.md:new2.md'
      ]
    },
    {
      name: 'validateOperation',
      group: 'Core API', 
      description: 'Validate the result of a previous operation for broken links',
      inputSchema: {
        type: 'object',
        properties: {
          result: {
            type: 'object',
            description: 'Operation result to validate',
            properties: {
              success: { type: 'boolean' },
              modifiedFiles: { type: 'array', items: { type: 'string' } },
              createdFiles: { type: 'array', items: { type: 'string' } },
              deletedFiles: { type: 'array', items: { type: 'string' } },
              errors: { type: 'array', items: { type: 'string' } },
              warnings: { type: 'array', items: { type: 'string' } },
              changes: { type: 'array', items: { type: 'object' } }
            },
            required: ['success', 'modifiedFiles', 'createdFiles', 'deletedFiles', 'errors', 'warnings', 'changes'],
            additionalProperties: false
          }
        },
        required: ['result'],
        additionalProperties: false
      },
      outputSchema: {
        type: 'object',
        properties: {
          valid: { type: 'boolean' },
          brokenLinks: { type: 'number' },
          errors: { type: 'array', items: { type: 'string' } }
        },
        required: ['valid', 'brokenLinks', 'errors'],
        additionalProperties: false
      },
      examples: []
    },
    {
      name: 'testAutoExposure',
      group: 'Testing',
      description: 'Test function to demonstrate auto-exposure pattern',
      inputSchema: {
        type: 'object',
        properties: {
          input: { 
            type: 'string', 
            description: 'The input message to echo' 
          }
        },
        required: ['input'],
        additionalProperties: false
      },
      outputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          timestamp: { type: 'string' },
          success: { type: 'boolean' }
        },
        required: ['message', 'timestamp', 'success'],
        additionalProperties: false
      },
      examples: ['markmv test "Hello World"']
    }
  ];

  console.log(`✅ Extracted ${methods.length} FileOperations methods`);
  return { methods };
}

/**
 * Generate JSON Schema definitions
 */
function generateJSONSchemas(methods) {
  console.log('📋 Generating JSON Schema definitions...');
  
  const schemas = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'markmv API Schemas',
    description: 'Auto-generated schemas for markmv methods with @group annotations',
    definitions: {}
  };

  for (const method of methods) {
    schemas.definitions[method.name] = {
      title: method.name,
      description: method.description,
      type: 'object',
      properties: {
        input: method.inputSchema,
        output: method.outputSchema
      },
      additionalProperties: false,
      'x-group': method.group,
      'x-examples': method.examples
    };
  }

  return schemas;
}

/**
 * Generate AJV validator code
 */
function generateAJVValidators(schemas) {
  console.log('⚡ Generating AJV validators...');
  
  const validatorCode = `/**
 * Auto-generated AJV validators for markmv API methods
 * Generated on: ${new Date().toISOString()}
 * 
 * DO NOT EDIT MANUALLY - This file is auto-generated
 */

import Ajv from 'ajv';

const ajv = new Ajv({ 
  allErrors: true, 
  verbose: true,
  strict: false 
});

// Schema definitions
export const schemas = ${JSON.stringify(schemas, null, 2)};

// Compiled validators
export const validators = {
${Object.keys(schemas.definitions).map(methodName => 
  `  ${methodName}: {
    input: ajv.compile(schemas.definitions.${methodName}.properties.input),
    output: ajv.compile(schemas.definitions.${methodName}.properties.output)
  }`
).join(',\n')}
};

/**
 * Validate input for a specific method
 */
export function validateInput(methodName: string, data: unknown): { valid: boolean; errors: string[] } {
  const validator = validators[methodName as keyof typeof validators]?.input;
  if (!validator) {
    return { valid: false, errors: [\`Unknown method: \${methodName}\`] };
  }
  
  const valid = validator(data);
  return valid ? { valid, errors: [] } : {
    valid,
    errors: validator.errors?.map(err => \`\${err.instancePath} \${err.message}\`) ?? ['Validation failed']
  };
}

/**
 * Validate output for a specific method
 */
export function validateOutput(methodName: string, data: unknown): { valid: boolean; errors: string[] } {
  const validator = validators[methodName as keyof typeof validators]?.output;
  if (!validator) {
    return { valid: false, errors: [\`Unknown method: \${methodName}\`] };
  }
  
  const valid = validator(data);
  return valid ? { valid, errors: [] } : {
    valid,
    errors: validator.errors?.map(err => \`\${err.instancePath} \${err.message}\`) ?? ['Validation failed']
  };
}

/**
 * Get list of available methods
 */
export function getAvailableMethods(): string[] {
  return Object.keys(validators);
}
`;

  return validatorCode;
}

/**
 * Generate MCP tool definitions
 */
function generateMCPTools(schemas) {
  console.log('🤖 Generating MCP tool definitions...');
  
  const mcpCode = `/**
 * Auto-generated MCP tool definitions for markmv API methods
 * Generated on: ${new Date().toISOString()}
 * 
 * DO NOT EDIT MANUALLY - This file is auto-generated
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// Auto-generated MCP tools from JSON schemas
export const autoGeneratedMcpTools: Tool[] = [
${Object.entries(schemas.definitions).map(([methodName, schema]) => {
  const toolName = camelToSnake(methodName);
  return `  {
    name: '${toolName}',
    description: ${JSON.stringify(schema.description)},
    inputSchema: ${JSON.stringify(schema.properties.input, null, 6)}
  }`;
}).join(',\n')}
];

/**
 * Get MCP tool by name
 */
export function getMcpToolByName(name: string): Tool | undefined {
  return autoGeneratedMcpTools.find(tool => tool.name === name);
}

/**
 * Get all MCP tool names
 */
export function getMcpToolNames(): string[] {
  return autoGeneratedMcpTools.map(tool => tool.name);
}

`;

  return mcpCode;
}

/**
 * Generate REST API route definitions
 */
function generateAPIRoutes(schemas) {
  console.log('🌐 Generating REST API route definitions...');
  
  const apiCode = `/**
 * Auto-generated REST API route definitions for markmv API methods
 * Generated on: ${new Date().toISOString()}
 * 
 * DO NOT EDIT MANUALLY - This file is auto-generated
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { validateInput, validateOutput } from './ajv-validators.js';
import type { FileOperations } from '../core/file-operations.js';

export interface ApiRoute {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  handler: (req: IncomingMessage, res: ServerResponse, markmvInstance: FileOperations) => Promise<void>;
  description: string;
  inputSchema: object;
  outputSchema: object;
}

// Auto-generated API routes from JSON schemas
export const autoGeneratedApiRoutes: ApiRoute[] = [
${Object.entries(schemas.definitions).map(([methodName, schema]) => {
  const routePath = `/api/${camelToKebab(methodName)}`;
  return `  {
    path: '${routePath}',
    method: 'POST',
    handler: create${methodName}Handler,
    description: ${JSON.stringify(schema.description)},
    inputSchema: ${JSON.stringify(schema.properties.input, null, 6)},
    outputSchema: ${JSON.stringify(schema.properties.output, null, 6)}
  }`;
}).join(',\n')}
];

// These handler functions will be created dynamically by the API server
// They are placeholders for the auto-generated route definitions
${Object.keys(schemas.definitions).map(methodName => `
export async function create${methodName}Handler(
  req: IncomingMessage, 
  res: ServerResponse,
  ${methodName === 'testAutoExposure' ? '_markmvInstance: FileOperations' : 'markmvInstance: FileOperations'}
): Promise<void> {
  try {
    // Parse request body
    const body = await parseRequestBody(req);
    
    // Validate input
    const inputValidation = validateInput('${methodName}', body);
    if (!inputValidation.valid) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Validation failed', 
        details: inputValidation.errors 
      }));
      return;
    }
    
    // Route to appropriate method based on methodName
    let result: unknown;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new Error('Invalid request body');
    }
    
    const bodyObj = body as Record<string, unknown>;
    
${methodName === 'moveFile' ? `
    const sourcePath = bodyObj.sourcePath;
    const destinationPath = bodyObj.destinationPath; 
    const options = bodyObj.options || {};
    
    if (typeof sourcePath === 'string' && typeof destinationPath === 'string' && 
        (typeof options === 'object' && options !== null && !Array.isArray(options))) {
      result = await markmvInstance.moveFile(sourcePath, destinationPath, options as Record<string, unknown>);
    } else {
      throw new Error('Invalid parameters for moveFile');
    }` : methodName === 'moveFiles' ? `
    const moves = bodyObj.moves;
    const options = bodyObj.options || {};
    
    if (Array.isArray(moves) && 
        (typeof options === 'object' && options !== null && !Array.isArray(options))) {
      result = await markmvInstance.moveFiles(moves, options as Record<string, unknown>);
    } else {
      throw new Error('Invalid parameters for moveFiles');
    }` : methodName === 'validateOperation' ? `
    const operationResult = bodyObj.result;
    
    if (typeof operationResult === 'object' && operationResult !== null && !Array.isArray(operationResult)) {
      // Type guard to ensure operationResult has required OperationResult properties
      const opResult = operationResult as Record<string, unknown>;
      if (typeof opResult.success === 'boolean' && 
          Array.isArray(opResult.modifiedFiles) && 
          Array.isArray(opResult.createdFiles) && 
          Array.isArray(opResult.deletedFiles) && 
          Array.isArray(opResult.errors) && 
          Array.isArray(opResult.warnings) && 
          Array.isArray(opResult.changes)) {
        result = await markmvInstance.validateOperation(opResult as unknown as import('../types/operations.js').OperationResult);
      } else {
        throw new Error('Invalid OperationResult structure');
      }
    } else {
      throw new Error('Invalid parameters for validateOperation');
    }` : methodName === 'testAutoExposure' ? `
    const input = bodyObj.input;
    
    if (typeof input === 'string') {
      // Import and call the standalone function
      const { testAutoExposure } = await import('../index.js');
      result = await testAutoExposure(input);
    } else {
      throw new Error('Invalid parameters for testAutoExposure');
    }` : `
    throw new Error('Method ${methodName} not implemented');`}
    
    // Validate output
    const outputValidation = validateOutput('${methodName}', result);
    if (!outputValidation.valid) {
      console.warn('Output validation failed for ${methodName}:', outputValidation.errors);
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Internal server error', 
      message: error instanceof Error ? error.message : String(error)
    }));
  }
}`).join('')}

/**
 * Helper functions
 */

async function parseRequestBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Get API route by path
 */
export function getApiRouteByPath(path: string): ApiRoute | undefined {
  return autoGeneratedApiRoutes.find(route => route.path === path);
}

/**
 * Get all API route paths
 */
export function getApiRoutePaths(): string[] {
  return autoGeneratedApiRoutes.map(route => route.path);
}
`;

  return apiCode;
}

/**
 * Generate OpenAPI specification
 */
function generateOpenAPISpec(schemas) {
  console.log('📜 Generating OpenAPI specification...');
  
  const openApiSpec = {
    openapi: '3.0.3',
    info: {
      title: 'markmv API',
      description: 'Auto-generated API specification for markmv methods',
      version: '1.0.0',
      contact: {
        name: 'markmv',
        url: 'https://github.com/ExaDev/markmv'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      }
    ],
    paths: {},
    components: {
      schemas: {}
    }
  };

  // Add schemas to components
  for (const [methodName, schema] of Object.entries(schemas.definitions)) {
    openApiSpec.components.schemas[`${methodName}Input`] = schema.properties.input;
    openApiSpec.components.schemas[`${methodName}Output`] = schema.properties.output;
    
    // Add path
    const routePath = `/api/${camelToKebab(methodName)}`;
    openApiSpec.paths[routePath] = {
      post: {
        summary: schema.description,
        tags: [schema['x-group'] || 'API'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: `#/components/schemas/${methodName}Input` }
            }
          }
        },
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { $ref: `#/components/schemas/${methodName}Output` }
              }
            }
          },
          '400': {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    details: { type: 'array', items: { type: 'string' } }
                  }
                }
              }
            }
          },
          '500': {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    };
  }

  return openApiSpec;
}

/**
 * Utility functions
 */
function extractGroupFromDescription(description) {
  const match = description.match(/@group\s+([^\n\r]+)/);
  return match ? match[1].trim() : 'Other';
}

function cleanDescription(description) {
  return description
    .replace(/@group\s+[^\n\r]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractExamples(description) {
  const examples = [];
  const exampleRegex = /```bash\n(.*?)\n```/gs;
  let match;
  while ((match = exampleRegex.exec(description)) !== null) {
    examples.push(match[1].trim());
  }
  return examples;
}

function camelToSnake(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function camelToKebab(str) {
  return str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting JSON Schema-First Auto-Exposure Pattern Generation...\n');

  try {
    // Extract methods (using file-based approach for now)
    const { methods } = extractMethodsFromFileOperations();
    
    // Generate JSON schemas
    const schemas = generateJSONSchemas(methods);
    writeFileSync(
      join(GENERATED_DIR, 'schemas.json'),
      JSON.stringify(schemas, null, 2)
    );
    console.log('✅ Generated schemas.json');

    // Generate AJV validators
    const ajvCode = generateAJVValidators(schemas);
    writeFileSync(
      join(GENERATED_DIR, 'ajv-validators.ts'),
      ajvCode
    );
    console.log('✅ Generated ajv-validators.ts');

    // Generate MCP tools
    const mcpCode = generateMCPTools(schemas);
    writeFileSync(
      join(GENERATED_DIR, 'mcp-tools.ts'),
      mcpCode
    );
    console.log('✅ Generated mcp-tools.ts');

    // Generate API routes
    const apiCode = generateAPIRoutes(schemas);
    writeFileSync(
      join(GENERATED_DIR, 'api-routes.ts'),
      apiCode
    );
    console.log('✅ Generated api-routes.ts');

    // Generate OpenAPI spec
    const openApiSpec = generateOpenAPISpec(schemas);
    writeFileSync(
      join(GENERATED_DIR, 'openapi.json'),
      JSON.stringify(openApiSpec, null, 2)
    );
    console.log('✅ Generated openapi.json');

    console.log(`\n🎉 Successfully generated all auto-exposure artifacts in ${GENERATED_DIR}`);
    console.log(`📊 Generated definitions for ${methods.length} methods`);
    
  } catch (error) {
    console.error('❌ Generation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}