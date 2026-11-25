// The editor's calls to the studio API (plan 13, C3), with the page cookie. The shapes are the
// server's schemas (`src/studio/api/edit/edit-schemas.ts`); a network error answers as status 0.

import type {
  EditEnd,
  EditOutcome,
  EditRequest,
  EditState,
  Inspect,
  OffKit,
  TextSource,
} from '../../../src/studio/api/edit/edit-schemas.ts';
import type { SessionReopen } from '../../../src/studio/api/edit/session-schemas.ts';
import type {
  Palette,
  Structure,
  Subtree,
} from '../../../src/studio/api/edit/structure-schemas.ts';
import type {
  ImageUpload,
  ImageUploadRequest,
} from '../../../src/studio/api/images/image-schemas.ts';
import type { Waiver } from '../../../src/studio/api/waivers/waiver-schemas.ts';

export type Answer<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; status: number; code: string | null };

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Answer<T>> {
  try {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const read: unknown = await response.json().catch(() => undefined);
    if (response.ok) return { ok: true, status: response.status, body: read as T };
    const code =
      typeof read === 'object' && read !== null && 'code' in read && typeof read.code === 'string'
        ? read.code
        : null;
    return { ok: false, status: response.status, code };
  } catch {
    return { ok: false, status: 0, code: null };
  }
}

const base = (slug: string): string => `/api/v1/drafts/${encodeURIComponent(slug)}`;

export const getEditState = (slug: string): Promise<Answer<EditState>> =>
  call('GET', `${base(slug)}/edits`);

/**
 * One element as its source writes it. `path` (ADR 0065): the rendered copy its `list` is read
 * for, its place in each list around it; left out, the list is read for no one copy.
 */
export const inspect = (
  slug: string,
  id: string,
  path?: readonly number[],
): Promise<Answer<Inspect>> => {
  const copy = path === undefined ? '' : `&path=${path.join(',')}`;
  return call('GET', `${base(slug)}/inspect?id=${encodeURIComponent(id)}${copy}`);
};

/**
 * ADR 0060: whether the text copy `path` of the element shows has one string literal of its file
 * behind it (`reason: null`), so a double click may open the inline editor. Reads only.
 */
export const getTextSource = (
  slug: string,
  asked: { id: string; text: string; path: readonly number[] },
): Promise<Answer<TextSource>> => {
  const query = `id=${encodeURIComponent(asked.id)}&text=${encodeURIComponent(asked.text)}`;
  return call('GET', `${base(slug)}/text-source?${query}&path=${asked.path.join(',')}`);
};

export const postEdits = (slug: string, request: EditRequest): Promise<Answer<EditOutcome>> =>
  call('POST', `${base(slug)}/edits`, request);

export const endSession = (slug: string): Promise<Answer<EditEnd>> =>
  call('POST', `${base(slug)}/edits/end`, {});

/** "Undo save": opens the ended session again; a refusal answers 409 `EDIT_SESSION_TAKEN`. */
export const reopenSession = (
  slug: string,
  session: { version: number; startedAt: string },
): Promise<Answer<SessionReopen>> => call('POST', `${base(slug)}/edits/reopen`, session);

export const getOffKit = (slug: string): Promise<Answer<OffKit>> =>
  call('GET', `${base(slug)}/off-kit`);

// Structure (spec 4b; plan 14, C10).
export const getStructure = (slug: string): Promise<Answer<Structure>> =>
  call('GET', `${base(slug)}/structure`);

export const getPalette = (slug: string): Promise<Answer<Palette>> =>
  call('GET', `${base(slug)}/palette`);

export const getSubtree = (slug: string, id: string): Promise<Answer<Subtree>> =>
  call('GET', `${base(slug)}/subtree?id=${encodeURIComponent(id)}`);

// Images and waivers (spec 4c, goals 6 and 10; plan 16, task E).
/** Stores an image in the latest version's `src/img/`; the answer names the stored file. */
export const postImage = (
  slug: string,
  request: ImageUploadRequest,
): Promise<Answer<ImageUpload>> => call('POST', `${base(slug)}/images`, request);

type WaiverList = { waivers: Waiver[] };

export const getWaivers = (slug: string): Promise<Answer<WaiverList>> =>
  call('GET', `${base(slug)}/waivers`);

/** Accepts a finding of this rule on this element (`null`: a finding with no element). */
export const postWaiver = (
  slug: string,
  request: { rule: string; element: string | null; reason: string },
): Promise<Answer<WaiverList>> => call('POST', `${base(slug)}/waivers`, request);

export const postWithdraw = (
  slug: string,
  request: { rule: string; element: string | null },
): Promise<Answer<WaiverList>> => call('POST', `${base(slug)}/waivers/withdraw`, request);
