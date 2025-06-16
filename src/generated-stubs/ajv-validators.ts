/**
 * Stub file for ajv-validators to resolve Windows compilation issues
 */

export function validateInput(_method: string, _args: any): { valid: boolean; errors?: string[] } {
  return { valid: true };
}

export function validateOutput(_method: string, _result: any): { valid: boolean; errors?: string[] } {
  return { valid: true };
}