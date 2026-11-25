// What an upload answered, and what the person is told (pure, no DOM). A file whose bytes were
// already in the draft is not stored again: the server names the existing file, and the page uses
// it as if it had just been added.

/** `duplicate`: the bytes were already in the draft, so `file` is the one that was there. */
export type Stored = { file: string; duplicate: boolean };

export type Message = { key: string; params: Record<string, string | number> };

/** The upload answer's body as the page keeps it. */
export function storedOf(body: { file: string; duplicate?: boolean | undefined }): Stored {
  return { file: body.file, duplicate: body.duplicate === true };
}

/** The note for one file that was already in the draft. */
export const duplicateMessage = (file: string): Message => ({
  key: 'upload.duplicate',
  params: { file },
});

/**
 * The one note for a group of uploads (`null` entries failed and have said why): new files are
 * "added", files that were already there are "already in the draft", a mix says both counts.
 * `null` when nothing was stored.
 */
export function storedMessage(results: readonly (Stored | null)[]): Message | null {
  const done = results.filter((result): result is Stored => result !== null);
  const added = done.filter((result) => !result.duplicate);
  const same = done.filter((result) => result.duplicate);
  const [addedOne] = added;
  const [sameOne] = same;
  if (added.length > 0 && same.length > 0) {
    return { key: 'upload.mixed', params: { added: added.length, skipped: same.length } };
  }
  if (addedOne !== undefined) {
    return added.length === 1
      ? { key: 'upload.stored', params: { file: addedOne.file } }
      : { key: 'upload.storedMany', params: { count: added.length } };
  }
  if (sameOne !== undefined) {
    return same.length === 1
      ? duplicateMessage(sameOne.file)
      : { key: 'upload.duplicateMany', params: { count: same.length } };
  }
  return null;
}
