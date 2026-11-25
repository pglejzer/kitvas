// The draft's images as a grid of thumbnails in the Insert tab. A click puts one on the selected
// element, with the ops of a drop on the canvas, as one gesture with undo. The list is read again
// when an image is stored, when Edit turns on and when a build is loaded (a stored file reaches
// the build, and so its thumbnail, with the next build).

import { iconButton } from '../../ui/icon.ts';
import { deleteImage, getImages, inspect } from '../api.ts';
import type { EditorContext } from '../context.ts';
import { text } from '../texts.ts';
import { toast } from '../toast.ts';
import { deleteResult, withoutImage } from './image-delete.ts';
import { onImageStored } from './image-events.ts';
import { orderImages, pickOps, thumbnailUrl } from './image-list.ts';

/** The address of the lead frame; `''` while there is none. */
function leadAddress(main: HTMLElement): string {
  return main.querySelector<HTMLIFrameElement>('iframe[data-frame="current"]')?.src ?? '';
}

function tile(
  file: string,
  address: string,
  fresh: boolean,
  use: (file: string) => void,
  remove: (file: string) => void,
): HTMLElement {
  const item = document.createElement('li');
  item.className = 'insert-thumb-item';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'insert-thumb';
  button.setAttribute('aria-label', text('images.use', { file }));
  button.title = file;
  if (fresh) button.classList.add('k-flash');
  button.addEventListener('click', () => use(file));
  const url = thumbnailUrl(address, file);
  const name = document.createElement('span');
  name.className = 'insert-thumb-name';
  name.textContent = file;
  if (url !== null) {
    const picture = document.createElement('img');
    picture.className = 'insert-thumb-img';
    picture.alt = '';
    picture.loading = 'lazy';
    picture.src = url;
    // Not built yet: the name alone is listed.
    picture.addEventListener('error', () => picture.remove());
    button.append(picture);
  }
  button.append(name);
  // A button of its own beside the thumbnail's, never inside it. A delete cannot be undone, and
  // its description says so.
  const del = iconButton('trash', text('images.delete', { file }));
  del.classList.add('insert-thumb-delete');
  del.setAttribute('aria-description', text('images.deleteFinal'));
  del.addEventListener('click', () => remove(file));
  item.append(button, del);
  return item;
}

/**
 * Adds the grid after `hint`, the upload tile as its last cell; the hint shows only while the draft
 * has no image.
 */
export function mountImageGrid(ctx: EditorContext, hint: HTMLElement, upload: HTMLElement): void {
  const { main, store, history, slug } = ctx;
  const list = document.createElement('ul');
  list.className = 'insert-thumbs';
  hint.after(list);

  let files: string[] = [];
  let fresh: string | null = null;

  function draw(): void {
    const address = leadAddress(main);
    list.replaceChildren(
      ...files.map((file) => tile(file, address, file === fresh, use, remove)),
      upload,
    );
    hint.hidden = files.length > 0;
    fresh = null;
  }

  async function read(): Promise<void> {
    const answer = await getImages(slug);
    if (!answer.ok) return;
    files = orderImages(answer.body.files);
    draw();
  }

  /** No confirm: the file leaves the grid at once, a note names it. */
  function remove(file: string): void {
    void (async () => {
      const result = deleteResult(file, await deleteImage(slug, file));
      toast(main, text(result.message.key, result.message.params));
      if (!result.remove) return;
      files = withoutImage(files, file);
      draw();
      // The server's list is the truth: read it once more.
      void read();
    })();
  }

  function use(file: string): void {
    void (async () => {
      const [id] = store.get().selection;
      const answer = id === undefined ? null : await inspect(slug, id);
      const picked = pickOps(
        answer?.ok === true ? answer.body : null,
        file,
        store.get().edit?.format ?? 'scss',
      );
      if (picked.kind === 'refused') {
        toast(main, text(picked.key, { file }));
        return;
      }
      void history.apply({ ops: picked.ops, label: text(picked.label.key, picked.label.params) });
    })();
  }

  onImageStored((file) => {
    fresh = file;
    void read();
  });
  store.subscribe((state, previous) => {
    if ((state.on && !previous.on) || state.builds !== previous.builds) void read();
  });
  draw();
  void read();
}
