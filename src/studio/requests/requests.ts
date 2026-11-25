// The editor's requests to Claude, for every draft of the studio, and the listening session
// (spec 4d, goals 1 and 9; plan 17, task A). One service per studio, shared by the request routes
// and the inbox's take (`requestsOf`). It keeps `<draft>/requests.json` around the pure rules of
// `request-rules.ts`, tells the open pages (`requests {slug}`; a new listening state also as
// `listening`, for the bar of every page), wakes a waiting take when a request comes, and puts a
// taken request back in the queue once its session has been gone for `TAKEN_TIMEOUT_MS`. Request
// text is the person's data: nothing here reads it as an instruction.

import { randomUUID } from 'node:crypto';
import {
  type DraftStore,
  latestVersion,
  loadDraft,
  lockedIdsNow,
  readNotes,
  setNoteDone,
  writeNotes,
} from '../../drafts/index.ts';
import { editKit, type InspectView, styleFormat } from '../../edit/index.ts';
import type { KitStore } from '../../kit/index.ts';
import { KitvasError, type Translate } from '../../shared/index.ts';
import type { EditDeps } from '../api/edit/edit-routes.ts';
import type {
  Listening,
  NewRequest,
  RequestAnswer,
  RequestContext,
  Requests,
  RequestView,
} from '../api/requests/request-schemas.ts';
import type { EventHub } from '../events/event-hub.ts';
import type { Inbox } from '../inbox/inbox.ts';
import type { InboxRequest } from './inbox-take.ts';
import { createListening, REAL_TIMERS, type Timers } from './listening.ts';
import { refuseProblems, variantProblems } from './request-checks.ts';
import { readRequests, type StoredRequest, writeRequests } from './request-file.ts';
import {
  addRequest,
  dropRequest,
  expireTaken,
  nextExpiry,
  requireTaken,
  settleRequest,
  takeWaiting,
} from './request-rules.ts';
import { type Carry, carrierFor, currentElements, viewOf } from './request-view.ts';
import { type Inspector, inspectorFor, isStale, stampsNow } from './stamps.ts';

export type RequestHost = {
  drafts: DraftStore;
  kits: KitStore;
  events: EventHub;
  inbox: Inbox;
  now(): Date;
  t: Translate;
  /** The editor's compiler; without it no element can be read, so nothing is stale. */
  edit?: EditDeps | undefined;
};

/** `kitvas request show`: as `RequestContextSchema`, with the editor's own inspect answers. */
export type RequestContextView = Omit<RequestContext, 'elements'> & { elements: InspectView[] };

export type RequestService = {
  /** The draft's requests, newest first, and the session. */
  list(slug: string): Promise<Requests>;
  /** Whether a Claude Code session listens now. */
  listening(): Listening;
  /** Keeps a checked request (`request-checks.ts`); a waiting take gets it at once. */
  create(slug: string, input: NewRequest): Promise<RequestView>;
  drop(slug: string, id: string): Promise<RequestView>;
  show(id: string): Promise<RequestContextView>;
  /** Claude's answer to a taken request: variants, a closing word or a reason. */
  settle(id: string, answer: RequestAnswer): Promise<RequestView>;
  /** Some request of some draft waits. */
  hasWaiting(): boolean;
  /** Taken requests whose session is gone wait again. */
  sweep(): void;
  /** A take began: it may wait now. */
  began(): void;
  /** A take ended; `give`: it ended for its caller, who is handed every waiting request. */
  ended(give: boolean): InboxRequest[];
};

/** Open requests and answered variants are compared with their elements; the rest need not be. */
const comparable = (request: StoredRequest): boolean =>
  request.status === 'waiting' ||
  request.status === 'taken' ||
  (request.status === 'answered' && request.answer?.kind === 'variants');

