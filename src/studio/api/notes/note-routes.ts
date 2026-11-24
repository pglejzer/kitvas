// Notes pinned to elements (spec 4d, goal 3; plan 17, task C): the draft's notes, adding one,
// changing its text or marking it done, and deleting it. A note is the person's: it never reaches
// a build or a source file. The rules are in the drafts module (`app/notes.ts`); a handler checks
// the input and calls them. Each answer is the whole list, as the editor shows it.

import { randomUUID } from 'node:crypto';
import {
  addNote,
  deleteNote,
  latestVersion,
  loadDraft,
  notesNow,
  SLUG,
  updateNote,
} from '../../../drafts/index.ts';
import { z } from '../../../shared/index.ts';
import { type ApiRoute, apiRoute } from '../../http/router.ts';
import { elementsNow } from '../../live/locks.ts';
import type { ApiDeps } from '../routes.ts';
import { EmptyBody, SlugParams } from '../schemas.ts';
import {
  NewNoteRequestSchema,
  NotesSchema,
  NoteUpdateSchema,
  type NoteView,
} from './note-schemas.ts';

const NoteParams = z.strictObject({ slug: z.string().regex(SLUG), id: z.uuid() });
/** The answer to a new note: the list, and the new note's id. */
const NoteCreatedSchema = NotesSchema.extend({ created: z.uuid() });

type NotesBody = { notes: NoteView[] };

/** `sections/Hero:section/Button` is written in `src/tsx/sections/Hero.tsx`. */
const fileOf = (id: string): string => `src/tsx/${id.slice(0, Math.max(0, id.indexOf(':')))}.tsx`;

export function noteRoutes(deps: ApiDeps): ApiRoute[] {
  /**
   * The notes as the latest version names their elements. An element its file does not have now
   * is gone (the note is unpinned); a file that does not compile now keeps its notes pinned.
   */
  async function notesOf(slug: string): Promise<NotesBody> {
    const version = latestVersion(loadDraft(deps.drafts, slug));
    const carried = notesNow(deps.drafts, slug, version);
    const files = carried.flatMap((note) => (note.current === null ? [] : [fileOf(note.current)]));
    const lockDeps = { drafts: deps.drafts, compiler: deps.edit?.compiler };
    const { elements, unread } = await elementsNow(lockDeps, slug, version, files);
    const ids = new Set(elements.map((element) => element.id));
    const there = (id: string): boolean => ids.has(id) || unread.has(fileOf(id));
    return {
      notes: carried.map((note) =>
        note.current === null || there(note.current) ? note : { ...note, current: null },
      ),
    };
  }

  return [
    apiRoute({
      id: 'listDraftNotes',
      summary: "A draft's notes, oldest first, each with its element's id in the latest version.",
      method: 'GET',
      path: '/api/v1/drafts/{slug}/notes',
      policy: 'read',
      params: SlugParams,
      request: null,
      response: { status: 200, schema: NotesSchema },
      handle: async ({ params }) => ({ status: 200, body: await notesOf(params.slug) }),
    }),
    apiRoute({
      id: 'addDraftNote',
      summary: 'Pins a note to an element (or to none), for the person or for Claude.',
      method: 'POST',
      path: '/api/v1/drafts/{slug}/notes',
      policy: 'write',
      params: SlugParams,
      request: NewNoteRequestSchema,
      response: { status: 201, schema: NoteCreatedSchema },
      handle: async ({ params, body }) => {
        const version = latestVersion(loadDraft(deps.drafts, params.slug));
        const made = addNote(
          deps.drafts,
          params.slug,
          { id: randomUUID(), element: body.element, text: body.text, for: body.for },
          version,
          deps.now(),
        );
        return { status: 201, body: { ...(await notesOf(params.slug)), created: made.id } };
      },
    }),
    apiRoute({
      id: 'updateDraftNote',
      summary: "Changes a note's text, or marks it done or open again.",
      method: 'POST',
      path: '/api/v1/drafts/{slug}/notes/{id}',
      policy: 'write',
      params: NoteParams,
      request: NoteUpdateSchema,
      response: { status: 200, schema: NotesSchema },
      handle: async ({ params, body }) => {
        updateNote(deps.drafts, params.slug, params.id, body);
        return { status: 200, body: await notesOf(params.slug) };
      },
    }),
    apiRoute({
      id: 'deleteDraftNote',
      summary: 'Deletes a note.',
      method: 'POST',
      path: '/api/v1/drafts/{slug}/notes/{id}/delete',
      policy: 'write',
      params: NoteParams,
      request: EmptyBody,
      response: { status: 200, schema: NotesSchema },
      handle: async ({ params }) => {
        deleteNote(deps.drafts, params.slug, params.id);
        return { status: 200, body: await notesOf(params.slug) };
      },
    }),
  ];
}
