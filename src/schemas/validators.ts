/**
 * Zod-based validators for markmv auto-exposed methods
 *
 * Drop-in replacement for the AJV-based generated validators. Uses Zod safeParse for runtime
 * input/output validation with structured error reporting.
 */

import { methodSchemas, type MethodName } from "./index.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const methodNames = new Set<string>(Object.keys(methodSchemas));

function isMethodName(name: string): name is MethodName {
  return methodNames.has(name);
}

/** Validate input for a specific method */
export function validateInput(
  methodName: string,
  data: unknown,
): ValidationResult {
  if (!isMethodName(methodName)) {
    return { valid: false, errors: [`Unknown method: ${methodName}`] };
  }

  const result = methodSchemas[methodName].input.safeParse(data);
  if (result.success) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    ),
  };
}

/** Validate output for a specific method */
export function validateOutput(
  methodName: string,
  data: unknown,
): ValidationResult {
  if (!isMethodName(methodName)) {
    return { valid: false, errors: [`Unknown method: ${methodName}`] };
  }

  const result = methodSchemas[methodName].output.safeParse(data);
  if (result.success) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    ),
  };
}