export function createRequestService(
  host: RequestHost,
  timers: Timers = REAL_TIMERS,
): RequestService {
  let closed = false;
  let cancelExpiry: (() => void) | undefined;
  const slugs = (): string[] => host.drafts.list();
  const latestOf = (slug: string): number => latestVersion(loadDraft(host.drafts, slug));

  /** The one timer, for the earliest taken request to wait again. */
  const expireAt = (at: number | null): void => {
    cancelExpiry?.();
    cancelExpiry = undefined;
    if (at === null || closed) return;
    const run = (): void => {
      cancelExpiry = undefined;
      try {
        sweep();
      } catch {
        // A timer must not end the studio; the next take or read sweeps again.
      }
    };
    cancelExpiry = timers.set(run, Math.max(0, at - host.now().getTime()) + 1);
  };

  /** Whether a request of some draft is taken; sets the expiry timer on the way. */
  const anyTaken = (): boolean => {
    let next: number | null = null;
    for (const slug of slugs()) {
      const at = nextExpiry(readRequests(host.drafts, slug));
      if (at !== null && (next === null || at < next)) next = at;
    }
    expireAt(next);
    return next !== null;
  };

  const listening = createListening({
    now: () => host.now(),
    facts: () => ({ waiting: host.inbox.waiting(), taken: anyTaken() }),
    // The bar of every page shows the state, with or without drafts: one `listening` event. A
    // draft's Claude tab reads it with the draft's requests, so every draft hears it too.
    onChange: (state) => {
      host.events.publish('listening', state);
      for (const slug of slugs()) host.events.publish('requests', { slug });
    },
    timers,
  });
  host.inbox.onClose(() => {
    closed = true;
    listening.close();
    expireAt(null);
  });

  /** Tells the pages of the drafts that changed; a new listening state has told every draft. */
  const told = (changed: readonly string[], seen = false): void => {
    const all = seen ? listening.seen() : listening.refresh();
    if (all) return;
    for (const slug of new Set(changed)) host.events.publish('requests', { slug });
  };

  /** One draft's taken requests whose session is gone wait again. True when any did. */
  const expireDraft = (slug: string): boolean => {
    const { requests, expired } = expireTaken(readRequests(host.drafts, slug), host.now());
    if (expired === 0) return false;
    writeRequests(host.drafts, slug, requests);
    return true;
  };

  const sweep = (): void => {
    const changed = slugs().filter((slug) => {
      try {
        return expireDraft(slug);
      } catch {
        // Not written: the next sweep tries again.
        return false;
      }
    });
    told(changed);
    // A take that waits now gets them at once.
    if (changed.length > 0) host.inbox.wake();
  };

  /** The request's view, compared with its elements as they are now. */
  const present = async (
    request: StoredRequest,
    carry: Carry,
    inspect: Inspector | undefined,
  ): Promise<RequestView> => {
    if (!comparable(request)) return viewOf(request, carry, false);
    const now = await stampsNow(inspect, currentElements(request, carry));
    return viewOf(request, carry, isStale(inspect, request.stamps, now));
  };

  /** The request `id` and its draft; throws `REQUEST_NOT_FOUND`. */
  const locate = (id: string): { slug: string; request: StoredRequest } => {
    for (const slug of slugs()) {
      const request = readRequests(host.drafts, slug).find((each) => each.id === id);
      if (request) return { slug, request };
    }
    throw new KitvasError('REQUEST_NOT_FOUND', { id });
  };

  /** A note for Claude names the request it made, so closing the request closes the note. */
  const linkNote = (slug: string, note: string, request: string): void => {
    try {
      const file = readNotes(host.drafts, slug);
      if (!file.notes.some((each) => each.id === note && each.request !== request)) return;
      const notes = file.notes.map((each) => (each.id === note ? { ...each, request } : each));
      writeNotes(host.drafts, slug, { ...file, notes });
    } catch {
      // The request is kept already; a note that cannot be written is the notes' own problem.
    }
  };

  /** Claude closed a note's request: the note is done. A note deleted since is left alone. */
  const closeNote = (slug: string, note: string): void => {
    try {
      setNoteDone(host.drafts, slug, note, true);
    } catch {
      // The answer is kept already; there is no note to mark.
    }
  };

  /** Every waiting request of every draft, now taken, as the take hands them over. */
  const takeAll = (): { handed: InboxRequest[]; changed: string[] } => {
    const handed: InboxRequest[] = [];
    const changed: string[] = [];
    for (const slug of slugs()) {
      try {
        const { requests, taken } = takeWaiting(readRequests(host.drafts, slug), host.now());
        if (taken.length === 0) continue;
        // Read before the write: a draft that does not load keeps its requests waiting.
        const carry = carrierFor(host.drafts, slug, latestOf(slug));
        writeRequests(host.drafts, slug, requests);
        changed.push(slug);
        for (const request of taken) {
          const { id, kind, text } = request;
          handed.push({ id, slug, kind, text, elements: currentElements(request, carry) });
        }
      } catch {
        // Not written: this draft's requests wait for the next take.
      }
    }
    return { handed, changed };
  };

  return {
    async list(slug) {
      const latest = latestOf(slug);
      if (expireDraft(slug)) {
        told([slug]);
        host.inbox.wake();
      }
      const carry = carrierFor(host.drafts, slug, latest);
      const inspect = inspectorFor(host, slug);
      const stored = readRequests(host.drafts, slug).toReversed();
      const requests = await Promise.all(stored.map((each) => present(each, carry, inspect)));
      return { requests, listening: listening.current() };
    },

    listening: () => listening.current(),

    async create(slug, input) {
      const latest = latestOf(slug);
      const inspect = inspectorFor(host, slug);
      const stamps = await stampsNow(inspect, input.elements);
      const fresh: StoredRequest = {
        id: randomUUID(),
        kind: input.kind,
        elements: input.elements,
        stamps,
        context: input.context,
        text: input.text,
        ops: input.ops ?? [],
        note: input.note ?? null,
        version: latest,
        at: host.now().toISOString(),
        status: 'waiting',
        takenAt: null,
        answer: null,
        answeredAt: null,
        answeredVersion: null,
      };
      writeRequests(host.drafts, slug, addRequest(readRequests(host.drafts, slug), fresh, slug));
      if (fresh.note !== null) linkNote(slug, fresh.note, fresh.id);
      told([slug]);
      host.inbox.wake();
      const carry = carrierFor(host.drafts, slug, latest);
      return viewOf(fresh, carry, isStale(inspect, stamps, stamps));
    },

    async drop(slug, id) {
      const latest = latestOf(slug);
      const before = readRequests(host.drafts, slug);
      const { requests, request } = dropRequest(before, id);
      if (requests.some((each, index) => each !== before[index])) {
        writeRequests(host.drafts, slug, requests);
        told([slug]);
      }
      return viewOf(request, carrierFor(host.drafts, slug, latest), false);
    },

    async show(id) {
      const { slug, request } = locate(id);
      const draft = loadDraft(host.drafts, slug);
      const latest = latestVersion(draft);
      const inspect = inspectorFor(host, slug);
      if (!inspect) throw new KitvasError('INTERNAL', { detail: host.t('studio.edit.noEditor') });
      const carry = carrierFor(host.drafts, slug, latest);
      const found = await Promise.all(currentElements(request, carry).map((each) => inspect(each)));
      return {
        request: await present(request, carry, inspect),
        slug,
        format: styleFormat(editKit(host.kits, draft.kit.id)),
        // A gone element is left out: Claude cannot change what is not there.
        elements: found.filter((view): view is InspectView => view !== null),
        locked: lockedIdsNow(host.drafts, slug, latest),
        ops: request.ops,
      };
    },

    async settle(id, answer) {
      const { slug, request } = locate(id);
      requireTaken(request);
      const latest = latestOf(slug);
      const carry = carrierFor(host.drafts, slug, latest);
      let stamps: (string | null)[] | undefined;
      if (answer.kind === 'variants') {
        const locked = new Set(lockedIdsNow(host.drafts, slug, latest));
        refuseProblems(variantProblems(answer.variants, locked, host.t));
        // The variants belong to the elements as they are now: a change after this is stale.
        stamps = await stampsNow(inspectorFor(host, slug), currentElements(request, carry));
      }
      const settled = settleRequest(readRequests(host.drafts, slug), id, answer, {
        now: host.now(),
        version: latest,
        ...(stamps === undefined ? {} : { stamps }),
      });
      writeRequests(host.drafts, slug, settled.requests);
      if (settled.request.status === 'answered' && settled.request.note !== null) {
        closeNote(slug, settled.request.note);
      }
      told([slug], true);
      return viewOf(settled.request, carry, false);
    },

    hasWaiting: () =>
      slugs().some((slug) =>
        readRequests(host.drafts, slug).some((request) => request.status === 'waiting'),
      ),

    sweep,

    began: () => {
      if (!closed) listening.refresh();
    },

    ended(give) {
      if (closed) return [];
      const { handed, changed } = give ? takeAll() : { handed: [], changed: [] };
      told(changed, true);
      return handed;
    },
  };
}

/** One service per studio: the request routes and the inbox's take reach it through the inbox. */
const services = new WeakMap<Inbox, { drafts: DraftStore; service: RequestService }>();

export function requestsOf(host: RequestHost): RequestService {
  const known = services.get(host.inbox);
  if (known && known.drafts === host.drafts) return known.service;
  const service = createRequestService(host);
  services.set(host.inbox, { drafts: host.drafts, service });
  return service;
}
