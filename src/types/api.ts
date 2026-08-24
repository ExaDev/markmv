/**
 * TypeScript types for API interfaces
 *
 * Defines common request/response types for REST API and other programmatic interfaces.
 */

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

/** Health check response */
export interface HealthResponse {
  /** Service status */
  status: "ok" | "error";
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
