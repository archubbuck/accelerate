export type ErrorDetails = Readonly<Record<string, unknown>>;
export interface ErrorOptions { code: string; message: string; status?: number; details?: ErrorDetails; cause?: unknown; }
export class ApplicationError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: ErrorDetails;
  constructor(options: ErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "ApplicationError";
    this.code = options.code;
    this.status = options.status ?? 500;
    this.details = options.details;
    if (!/^[A-Z][A-Z0-9_]*$/.test(this.code)) throw new TypeError("Error code must be uppercase snake case");
    if (!Number.isInteger(this.status) || this.status < 400 || this.status > 599) throw new RangeError("HTTP error status must be 400-599");
  }
}
export interface ErrorResponse { error: { code: string; message: string; details?: ErrorDetails }; }
export function toErrorResponse(error: unknown, options: { exposeInternal?: boolean } = {}): { status: number; body: ErrorResponse } {
  if (error instanceof ApplicationError) {
    return { status: error.status, body: { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } } };
  }
  return { status: 500, body: { error: { code: "INTERNAL_ERROR", message: options.exposeInternal && error instanceof Error ? error.message : "An unexpected error occurred" } } };
}
export function isApplicationError(error: unknown): error is ApplicationError { return error instanceof ApplicationError; }
