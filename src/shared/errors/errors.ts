// Error codes of kitvas and their one mapping to exit codes and HTTP statuses.

export const ERROR_TABLE = {
  INTERNAL: { exit: 1, http: 500 },
  USAGE: { exit: 2, http: 400 },
  CONFIG_INVALID: { exit: 3, http: 422 },
  DEPS_MISSING: { exit: 4, http: 500 },
  NODE_UNSUPPORTED: { exit: 5, http: 500 },
  KIT_NOT_FOUND: { exit: 6, http: 404 },
  KIT_INVALID: { exit: 7, http: 422 },
  KIT_COMPONENT_NOT_FOUND: { exit: 8, http: 404 },
  DRAFT_NOT_FOUND: { exit: 9, http: 404 },
  DRAFT_EXISTS: { exit: 10, http: 409 },
  DRAFT_INVALID: { exit: 11, http: 422 },
  SECTION_NOT_FOUND: { exit: 12, http: 404 },
  WORKSPACE_MISSING: { exit: 13, http: 409 },
  BROWSER_MISSING: { exit: 14, http: 503 },
  BROWSER_INSTALL_FAILED: { exit: 15, http: 500 },
  REQUEST_INVALID: { exit: 16, http: 400 },
  REQUEST_FORBIDDEN: { exit: 17, http: 403 },
  TOKEN_INVALID: { exit: 18, http: 401 },
  ROUTE_NOT_FOUND: { exit: 19, http: 404 },
  METHOD_NOT_ALLOWED: { exit: 20, http: 405 },
  PRECONDITION_FAILED: { exit: 21, http: 412 },
  BODY_TOO_LARGE: { exit: 22, http: 413 },
  MEDIA_TYPE_UNSUPPORTED: { exit: 23, http: 415 },
  BODY_INVALID: { exit: 24, http: 422 },
  PRECONDITION_REQUIRED: { exit: 25, http: 428 },
  VERSION_NOT_FOUND: { exit: 26, http: 404 },
  STUDIO_START_FAILED: { exit: 27, http: 500 },
  JOB_RUNNING: { exit: 28, http: 409 },
  JOB_NOT_FOUND: { exit: 29, http: 404 },
  JOB_LIMIT: { exit: 30, http: 500 },
  JOB_CRASHED: { exit: 31, http: 500 },
  STREAM_LIMIT: { exit: 32, http: 503 },
  INBOX_FULL: { exit: 33, http: 409 },
  KIT_PACKAGE_MISSING: { exit: 34, http: 422 },
  KIT_EXISTS: { exit: 35, http: 409 },
  KIT_SOURCE_INVALID: { exit: 36, http: 422 },
  SCAN_BLOCKED: { exit: 37, http: 422 },
  SCAN_FAILED: { exit: 38, http: 502 },
  PLUGIN_FOLDER: { exit: 39, http: 409 },
  GUIDELINE_UNKNOWN: { exit: 40, http: 404 },
  ADDITION_EXISTS: { exit: 41, http: 409 },
  ADDITION_INVALID: { exit: 42, http: 422 },
  DRAFT_KIND: { exit: 43, http: 409 },
  SKETCH_UNKNOWN: { exit: 44, http: 404 },
  EXPORT_EXISTS: { exit: 45, http: 409 },
  SKETCH_NOT_PICKED: { exit: 46, http: 409 },
  EDIT_STALE_VERSION: { exit: 47, http: 409 },
  EDIT_ELEMENT_NOT_FOUND: { exit: 48, http: 404 },
  EDIT_SESSION_TAKEN: { exit: 49, http: 409 },
  IMAGE_TOO_LARGE: { exit: 50, http: 413 },
  IMAGE_TYPE_UNSUPPORTED: { exit: 51, http: 415 },
  IMAGE_CONTENT_MISMATCH: { exit: 52, http: 422 },
  WAIVER_LIMIT: { exit: 53, http: 409 },
  // Stage 4d (plan 17, task A): the editor's requests to Claude.
  REQUEST_NOT_FOUND: { exit: 54, http: 404 },
  REQUEST_NOT_TAKEN: { exit: 55, http: 409 },
  REQUEST_LIMIT: { exit: 56, http: 409 },
  STUDIO_NOT_RUNNING: { exit: 57, http: 503 },
  // Stage 4d (plan 17, task C): notes on elements.
  NOTE_NOT_FOUND: { exit: 58, http: 404 },
  NOTE_LIMIT: { exit: 59, http: 409 },
  // Plan 18b: `kitvas doctor` found a failing check.
  DOCTOR_FAILED: { exit: 60, http: 500 },
} as const;

export type ErrorCode = keyof typeof ERROR_TABLE;
export type ErrorParams = Record<string, string | number>;

export class KitvasError extends Error {
  readonly code: ErrorCode;
  readonly params: ErrorParams;

  constructor(code: ErrorCode, params: ErrorParams = {}) {
    super(code);
    this.name = 'KitvasError';
    this.code = code;
    this.params = params;
  }
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: KitvasError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = <T = never>(error: KitvasError): Result<T> => ({ ok: false, error });
export const exitCodeOf = (code: ErrorCode): number => ERROR_TABLE[code].exit;
export const httpStatusOf = (code: ErrorCode): number => ERROR_TABLE[code].http;
