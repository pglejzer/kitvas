// Deleting an image from the Insert grid (pure, no DOM): what an answer of the delete route means
// for the grid and for the note the person sees.

import type { Answer } from '../api.ts';
import type { Message } from './image-stored.ts';

export type DeleteResult = {
  /** The file leaves the grid now. */
  remove: boolean;
  message: Message;
};

type Deleted = { file: string; deleted: boolean; uses: number };

/**
 * An image the draft still uses stays, with the count; a file the server no longer has leaves the
 * grid too (another tab removed it); any other failure keeps the file and says it was not deleted.
 */
export function deleteResult(file: string, answer: Answer<Deleted>): DeleteResult {
  if (answer.ok) {
    return answer.body.deleted
      ? { remove: true, message: { key: 'images.deleted', params: { file } } }
      : { remove: false, message: { key: 'images.inUse', params: { count: answer.body.uses } } };
  }
  if (answer.code === 'IMAGE_NOT_FOUND') {
    return { remove: true, message: { key: 'images.deleted', params: { file } } };
  }
  return { remove: false, message: { key: 'images.deleteFailed', params: { file } } };
}

/** The grid's files after one leaves; the same list when the file is not in it. */
export function withoutImage(files: readonly string[], file: string): string[] {
  return files.filter((name) => name !== file);
}
