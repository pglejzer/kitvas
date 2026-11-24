// Image upload (spec 4c, goal 10; plan 16, task E): the Upload button beside the background image
// picker, and the one upload path every way of adding a file uses (the button, a drop on the
// canvas, a drop on the Insert tab). The rules are the server's (`src/studio/api/images/image-rules.ts`);
// the page checks them first so a refusal needs no round trip, and shows the reason.

import { type Answer, postImage } from '../api.ts';
import type { EditorContext } from '../context.ts';
import { text } from '../texts.ts';
import { toast } from '../toast.ts';

/** Copy of `MAX_IMAGE_BYTES` in `src/studio/api/images/image-schemas.ts`. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Copy of the keys of `IMAGE_TYPES` in `src/studio/api/images/image-schemas.ts`. */
export const IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/gif',
] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

const BY_EXTENSION: Record<string, ImageType> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
};

/** The part of a `File` the rules read, so they are tested without one. */
export type FileFacts = { name: string; type: string; size: number };

/** Why a file is not taken: its `upload.err.<problem>` text names the reason. */
export type ImageProblem = 'type' | 'size' | 'empty';

/**
 * The image type of a file: its own type when it is one of the five, else the one its extension
 * names (a browser may leave an AVIF's type empty). `null` for SVG and anything else.
 */
export function imageTypeOf(file: Pick<FileFacts, 'name' | 'type'>): ImageType | null {
  const own = IMAGE_TYPES.find((type) => type === file.type.toLowerCase());
  if (own) return own;
  // A type the browser did set, such as `image/svg+xml`, is never overruled by the extension.
  if (file.type !== '') return null;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[extension] ?? null;
}

export function imageProblem(file: FileFacts): ImageProblem | null {
  if (imageTypeOf(file) === null) return 'type';
  if (file.size === 0) return 'empty';
  return file.size > MAX_IMAGE_BYTES ? 'size' : null;
}

/** The first dropped or picked file the editor can take, or `null` when none is an image. */
export function firstImage(files: readonly FileFacts[]): number {
  return files.findIndex((file) => imageTypeOf(file) !== null);
}

/** Base64 of the bytes, in pieces so a 5 MB file does not overflow the call stack. */
export function toBase64(bytes: Uint8Array): string {
  const piece = 0x8000;
  let binary = '';
  for (let at = 0; at < bytes.length; at += piece) {
    binary += String.fromCharCode(...bytes.subarray(at, at + piece));
  }
  return btoa(binary);
}

/** The text key of what an answer's refusal says. */
export function uploadRefusalKey(answer: { code: string | null }): string {
  switch (answer.code) {
    case 'IMAGE_TOO_LARGE':
    case 'BODY_TOO_LARGE':
      return 'upload.err.size';
    case 'IMAGE_TYPE_UNSUPPORTED':
      return 'upload.err.type';
    case 'IMAGE_CONTENT_MISMATCH':
      return 'upload.err.mismatch';
    default:
      return 'upload.err.failed';
  }
}

/** Uploads wait for each other, so two quick drops never write at once. */
let tail: Promise<unknown> = Promise.resolve();

async function send(ctx: EditorContext, file: File, type: ImageType): Promise<string | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const answer: Answer<{ version: number; file: string }> = await postImage(ctx.slug, {
    name: file.name.slice(0, 200),
    type,
    data: toBase64(bytes),
  });
  if (answer.ok) return answer.body.file;
  toast(ctx.main, text(uploadRefusalKey(answer)));
  return null;
}

/** Stores `file` in the latest version's `src/img/`; the stored name, or `null` when refused. */
export function uploadImage(ctx: EditorContext, file: File): Promise<string | null> {
  const problem = imageProblem(file);
  const type = imageTypeOf(file);
  if (problem !== null || type === null) {
    toast(ctx.main, text(`upload.err.${problem ?? 'type'}`));
    return Promise.resolve(null);
  }
  const run = tail.then(() => send(ctx, file, type));
  tail = run.catch(() => undefined);
  return run.catch(() => {
    toast(ctx.main, text('upload.err.failed'));
    return null;
  });
}

/** The Upload button of the image picker; `onStored` gets the stored file name. */
export function uploadControl(ctx: EditorContext, onStored: (file: string) => void): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'upload';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = IMAGE_TYPES.join(',');
  input.hidden = true;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'upload-button';
  button.textContent = text('upload.button');
  button.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const [file] = input.files ?? [];
    input.value = '';
    if (!file) return;
    button.disabled = true;
    button.textContent = text('upload.busy');
    void uploadImage(ctx, file).then((stored) => {
      button.disabled = false;
      button.textContent = text('upload.button');
      if (stored !== null) onStored(stored);
    });
  });
  wrap.append(button, input);
  return wrap;
}
