/**
 * TypeScript types for API interfaces
 *
 * Defines common request/response types for REST API and other programmatic interfaces.
 */

import type {
  MoveOperationOptions,
  SplitOperationOptions,
  JoinOperationOptions,
  MergeOperationOptions,
  ConvertOperationOptions,
  OperationResult,
} from './operations.js';

/** Standard API response wrapper */
export interface ApiResponse<T = unknown> {
  /** Whether the request was successful */
  success: boolean;
  /** Response data */
  data?: T;
  /** Error message if unsuccessful */
  error?: string;
  /** Additional error details */
  details?: string[];
  /** Request timestamp */
  timestamp: string;
}

/** Request to move a single file */
export interface MoveFileRequest {
  /** Source file path */
  source: string;
  /** Destination file path */
  destination: string;
  /** Move operation options */
  options?: MoveOperationOptions;
}

/** Request to move multiple files */
export interface MoveFilesRequest {
  /** Array of source/destination pairs */
  moves: Array<{ source: string; destination: string }>;
  /** Move operation options */
  options?: MoveOperationOptions;
}

/** Request to convert link formats */
export interface ConvertLinksRequest {
  /** File pattern to process (e.g., "docs/all-files.md") */
  pattern: string;
  /** Convert operation options */
  options?: ConvertOperationOptions;
}

/** Request to split a file */
export interface SplitFileRequest {
  /** Path to the file to split */
  filePath: string;
  /** Split operation options */
  options: SplitOperationOptions;
}

/** Request to join files */
export interface JoinFilesRequest {
  /** Array of file paths to join */
  filePaths: string[];
  /** Join operation options */
  options: JoinOperationOptions;
}

/** Request to merge files */
export interface MergeFilesRequest {
  /** Array of file paths to merge */
  filePaths: string[];
  /** Target file path for merged content */
  targetPath: string;
  /** Merge operation options */
  options: MergeOperationOptions;
}

/** Request to validate an operation result */
export interface ValidateOperationRequest {
  /** Operation result to validate */
  result: OperationResult;
}

/** Response for validation requests */
export interface ValidationResult {
  /** Whether all links are valid */
  valid: boolean;
  /** Number of broken links found */
  brokenLinks: number;
  /** Array of error messages */
  errors: string[];
}

/** Health check response */
export interface HealthResponse {
  /** Service status */
  status: 'ok' | 'error';
  /** Service version */
  version: string;
  /** Uptime in milliseconds */
  uptime: number;
  /** Additional service information */
  info?: Record<string, unknown>;
}

/** Error response for invalid requests */
export interface ErrorResponse {
  /** Error type */
  error: string;
  /** Detailed error message */
  message: string;
  /** HTTP status code */
  statusCode: number;
  /** Additional error details */
  details?: string[];
}
