/**
 * Auto-generated REST API route definitions for markmv API methods
 *
 * DO NOT EDIT MANUALLY - This file is auto-generated
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { validateInput, validateOutput } from './ajv-validators.js';
import type { FileOperations } from '../core/file-operations.js';

export interface ApiRoute {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    markmvInstance: FileOperations
  ) => Promise<void>;
  description: string;
  inputSchema: object;
  outputSchema: object;
}

// Auto-generated API routes from JSON schemas
export const autoGeneratedApiRoutes: ApiRoute[] = [
  {
    path: '/api/move-file',
    method: 'POST',
    handler: createmoveFileHandler,
    description: 'Move a single markdown file and update all references',
    inputSchema: {
      type: 'object',
      properties: {
        sourcePath: {
          type: 'string',
          description: 'Source file path',
        },
        destinationPath: {
          type: 'string',
          description: 'Destination file path',
        },
        options: {
          type: 'object',
          properties: {
            dryRun: {
              type: 'boolean',
              description: 'Show changes without executing',
            },
            verbose: {
              type: 'boolean',
              description: 'Show detailed output',
            },
            force: {
              type: 'boolean',
              description: 'Force operation even if conflicts exist',
            },
            createDirectories: {
              type: 'boolean',
              description: 'Create missing directories',
            },
          },
          additionalProperties: false,
        },
      },
      required: ['sourcePath', 'destinationPath'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
        },
        modifiedFiles: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        createdFiles: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        deletedFiles: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        errors: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        warnings: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        changes: {
          type: 'array',
          items: {
            type: 'object',
          },
        },
      },
      required: [
        'success',
        'modifiedFiles',
        'createdFiles',
        'deletedFiles',
        'errors',
        'warnings',
        'changes',
      ],
      additionalProperties: false,
    },
  },
  {
    path: '/api/move-files',
    method: 'POST',
    handler: createmoveFilesHandler,
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
              source: {
                type: 'string',
              },
              destination: {
                type: 'string',
              },
            },
            required: ['source', 'destination'],
            additionalProperties: false,
          },
        },
        options: {
          type: 'object',
          properties: {
            dryRun: {
              type: 'boolean',
              description: 'Show changes without executing',
            },
            verbose: {
              type: 'boolean',
              description: 'Show detailed output',
            },
            force: {
              type: 'boolean',
              description: 'Force operation even if conflicts exist',
            },
            createDirectories: {
              type: 'boolean',
              description: 'Create missing directories',
            },
          },
          additionalProperties: false,
        },
      },
      required: ['moves'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
        },
        modifiedFiles: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        createdFiles: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        deletedFiles: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        errors: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        warnings: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        changes: {
          type: 'array',
          items: {
            type: 'object',
          },
        },
      },
      required: [
        'success',
        'modifiedFiles',
        'createdFiles',
        'deletedFiles',
        'errors',
        'warnings',
        'changes',
      ],
      additionalProperties: false,
    },
  },
  {
    path: '/api/validate-operation',
    method: 'POST',
    handler: createvalidateOperationHandler,
    description: 'Validate the result of a previous operation for broken links',
    inputSchema: {
      type: 'object',
      properties: {
        result: {
          type: 'object',
          description: 'Operation result to validate',
          properties: {
            success: {
              type: 'boolean',
            },
            modifiedFiles: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            createdFiles: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            deletedFiles: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            errors: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            warnings: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            changes: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
          },
          required: [
            'success',
            'modifiedFiles',
            'createdFiles',
            'deletedFiles',
            'errors',
            'warnings',
            'changes',
          ],
          additionalProperties: false,
        },
      },
      required: ['result'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        valid: {
          type: 'boolean',
        },
        brokenLinks: {
          type: 'number',
        },
        errors: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
      },
      required: ['valid', 'brokenLinks', 'errors'],
      additionalProperties: false,
    },
  },
  {
    path: '/api/test-auto-exposure',
    method: 'POST',
    handler: createtestAutoExposureHandler,
    description: 'Test function to demonstrate auto-exposure pattern',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'The input message to echo',
        },
      },
      required: ['input'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
        },
        timestamp: {
          type: 'string',
        },
        success: {
          type: 'boolean',
        },
      },
      required: ['message', 'timestamp', 'success'],
      additionalProperties: false,
    },
  },
];

// These handler functions will be created dynamically by the API server
// They are placeholders for the auto-generated route definitions

export async function createmoveFileHandler(
  req: IncomingMessage,
  res: ServerResponse,
  markmvInstance: FileOperations
): Promise<void> {
  try {
    // Parse request body
    const body = await parseRequestBody(req);

    // Validate input
    const inputValidation = validateInput('moveFile', body);
    if (!inputValidation.valid) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Validation failed',
          details: inputValidation.errors,
        })
      );
      return;
    }

    // Route to appropriate method based on methodName
    let result: unknown;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new Error('Invalid request body');
    }

    const bodyObj = body as Record<string, unknown>;

    const sourcePath = bodyObj.sourcePath;
    const destinationPath = bodyObj.destinationPath;
    const options = bodyObj.options || {};

    if (
      typeof sourcePath === 'string' &&
      typeof destinationPath === 'string' &&
      typeof options === 'object' &&
      options !== null &&
      !Array.isArray(options)
    ) {
      result = await markmvInstance.moveFile(
        sourcePath,
        destinationPath,
        options as Record<string, unknown>
      );
    } else {
      throw new Error('Invalid parameters for moveFile');
    }

    // Validate output
    const outputValidation = validateOutput('moveFile', result);
    if (!outputValidation.valid) {
      console.warn('Output validation failed for moveFile:', outputValidation.errors);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      })
    );
  }
}
export async function createmoveFilesHandler(
  req: IncomingMessage,
  res: ServerResponse,
  markmvInstance: FileOperations
): Promise<void> {
  try {
    // Parse request body
    const body = await parseRequestBody(req);

    // Validate input
    const inputValidation = validateInput('moveFiles', body);
    if (!inputValidation.valid) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Validation failed',
          details: inputValidation.errors,
        })
      );
      return;
    }

    // Route to appropriate method based on methodName
    let result: unknown;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new Error('Invalid request body');
    }

    const bodyObj = body as Record<string, unknown>;

    const moves = bodyObj.moves;
    const options = bodyObj.options || {};

    if (
      Array.isArray(moves) &&
      typeof options === 'object' &&
      options !== null &&
      !Array.isArray(options)
    ) {
      result = await markmvInstance.moveFiles(moves, options as Record<string, unknown>);
    } else {
      throw new Error('Invalid parameters for moveFiles');
    }

    // Validate output
    const outputValidation = validateOutput('moveFiles', result);
    if (!outputValidation.valid) {
      console.warn('Output validation failed for moveFiles:', outputValidation.errors);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      })
    );
  }
}
export async function createvalidateOperationHandler(
  req: IncomingMessage,
  res: ServerResponse,
  markmvInstance: FileOperations
): Promise<void> {
  try {
    // Parse request body
    const body = await parseRequestBody(req);

    // Validate input
    const inputValidation = validateInput('validateOperation', body);
    if (!inputValidation.valid) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Validation failed',
          details: inputValidation.errors,
        })
      );
      return;
    }

    // Route to appropriate method based on methodName
    let result: unknown;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new Error('Invalid request body');
    }

    const bodyObj = body as Record<string, unknown>;

    const operationResult = bodyObj.result;

    if (
      typeof operationResult === 'object' &&
      operationResult !== null &&
      !Array.isArray(operationResult)
    ) {
      // Type guard to ensure operationResult has required OperationResult properties
      const opResult = operationResult as Record<string, unknown>;
      if (
        typeof opResult.success === 'boolean' &&
        Array.isArray(opResult.modifiedFiles) &&
        Array.isArray(opResult.createdFiles) &&
        Array.isArray(opResult.deletedFiles) &&
        Array.isArray(opResult.errors) &&
        Array.isArray(opResult.warnings) &&
        Array.isArray(opResult.changes)
      ) {
        result = await markmvInstance.validateOperation(
          opResult as unknown as import('../types/operations.js').OperationResult
        );
      } else {
        throw new Error('Invalid OperationResult structure');
      }
    } else {
      throw new Error('Invalid parameters for validateOperation');
    }

    // Validate output
    const outputValidation = validateOutput('validateOperation', result);
    if (!outputValidation.valid) {
      console.warn('Output validation failed for validateOperation:', outputValidation.errors);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      })
    );
  }
}
export async function createtestAutoExposureHandler(
  req: IncomingMessage,
  res: ServerResponse,
  _markmvInstance: FileOperations
): Promise<void> {
  try {
    // Parse request body
    const body = await parseRequestBody(req);

    // Validate input
    const inputValidation = validateInput('testAutoExposure', body);
    if (!inputValidation.valid) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Validation failed',
          details: inputValidation.errors,
        })
      );
      return;
    }

    // Route to appropriate method based on methodName
    let result: unknown;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new Error('Invalid request body');
    }

    const bodyObj = body as Record<string, unknown>;

    const input = bodyObj.input;

    if (typeof input === 'string') {
      // Import and call the standalone function
      const { testAutoExposure } = await import('../index.js');
      result = await testAutoExposure(input);
    } else {
      throw new Error('Invalid parameters for testAutoExposure');
    }

    // Validate output
    const outputValidation = validateOutput('testAutoExposure', result);
    if (!outputValidation.valid) {
      console.warn('Output validation failed for testAutoExposure:', outputValidation.errors);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      })
    );
  }
}

/** Helper functions */

async function parseRequestBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
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

/** Get API route by path */
export function getApiRouteByPath(path: string): ApiRoute | undefined {
  return autoGeneratedApiRoutes.find((route) => route.path === path);
}

/** Get all API route paths */
export function getApiRoutePaths(): string[] {
  return autoGeneratedApiRoutes.map((route) => route.path);
}
