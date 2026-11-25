// The "Upload image" tile: the last cell of the Images grid. It opens the file picker and stores
// the picked file through the one upload path (`uploadImage`); `onStored` gets the stored name.

import { icon } from '../../ui/icon.ts';
import type { EditorContext } from '../context.ts';
import { text } from '../texts.ts';
import { toast } from '../toast.ts';
import { duplicateMessage } from './image-stored.ts';
import { IMAGE_TYPES, uploadImage } from './image-upload.ts';

export function uploadTile(
  ctx: EditorContext,
  onStored: (file: string, duplicate: boolean) => void,
): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'insert-upload-item';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = IMAGE_TYPES.join(',');
  input.hidden = true;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'insert-thumb insert-upload-tile';
  const label = document.createElement('span');
  label.className = 'insert-upload-label';
  const show = (key: 'upload.button' | 'upload.busy'): void => {
    label.textContent = text(key);
  };
  show('upload.button');
  button.append(icon('plus'), label);
  button.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const [file] = input.files ?? [];
    input.value = '';
    if (!file) return;
    button.disabled = true;
    show('upload.busy');
    void uploadImage(ctx, file).then((stored) => {
      button.disabled = false;
      show('upload.button');
      if (stored === null) return;
      if (stored.duplicate) {
        const note = duplicateMessage(stored.file);
        toast(ctx.main, text(note.key, note.params));
      }
      onStored(stored.file, stored.duplicate);
    });
  });
  li.append(button, input);
  return li;
}
