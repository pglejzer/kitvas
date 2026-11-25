// Image upload (spec 4c, goal 10; plan 16, task E): the Insert tab takes image files, dropped or
// picked, and only stores them; a drop on the canvas is `file-drop.ts`, and the background image
// picker's Upload button is `uploadControl`, which the properties panel places. Here the Upload
// image tile is the last cell of the Images tab's grid (`upload-tile.ts`).

import type { EditorContext } from '../context.ts';
import { text } from '../texts.ts';
import { toast } from '../toast.ts';
import { carriesFiles } from './image-drop.ts';
import { mountImageGrid } from './image-grid.ts';
import { storedMessage } from './image-stored.ts';
import { firstImage, uploadImage } from './image-upload.ts';
import { uploadTile } from './upload-tile.ts';

/** The stored files, said in one note: one name, or how many. */
export function storedNote(files: readonly string[]): string {
  const [only] = files;
  return files.length === 1 && only !== undefined
    ? text('upload.stored', { file: only })
    : text('upload.storedMany', { count: files.length });
}

export function mountImages(ctx: EditorContext): void {
  const { panel, main } = ctx;
  const section = panel.querySelector('section[data-edit="palette"]');
  if (!(section instanceof HTMLElement)) return;

  const box = document.createElement('div');
  box.className = 'insert-images';
  const hint = document.createElement('p');
  hint.className = 'insert-hint k-quiet';
  hint.textContent = text('upload.insertHint');
  box.append(hint);
  // A file that was already in the draft is told by the tile itself.
  const upload = uploadTile(ctx, (file, duplicate) => {
    if (!duplicate) toast(main, storedNote([file]));
  });
  // The Images tab's panel, made by `palette.ts`.
  (section.querySelector('[data-insert-panel="images"]') ?? section).append(box);
  mountImageGrid(ctx, hint, upload);

  const over = (on: boolean): void => {
    box.toggleAttribute('data-over', on);
  };
  section.addEventListener('dragover', (event) => {
    if (!event.dataTransfer || !carriesFiles([...event.dataTransfer.types])) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    over(true);
  });
  section.addEventListener('dragleave', (event) => {
    if (!(event.relatedTarget instanceof Node) || !section.contains(event.relatedTarget)) {
      over(false);
    }
  });
  section.addEventListener('drop', (event) => {
    if (!event.dataTransfer || !carriesFiles([...event.dataTransfer.types])) return;
    event.preventDefault();
    over(false);
    const files = [...event.dataTransfer.files];
    if (firstImage(files) === -1) {
      toast(main, text('upload.err.type'));
      return;
    }
    // Every image of the drop is stored; a file that is not one is skipped with its reason.
    void Promise.all(files.map((file) => uploadImage(ctx, file))).then((stored) => {
      const note = storedMessage(stored);
      if (note !== null) toast(main, text(note.key, note.params));
    });
  });
}
