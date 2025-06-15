/**
 * Auto-generated AJV validators for markmv API methods
 * Generated on: 2025-06-15T14:09:51.847Z
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
export const schemas = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "markmv API Schemas",
  "description": "Auto-generated schemas for markmv methods with @group annotations",
  "definitions": {
    "moveFile": {
      "title": "moveFile",
      "description": "Move a single markdown file and update all references",
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "properties": {
            "sourcePath": {
              "type": "string",
              "description": "Source file path"
            },
            "destinationPath": {
              "type": "string",
              "description": "Destination file path"
            },
            "options": {
              "type": "object",
              "properties": {
                "dryRun": {
                  "type": "boolean",
                  "description": "Show changes without executing"
                },
                "verbose": {
                  "type": "boolean",
                  "description": "Show detailed output"
                },
                "force": {
                  "type": "boolean",
                  "description": "Force operation even if conflicts exist"
                },
                "createDirectories": {
                  "type": "boolean",
                  "description": "Create missing directories"
                }
              },
              "additionalProperties": false
            }
          },
          "required": [
            "sourcePath",
            "destinationPath"
          ],
          "additionalProperties": false
        },
        "output": {
          "type": "object",
          "properties": {
            "success": {
              "type": "boolean"
            },
            "modifiedFiles": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "createdFiles": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "deletedFiles": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "errors": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "warnings": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "changes": {
              "type": "array",
              "items": {
                "type": "object"
              }
            }
          },
          "required": [
            "success",
            "modifiedFiles",
            "createdFiles",
            "deletedFiles",
            "errors",
            "warnings",
            "changes"
          ],
          "additionalProperties": false
        }
      },
      "additionalProperties": false,
      "x-group": "Core API",
      "x-examples": [
        "markmv move old.md new.md",
        "markmv move docs/old.md archive/renamed.md --dry-run"
      ]
    },
    "moveFiles": {
      "title": "moveFiles",
      "description": "Move multiple markdown files and update all references",
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "properties": {
            "moves": {
              "type": "array",
              "description": "Array of source/destination pairs",
              "items": {
                "type": "object",
                "properties": {
                  "source": {
                    "type": "string"
                  },
                  "destination": {
                    "type": "string"
                  }
                },
                "required": [
                  "source",
                  "destination"
                ],
                "additionalProperties": false
              }
            },
            "options": {
              "type": "object",
              "properties": {
                "dryRun": {
                  "type": "boolean",
                  "description": "Show changes without executing"
                },
                "verbose": {
                  "type": "boolean",
                  "description": "Show detailed output"
                },
                "force": {
                  "type": "boolean",
                  "description": "Force operation even if conflicts exist"
                },
                "createDirectories": {
                  "type": "boolean",
                  "description": "Create missing directories"
                }
              },
              "additionalProperties": false
            }
          },
          "required": [
            "moves"
          ],
          "additionalProperties": false
        },
        "output": {
          "type": "object",
          "properties": {
            "success": {
              "type": "boolean"
            },
            "modifiedFiles": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "createdFiles": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "deletedFiles": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "errors": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "warnings": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "changes": {
              "type": "array",
              "items": {
                "type": "object"
              }
            }
          },
          "required": [
            "success",
            "modifiedFiles",
            "createdFiles",
            "deletedFiles",
            "errors",
            "warnings",
            "changes"
          ],
          "additionalProperties": false
        }
      },
      "additionalProperties": false,
      "x-group": "Core API",
      "x-examples": [
        "markmv move-files --batch file1.md:new1.md file2.md:new2.md"
      ]
    },
    "validateOperation": {
      "title": "validateOperation",
      "description": "Validate the result of a previous operation for broken links",
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "properties": {
            "result": {
              "type": "object",
              "description": "Operation result to validate",
              "properties": {
                "success": {
                  "type": "boolean"
                },
                "modifiedFiles": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "createdFiles": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "deletedFiles": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "errors": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "warnings": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "changes": {
                  "type": "array",
                  "items": {
                    "type": "object"
                  }
                }
              },
              "required": [
                "success",
                "modifiedFiles",
                "createdFiles",
                "deletedFiles",
                "errors",
                "warnings",
                "changes"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "result"
          ],
          "additionalProperties": false
        },
        "output": {
          "type": "object",
          "properties": {
            "valid": {
              "type": "boolean"
            },
            "brokenLinks": {
              "type": "number"
            },
            "errors": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          "required": [
            "valid",
            "brokenLinks",
            "errors"
          ],
          "additionalProperties": false
        }
      },
      "additionalProperties": false,
      "x-group": "Core API",
      "x-examples": []
    },
    "testAutoExposure": {
      "title": "testAutoExposure",
      "description": "Test function to demonstrate auto-exposure pattern",
      "type": "object",
      "properties": {
        "input": {
          "type": "object",
          "properties": {
            "input": {
              "type": "string",
              "description": "The input message to echo"
            }
          },
          "required": [
            "input"
          ],
          "additionalProperties": false
        },
        "output": {
          "type": "object",
          "properties": {
            "message": {
              "type": "string"
            },
            "timestamp": {
              "type": "string"
            },
            "success": {
              "type": "boolean"
            }
          },
          "required": [
            "message",
            "timestamp",
            "success"
          ],
          "additionalProperties": false
        }
      },
      "additionalProperties": false,
      "x-group": "Testing",
      "x-examples": [
        "markmv test \"Hello World\""
      ]
    }
  }
};

// Compiled validators
export const validators = {
  moveFile: {
    input: ajv.compile(schemas.definitions.moveFile.properties.input),
    output: ajv.compile(schemas.definitions.moveFile.properties.output)
  },
  moveFiles: {
    input: ajv.compile(schemas.definitions.moveFiles.properties.input),
    output: ajv.compile(schemas.definitions.moveFiles.properties.output)
  },
  validateOperation: {
    input: ajv.compile(schemas.definitions.validateOperation.properties.input),
    output: ajv.compile(schemas.definitions.validateOperation.properties.output)
  },
  testAutoExposure: {
    input: ajv.compile(schemas.definitions.testAutoExposure.properties.input),
    output: ajv.compile(schemas.definitions.testAutoExposure.properties.output)
  }
};

/**
 * Validate input for a specific method
 */
export function validateInput(methodName: string, data: unknown): { valid: boolean; errors: string[] } {
  const validator = validators[methodName as keyof typeof validators]?.input;
  if (!validator) {
    return { valid: false, errors: [`Unknown method: ${methodName}`] };
  }
  
  const valid = validator(data);
  return valid ? { valid, errors: [] } : {
    valid,
    errors: validator.errors?.map(err => `${err.instancePath} ${err.message}`) ?? ['Validation failed']
  };
}

/**
 * Validate output for a specific method
 */
export function validateOutput(methodName: string, data: unknown): { valid: boolean; errors: string[] } {
  const validator = validators[methodName as keyof typeof validators]?.output;
  if (!validator) {
    return { valid: false, errors: [`Unknown method: ${methodName}`] };
  }
  
  const valid = validator(data);
  return valid ? { valid, errors: [] } : {
    valid,
    errors: validator.errors?.map(err => `${err.instancePath} ${err.message}`) ?? ['Validation failed']
  };
}

/**
 * Get list of available methods
 */
export function getAvailableMethods(): string[] {
  return Object.keys(validators);
}
