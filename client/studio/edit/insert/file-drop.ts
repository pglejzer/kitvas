// A file dropped on the canvas (spec 4c, goal 10). A frame is its own document, so a file dragged
// over it never reaches this page: while a file is dragged, a shield lies over the cards (as the
// palette's drag does), and the pointer is forwarded into the frame under it as an `insert` drag.
// The frame finds the slot; its `drop` answer names the element, and the image is stored and
// written there as one gesture with undo.

import type { DragPhase, DragSource } from '../../../channel/structure-protocol.ts';
import { type Frame, sendEdit } from '../../frames.ts';
import { inspect } from '../api.ts';
import type { EditorContext } from '../context.ts';
import { toFramePoint } from '../select/forward.ts';
import { text } from '../texts.ts';
import { toast } from '../toast.ts';
import { carriesFiles, imageDropOps } from './image-drop.ts';
import { duplicateMessage, type Stored } from './image-stored.ts';
import { firstImage, uploadImage } from './image-upload.ts';

/** The label of a file drag: the frame hands it back on `drop`, so it is told from a palette drag. */
export const FILE_LABEL = 'image-file';
/** How long the frame has, after the drop, to name an element before the drop counts as on none. */
export const ANSWER_MS = 500;

type Point = { x: number; y: number };
type Rect = { left: number; top: number; right: number; bottom: number };

/** The index of the first rectangle that holds the point; `-1` when none does. */
export function rectAt(rects: readonly Rect[], point: Point): number {
  return rects.findIndex(
    (rect) =>
      point.x >= rect.left && point.x < rect.right && point.y >= rect.top && point.y < rect.bottom,
  );
}

/** The pointer is outside the window: the file was dragged away. */
export const leftWindow = (point: Point, size: { width: number; height: number }): boolean =>
  point.x <= 0 || point.y <= 0 || point.x >= size.width || point.y >= size.height;

/** A drag of files, whatever it is over; the page never lets the browser open the file itself. */
const hasFiles = (event: DragEvent): boolean =>
  event.dataTransfer !== null && carriesFiles([...event.dataTransfer.types]);

export function mountFileDrop(ctx: EditorContext): void {
  const { main, store, bridge, history, slug } = ctx;
  const canvas = main.querySelector<HTMLElement>('[data-shell="canvas"]');
  if (!canvas) return;

  const shield = document.createElement('div');
  shield.className = 'insert-shield';
  shield.hidden = true;
  const hint = document.createElement('p');
  hint.className = 'k-pop insert-shield-hint';
  hint.textContent = text('upload.dropHint');
  shield.append(hint);
  canvas.append(shield);

  /** The frame that has the drag now; `null` while none has it. */
  let over: Frame | null = null;
  let waiting: { upload: Promise<Stored | null>; timer: ReturnType<typeof setTimeout> } | null =
    null;

  const rectOf = (frame: Frame): DOMRect => frame.element.getBoundingClientRect();

  function send(frame: Frame, phase: DragPhase, point: Point, source: DragSource | null): void {
    const at = toFramePoint(point, rectOf(frame), store.get().zoom);
    sendEdit(frame, { type: 'drag', phase, source, x: at.x, y: at.y });
  }

  /** The drag follows the pointer from card to card: the one it leaves is told to let go. */
  function follow(point: Point): void {
    const frames = bridge.frames();
    const found = rectAt(frames.map(rectOf), point);
    const frame = found === -1 ? null : (frames[found] ?? null);
    if (frame === over) {
      if (frame) send(frame, 'move', point, null);
      return;
    }
    if (over) send(over, 'cancel', point, null);
    over = frame;
    if (frame) send(frame, 'start', point, { kind: 'insert', label: FILE_LABEL });
  }

  function release(): void {
    over = null;
    shield.hidden = true;
  }

  function cancel(point: Point): void {
    if (over) send(over, 'cancel', point, null);
    release();
  }

  /** Writes the stored image on `target`, as `drop` named it. */
  async function place(target: string, upload: Promise<Stored | null>): Promise<void> {
    const result = await upload;
    if (result === null) return;
    // A file already in the draft is told, and used as if it had just been added.
    if (result.duplicate) {
      const note = duplicateMessage(result.file);
      toast(main, text(note.key, note.params));
    }
    const stored = result.file;
    const answer = await inspect(slug, target);
    if (!answer.ok) {
      toast(main, text('upload.drop.noTarget', { file: stored }));
      return;
    }
    const drop = imageDropOps(answer.body, stored, store.get().edit?.format ?? 'scss');
    if (drop.kind === 'refused') {
      toast(main, text(drop.key, { file: stored }));
      return;
    }
    void history.apply({ ops: drop.ops, label: text(drop.label.key, drop.label.params) });
  }

  document.addEventListener('dragenter', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    if (store.get().on) shield.hidden = false;
  });
  // The page itself never lets a dropped file open in the tab.
  document.addEventListener('dragover', (event) => {
    if (hasFiles(event)) event.preventDefault();
  });
  document.addEventListener('drop', (event) => {
    if (hasFiles(event)) event.preventDefault();
    release();
  });
  document.addEventListener('dragleave', (event) => {
    const point = { x: event.clientX, y: event.clientY };
    if (hasFiles(event) && leftWindow(point, { width: innerWidth, height: innerHeight })) {
      cancel(point);
    }
  });
  document.addEventListener('dragend', release);

  shield.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    follow({ x: event.clientX, y: event.clientY });
  });
  shield.addEventListener('drop', (event) => {
    event.preventDefault();
    const point = { x: event.clientX, y: event.clientY };
    const files = [...(event.dataTransfer?.files ?? [])];
    const at = firstImage(files);
    const file = at === -1 ? undefined : files[at];
    const frame = over;
    if (!file || !frame) {
      if (files.length > 0 && !file) toast(main, text('upload.err.type'));
      cancel(point);
      return;
    }
    // The upload starts now; the frame's answer says where it goes.
    const upload = uploadImage(ctx, file);
    send(frame, 'end', point, null);
    release();
    if (waiting) clearTimeout(waiting.timer);
    const timer = setTimeout(() => {
      waiting = null;
      void upload.then((stored) => {
        if (stored === null) return;
        const note = stored.duplicate
          ? duplicateMessage(stored.file)
          : { key: 'upload.drop.stored', params: { file: stored.file } };
        toast(main, text(note.key, note.params));
      });
    }, ANSWER_MS);
    waiting = { upload, timer };
  });

  bridge.on((message) => {
    if (message.type !== 'drop' || message.source.kind !== 'insert') return;
    if (message.source.label !== FILE_LABEL || !waiting) return;
    clearTimeout(waiting.timer);
    const { upload } = waiting;
    waiting = null;
    void place(message.anchor, upload);
  });

  // Leaving Edit takes the shield away at once.
  store.subscribe((state, previous) => {
    if (previous.on && !state.on) release();
  });
}
