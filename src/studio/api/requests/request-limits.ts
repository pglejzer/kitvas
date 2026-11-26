// The lists, limits and times of a request to Claude from the editor (spec 4d, goals 1, 2 and 9).
// It imports nothing, so the editor's page reads it as it is (`client/studio/edit/ai/requests.ts`,
// ADR 0080); `request-schemas.ts` builds its schemas from it and re-exports every name.

export const REQUEST_KINDS = ['say', 'improve', 'ask', 'note', 'why'] as const;
export const REQUEST_STATUSES = ['waiting', 'taken', 'answered', 'failed', 'dropped'] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
/** Whether a Claude Code session takes the requests now (`ListeningSchema`). */
export const LISTENING_STATES = ['listening', 'working', 'off'] as const;

/** Spec 4d, goal 9: the limits of a request and of an answer. */
export const MAX_REQUEST_TEXT = 1_000;
export const MAX_REQUEST_ELEMENTS = 20;
export const MAX_OPEN_REQUESTS = 200;
export const MAX_VARIANTS = 3;
export const MAX_VARIANT_CHANGES = 40;
export const MAX_VARIANT_LABEL = 60;
export const MAX_ANSWER_BYTES = 64 * 1024;
export const MAX_REQUEST_WORDS = 500;
/** A `taken` request with no answer for this long waits again: Claude's session ended. */
export const TAKEN_TIMEOUT_MS = 15 * 60 * 1_000;
/** Claude counts as listening while a take waits, or for this long after one ended. */
export const LISTEN_GRACE_MS = 15_000;
