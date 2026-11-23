// Failed requests as RFC 9457 problem details: one shape for every error the studio sends.

import { STATUS_CODES } from 'node:http';
import {
  type ErrorCode,
  type ErrorParams,
  httpStatusOf,
  KitvasError,
  type Translate,
  type Zod,
  z,
} from '../../shared/index.ts';
import { PROBLEM_TYPE, type Reply } from './reply.ts';

export type ProblemEntry = { pointer: string; detail: string };

type Extra = { errors?: ProblemEntry[]; headers?: Record<string, string> };

/** A kitvas error raised while serving a request, with what the response needs besides the message. */
export class RequestError extends KitvasError {
  readonly errors: ProblemEntry[];
  /** Headers the response must carry, like `Allow` on 405. */
  readonly headers: Record<string, string>;

  constructor(code: ErrorCode, params: ErrorParams = {}, extra: Extra = {}) {
    super(code, params);
    this.name = 'RequestError';
    this.errors = extra.errors ?? [];
    this.headers = extra.headers ?? {};
  }
}

export const ProblemSchema = z.strictObject({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  code: z.string(),
  errors: z.array(z.strictObject({ pointer: z.string(), detail: z.string() })).optional(),
});

export type Problem = Zod.infer<typeof ProblemSchema>;

/** Problem types are URNs named after the error code: `urn:kitvas:error:DRAFT_NOT_FOUND`. */
export const problemType = (code: string): string => `urn:kitvas:error:${code}`;

/** RFC 6901: `~` becomes `~0` and `/` becomes `~1` inside a key. */
export function jsonPointer(path: readonly PropertyKey[]): string {
  return path.map((key) => `/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`).join('');
}

type Issue = {
  path: readonly PropertyKey[];
  message: string;
  code?: string;
  keys?: readonly string[];
};

/** zod issues as problem entries; an unknown field points at the field itself. */
export function issueEntries(issues: readonly Issue[]): ProblemEntry[] {
  return issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys' && issue.keys
      ? issue.keys.map((key) => ({
          pointer: jsonPointer([...issue.path, key]),
          detail: issue.message,
        }))
      : [{ pointer: jsonPointer(issue.path), detail: issue.message }],
  );
}

export function problemOf(error: KitvasError, t: Translate): Problem {
  const status = httpStatusOf(error.code);
  const problem: Problem = {
    type: problemType(error.code),
    title: STATUS_CODES[status] ?? 'Error',
    status,
    detail: t(`error.${error.code}`, error.params),
    code: error.code,
  };
  if (error instanceof RequestError && error.errors.length > 0) problem.errors = error.errors;
  return problem;
}

/**
 * The reply for anything thrown while serving a request. An error kitvas did not raise goes to
 * `onError` and is answered with a plain 500: no message, path or stack reaches the client.
 */
export function problemReply(
  cause: unknown,
  t: Translate,
  onError?: (error: unknown) => void,
): Reply {
  if (!(cause instanceof KitvasError)) onError?.(cause);
  const error =
    cause instanceof KitvasError
      ? cause
      : new KitvasError('INTERNAL', { detail: t('studio.internal') });
  return {
    status: httpStatusOf(error.code),
    type: PROBLEM_TYPE,
    body: JSON.stringify(problemOf(error, t)),
    headers: error instanceof RequestError ? error.headers : {},
  };
}
