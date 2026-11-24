// The CLI's side of the requests (spec 4d, goal 1): `kitvas inbox` takes notes and requests, and
// `kitvas request show | answer | done | fail` read and answer one, all through the running
// studio's API, which is the only writer of `requests.json`. No studio running is the usual
// `STUDIO_NOT_RUNNING`; a refusal of the studio keeps its code where the CLI can word it.

import { KitvasError, type Zod, z } from '../../shared/index.ts';
import {
  MAX_ANSWER_BYTES,
  type RequestContext,
  RequestContextSchema,
  type RequestView,
  RequestViewSchema,
  VariantsAnswerSchema,
} from '../api/requests/request-schemas.ts';
import { InboxItemSchema } from '../inbox/inbox.ts';
import { type LifecycleDeps, studioStatus } from '../run/lifecycle.ts';
import type { StudioState } from '../run/state-file.ts';
import { callStudio, type StudioAnswer, type StudioCall } from '../run/studio-client.ts';
import { type InboxRequest, InboxRequestSchema } from './inbox-take.ts';

export type {
  RequestContext,
  RequestView,
  Variant,
  VariantChange,
} from '../api/requests/request-schemas.ts';
export { MAX_ANSWER_BYTES, MAX_REQUEST_WORDS } from '../api/requests/request-schemas.ts';
export type { InboxRequest } from './inbox-take.ts';

/** One call to a running studio; tests pass their own. */
export type StudioCaller = (state: StudioState, call: StudioCall) => Promise<StudioAnswer>;

export type RequestClientDeps = {
  lifecycle: LifecycleDeps;
  /** `callStudio` when absent. */
  call?: StudioCaller | undefined;
};

export type VariantsAnswer = Zod.infer<typeof VariantsAnswerSchema>;

/** Reading and answering take a few element compiles; a take waits as long as it was told. */
const CALL_TIMEOUT_MS = 20_000;

/** An older studio's take answer has no `requests`: it has none to hand over. */
const TakeAnswerSchema = z.object({
  items: z.array(InboxItemSchema),
  requests: z.array(InboxRequestSchema).optional(),
});

const ProblemAnswerSchema = z.object({
  code: z.string(),
  detail: z.string(),
  errors: z.array(z.object({ pointer: z.string(), detail: z.string() })).optional(),
});

/** Codes the CLI words itself; any other refusal is told as the studio says it. */
const OWN_CODES = ['REQUEST_NOT_FOUND', 'REQUEST_NOT_TAKEN'] as const;
const isOwnCode = (code: string): code is (typeof OWN_CODES)[number] =>
  (OWN_CODES as readonly string[]).includes(code);

/** The studio of this project, when one answers. */
async function runningState(lifecycle: LifecycleDeps): Promise<StudioState | undefined> {
  const found = await studioStatus(lifecycle);
  if (!found) return undefined;
  const state = lifecycle.readState();
  return state?.pid === found.pid ? state : undefined;
}

/** A refusal of the studio as a kitvas error: its own code where the CLI can word it. */
function refusal(answer: StudioAnswer, id: string | undefined): KitvasError {
  const problem = ProblemAnswerSchema.safeParse(answer.body);
  if (!problem.success) {
    return new KitvasError('INTERNAL', { detail: `the studio answered ${answer.status}` });
  }
  const { code, detail, errors } = problem.data;
  if (id !== undefined && isOwnCode(code)) return new KitvasError(code, { id });
  const where = (errors ?? []).map((entry) => `${entry.pointer}: ${entry.detail}`);
  return new KitvasError('INTERNAL', {
    detail: [`the studio answered ${answer.status} ${code}: ${detail}`, ...where].join('; '),
  });
}

/** Calls the studio; a 2xx answer's body is checked with `schema`. */
async function ask<T>(
  deps: RequestClientDeps,
  call: StudioCall,
  schema: Zod.ZodType<T>,
  id?: string,
): Promise<T> {
  const state = await runningState(deps.lifecycle);
  if (!state) throw new KitvasError('STUDIO_NOT_RUNNING');
  const answer = await (deps.call ?? callStudio)(state, call);
  if (answer.status < 200 || answer.status >= 300) throw refusal(answer, id);
  const parsed = schema.safeParse(answer.body);
  if (!parsed.success) {
    throw new KitvasError('INTERNAL', { detail: `the studio answered ${call.path} oddly` });
  }
  return parsed.data;
}

export type InboxTakeView = {
  running: boolean;
  items: Zod.infer<typeof InboxItemSchema>[];
  requests: InboxRequest[];
};

/** Notes and requests of this project's studio; waits up to `seconds` for the next one. */
export async function takeInbox(deps: RequestClientDeps, seconds: number): Promise<InboxTakeView> {
  const state = await runningState(deps.lifecycle);
  // `kitvas inbox` with no studio is no error: there is simply nothing to take.
  if (!state) return { running: false, items: [], requests: [] };
  const answer = await (deps.call ?? callStudio)(state, {
    method: 'POST',
    path: '/api/v1/inbox/take',
    body: { timeout: seconds },
    // The studio answers by the end of the wait; the extra time covers a slow machine.
    timeoutMs: (seconds + 10) * 1_000,
  });
  if (answer.status !== 200) throw refusal(answer, undefined);
  const parsed = TakeAnswerSchema.safeParse(answer.body);
  if (!parsed.success) throw new KitvasError('INTERNAL', { detail: 'the inbox answered oddly' });
  return { running: true, items: parsed.data.items, requests: parsed.data.requests ?? [] };
}

/** A write to `/api/v1/requests/<id>/<what>`. */
const post = (id: string, what: string, body: unknown): StudioCall => ({
  method: 'POST',
  path: `/api/v1/requests/${id}/${what}`,
  body,
  timeoutMs: CALL_TIMEOUT_MS,
});

export const requestShow = (deps: RequestClientDeps, id: string): Promise<RequestContext> =>
  ask(
    deps,
    { method: 'GET', path: `/api/v1/requests/${id}`, timeoutMs: CALL_TIMEOUT_MS },
    RequestContextSchema,
    id,
  );

export const requestAnswer = (
  deps: RequestClientDeps,
  id: string,
  answer: VariantsAnswer,
): Promise<RequestView> => ask(deps, post(id, 'answer', answer), RequestViewSchema, id);

export const requestDone = (
  deps: RequestClientDeps,
  id: string,
  message: string,
): Promise<RequestView> => ask(deps, post(id, 'done', { message }), RequestViewSchema, id);

export const requestFail = (
  deps: RequestClientDeps,
  id: string,
  reason: string,
): Promise<RequestView> => ask(deps, post(id, 'fail', { reason }), RequestViewSchema, id);

/**
 * A variants file as Claude wrote it: `{ "variants": [...] }`, at most `MAX_ANSWER_BYTES`. The
 * problems are `pointer: message` lines, so Claude can fix the file before anything is sent.
 */
export function readVariantsFile(
  text: string,
): { ok: true; answer: VariantsAnswer } | { ok: false; problems: string[] } {
  if (Buffer.byteLength(text, 'utf8') > MAX_ANSWER_BYTES) {
    return { ok: false, problems: [`/: more than ${MAX_ANSWER_BYTES} bytes`] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, problems: ['/: not JSON'] };
  }
  const parsed = VariantsAnswerSchema.safeParse(raw);
  if (parsed.success) return { ok: true, answer: parsed.data };
  return {
    ok: false,
    problems: parsed.error.issues.map(
      (issue) => `/${issue.path.map(String).join('/')}: ${issue.message}`,
    ),
  };
}
