/**
 * Zod schemas for markmv auto-exposed methods
 *
 * Single source of truth for input/output validation and JSON Schema derivation. MCP tool
 * definitions, REST route schemas, OpenAPI spec, and TypeScript types are all derived from these
 * schemas.
 */

import * as z from 'zod';

// ── Shared option schemas ──────────────────────────────────────────────────

const OperationOptionsSchema = z
  .object({
    dryRun: z.boolean().meta({ description: 'Show changes without executing' }).optional(),
    verbose: z.boolean().meta({ description: 'Show detailed output' }).optional(),
    force: z.boolean().meta({ description: 'Force operation even if conflicts exist' }).optional(),
  })
  .strict();

const MoveOptionsSchema = OperationOptionsSchema.extend({
  createDirectories: z.boolean().meta({ description: 'Create missing directories' }).optional(),
  obsidian: z
    .boolean()
    .meta({
      description:
        'Treat wikilinks as Obsidian vault links: resolve by note basename and rewrite on rename',
    })
    .optional(),
  discoverySeeds: z
    .array(z.string())
    .meta({
      description:
        'Extra paths anchoring bystander discovery wider than the move span; an in-place rename spans one directory, which would miss bystanders above it',
    })
    .optional(),
});

// ── Shared result schemas ───────────────────────────────────────────────────

const OperationChangeSchema = z.object({
  type: z.enum(['file-moved', 'file-created', 'file-deleted', 'link-updated', 'content-modified']),
  filePath: z.string(),
  oldValue: z.string().optional(),
  newValue: z.string().optional(),
  line: z.number().int().optional(),
});

const ParseFailureSchema = z.object({
  file: z.string().meta({ description: 'File that failed to parse' }),
  error: z.string().meta({ description: 'Parse error message' }),
  stack: z.string().meta({ description: 'Parse error stack, when available' }).optional(),
});

const OperationResultSchema = z
  .object({
    success: z.boolean(),
    modifiedFiles: z.array(z.string()),
    createdFiles: z.array(z.string()),
    deletedFiles: z.array(z.string()),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
    changes: z.array(OperationChangeSchema),
    parseFailures: z
      .array(ParseFailureSchema)
      .meta({
        description: 'Files that failed to parse; their links were not checked or rewritten',
      })
      .optional(),
  })
  .strict();

// ── Method schemas ─────────────────────────────────────────────────────────

export const moveFileInput = z
  .object({
    sourcePath: z.string().meta({ description: 'Source file path' }),
    destinationPath: z.string().meta({ description: 'Destination file path' }),
    options: MoveOptionsSchema.optional(),
  })
  .strict()
  .meta({
    description: 'Move a single markdown file and update all references',
    examples: ['markmv move old.md new.md', 'markmv move docs/old.md archive/renamed.md --dry-run'],
  });

export const moveFileOutput = OperationResultSchema;

export const moveFilesInput = z
  .object({
    moves: z
      .array(
        z
          .object({
            source: z.string(),
            destination: z.string(),
          })
          .strict()
      )
      .meta({ description: 'Array of source/destination pairs' }),
    options: MoveOptionsSchema.optional(),
  })
  .strict()
  .meta({
    description: 'Move multiple markdown files and update all references',
    examples: ['markmv move-files --batch file1.md:new1.md file2.md:new2.md'],
  });

export const moveFilesOutput = OperationResultSchema;

export const validateOperationInput = z
  .object({
    result: OperationResultSchema.meta({ description: 'Operation result to validate' }),
  })
  .strict()
  .meta({
    description: 'Validate the result of a previous operation for broken links',
  });

export const validateOperationOutput = z
  .object({
    valid: z.boolean(),
    brokenLinks: z.number().int(),
    errors: z.array(z.string()),
  })
  .strict();

export const testAutoExposureInput = z
  .object({
    input: z.string().meta({ description: 'The input message to echo' }),
  })
  .strict()
  .meta({
    description: 'Test function to demonstrate auto-exposure pattern',
  });

export const testAutoExposureOutput = z
  .object({
    message: z.string(),
    timestamp: z.string(),
    success: z.boolean(),
  })
  .strict();

// ── Method registry ────────────────────────────────────────────────────────

/** Maps camelCase method names to their input/output Zod schemas */
export const methodSchemas = {
  moveFile: { input: moveFileInput, output: moveFileOutput } as const,
  moveFiles: { input: moveFilesInput, output: moveFilesOutput } as const,
  validateOperation: { input: validateOperationInput, output: validateOperationOutput } as const,
  testAutoExposure: { input: testAutoExposureInput, output: testAutoExposureOutput } as const,
} as const;

export type MethodName = keyof typeof methodSchemas;

/**
 * Type guard for method names obtained from runtime key iteration (Object.keys/Object.entries),
 * whose TypeScript signatures only produce `string`.
 */
export function isMethodName(name: string): name is MethodName {
  return name in methodSchemas;
}

// ── Inferred types ──────────────────────────────────────────────────────────

export type MoveFileInput = z.infer<typeof moveFileInput>;
export type MoveFileOutput = z.infer<typeof moveFileOutput>;
export type MoveFilesInput = z.infer<typeof moveFilesInput>;
export type MoveFilesOutput = z.infer<typeof moveFilesOutput>;
export type ValidateOperationInput = z.infer<typeof validateOperationInput>;
export type ValidateOperationOutput = z.infer<typeof validateOperationOutput>;
export type TestAutoExposureInput = z.infer<typeof testAutoExposureInput>;
export type TestAutoExposureOutput = z.infer<typeof testAutoExposureOutput>;
