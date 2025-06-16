/** Stub file for ajv-validators to resolve Windows compilation issues */

export function validateInput(
  _method: string,
  _args: unknown
): { valid: boolean; errors?: string[] } {
  return { valid: true };
}

export function validateOutput(
  _method: string,
  _result: unknown
): { valid: boolean; errors?: string[] } {
  return { valid: true };
}
