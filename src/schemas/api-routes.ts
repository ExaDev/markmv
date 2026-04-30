/**
 * REST API route definitions derived from Zod schemas
 *
 * Replaces the generated api-routes.ts. Route handlers use Zod safeParse
 * for input validation and z.toJSONSchema() for schema metadata.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import * as z from 'zod';
import { methodSchemas, type MethodName } from './index.js';
import { validateOutput } from './validators.js';
import type { FileOperations } from '../core/file-operations.js';

export interface ApiRoute {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  handler: (req: IncomingMessage, res: ServerResponse, markmvInstance: FileOperations) => Promise<void>;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

/** Convert camelCase to kebab-case for REST path naming */
function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** Parse request body from IncomingMessage */
async function parseRequestBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/** Convert Zod-inferred optional properties to match exactOptionalPropertyTypes interfaces */
function toMoveOptions(data: {
  dryRun?: boolean | undefined;
  verbose?: boolean | undefined;
  force?: boolean | undefined;
  createDirectories?: boolean | undefined;
}): import('../types/operations.js').MoveOperationOptions {
  const result: import('../types/operations.js').MoveOperationOptions = {};
  if (data.dryRun !== undefined) result.dryRun = data.dryRun;
  if (data.verbose !== undefined) result.verbose = data.verbose;
  if (data.force !== undefined) result.force = data.force;
  if (data.createDirectories !== undefined) result.createDirectories = data.createDirectories;
  return result;
}

/** Convert Zod-inferred OperationResult to match the TS interface with exactOptionalPropertyTypes */
function toOperationResult(data: {
  success: boolean;
  modifiedFiles: string[];
  createdFiles: string[];
  deletedFiles: string[];
  errors: string[];
  warnings: string[];
  changes: Array<{
    type: 'file-moved' | 'file-created' | 'file-deleted' | 'link-updated' | 'content-modified';
    filePath: string;
    oldValue?: string | undefined;
    newValue?: string | undefined;
    line?: number | undefined;
  }>;
}): import('../types/operations.js').OperationResult {
  return {
    success: data.success,
    modifiedFiles: data.modifiedFiles,
    createdFiles: data.createdFiles,
    deletedFiles: data.deletedFiles,
    errors: data.errors,
    warnings: data.warnings,
    changes: data.changes.map((change) => {
      const result: import('../types/operations.js').OperationChange = {
        type: change.type,
        filePath: change.filePath,
      };
      if (change.oldValue !== undefined) result.oldValue = change.oldValue;
      if (change.newValue !== undefined) result.newValue = change.newValue;
      if (change.line !== undefined) result.line = change.line;
      return result;
    }),
  };
}

/** Create a route handler for a method that delegates to markmvInstance */
function createHandler(
  methodName: MethodName,
  dispatch: (markmvInstance: FileOperations, validatedInput: unknown) => Promise<unknown>
): (req: IncomingMessage, res: ServerResponse, markmvInstance: FileOperations) => Promise<void> {
  return async (req: IncomingMessage, res: ServerResponse, markmvInstance: FileOperations) => {
    try {
      const body = await parseRequestBody(req);

      const parseResult = methodSchemas[methodName].input.safeParse(body);
      if (!parseResult.success) {
        const errors = parseResult.error.issues.map(
          (issue) => `${issue.path.join('.')}: ${issue.message}`
        );
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Validation failed', details: errors }));
        return;
      }

      const result = await dispatch(markmvInstance, parseResult.data);

      const outputValidation = validateOutput(methodName, result);
      if (!outputValidation.valid) {
        console.warn(`Output validation failed for ${methodName}:`, outputValidation.errors);
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
  };
}

/** Build API routes from Zod schemas at runtime */
function buildApiRoutes(): ApiRoute[] {
  const dispatchers: Record<MethodName, (markmvInstance: FileOperations, validatedInput: unknown) => Promise<unknown>> = {
    moveFile: async (markmv, validatedInput) => {
      const data = validatedInput as z.infer<typeof methodSchemas.moveFile.input>;
      return markmv.moveFile(data.sourcePath, data.destinationPath, toMoveOptions(data.options ?? {}));
    },
    moveFiles: async (markmv, validatedInput) => {
      const data = validatedInput as z.infer<typeof methodSchemas.moveFiles.input>;
      return markmv.moveFiles(data.moves, toMoveOptions(data.options ?? {}));
    },
    validateOperation: async (markmv, validatedInput) => {
      const data = validatedInput as z.infer<typeof methodSchemas.validateOperation.input>;
      return markmv.validateOperation(toOperationResult(data.result));
    },
    testAutoExposure: async (_markmv, validatedInput) => {
      const { testAutoExposure } = await import('../index.js');
      const data = validatedInput as z.infer<typeof methodSchemas.testAutoExposure.input>;
      return testAutoExposure(data.input);
    },
  };

  const routes: ApiRoute[] = [];

  for (const [methodName, schemas] of Object.entries(methodSchemas)) {
    const typedName = methodName as MethodName;
    const inputSchema = z.toJSONSchema(schemas.input, { target: 'openapi-3.0', unrepresentable: 'any' });
    const outputSchema = z.toJSONSchema(schemas.output, { target: 'openapi-3.0', unrepresentable: 'any' });
    const desc = inputSchema.description;
    const description = typeof desc === 'string' ? desc : '';

    routes.push({
      path: `/api/${camelToKebab(methodName)}`,
      method: 'POST',
      handler: createHandler(typedName, dispatchers[typedName]),
      description,
      inputSchema,
      outputSchema,
    });
  }

  return routes;
}

export const autoGeneratedApiRoutes: ApiRoute[] = buildApiRoutes();

/** Get API route by path */
export function getApiRouteByPath(path: string): ApiRoute | undefined {
  return autoGeneratedApiRoutes.find((route) => route.path === path);
}

/** Get all API route paths */
export function getApiRoutePaths(): string[] {
  return autoGeneratedApiRoutes.map((route) => route.path);
}
