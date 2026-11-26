// The thin listeners of "close on a press outside" for the two Custom editors (colour panel and
// number field). The rule is `outside-rule.ts`. While an editor of a row is open, one press on the
// document (capture, so it is seen before the control under it) or one blur of the window asks the
// rule; a `close` hands back to the row, which keeps the value (`release`) and hides the editor in
// place. The press is never stopped, so the control under it still works: the panel is not drawn
// again here, only when the written value asks for it. Listeners are removed when the editor
// closes; a draw of the panel that threw the editor away is noticed on its next event or when the
// next editor starts watching, whichever is first.

import type { Editor } from './number-field.ts';
import { blurVerdict, insideAny, pressVerdict } from './outside-rule.ts';

type Source = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export type Watch = {
  /** Starts watching while `on`, stops when not; asking for what it already does is harmless. */
  sync(on: boolean): void;
};

type Live = { stale(): boolean; stop(): void };
/** Every watch that listens now; a watch whose editor left the page is stopped by the next start. */
const live = new Set<Live>();

/** A popup the page draws on `body` (the open list of a select) belongs to the editor's row. */
const POPUP = '.k-select-list';
/** The row (`makeRow`): the editor's own controls and the button that opened it. */
const ROW = '.k-row';

function popupOf(target: unknown): boolean {
  const node = target as { closest?: (selector: string) => unknown } | null;
  return typeof node?.closest === 'function' && node.closest(POPUP) !== null;
}

export function watchOutside(options: {
  editor: Pick<Editor, 'root' | 'busy'>;
  /** The press or blur outside: keep the value, hide the editor in place. */
  close(): void;
  doc?: Source;
  win?: Source;
  /** Runs `fn` once the page has drawn; the default is the next animation frame. */
  later?: (fn: () => void) => void;
}): Watch {
  const { editor } = options;
  let seen = false;
  let on = false;
  const handle: Live = { stale: () => seen && !editor.root.isConnected, stop };

  const doc = (): Source => options.doc ?? document;
  const win = (): Source => options.win ?? window;

  function ask(inside: boolean | null): void {
    if (handle.stale()) {
      stop();
      return;
    }
    const picking = editor.busy();
    const verdict = inside === null ? blurVerdict({ picking }) : pressVerdict({ inside, picking });
    if (verdict === 'close') {
      stop();
      options.close();
    }
  }
  const onPress: EventListener = (event) => {
    const row = editor.root.closest(ROW);
    ask(insideAny(event.target, [editor.root, row]) || popupOf(event.target));
  };
  const onBlur: EventListener = () => ask(null);

  function stop(): void {
    if (!on) return;
    on = false;
    live.delete(handle);
    doc().removeEventListener('pointerdown', onPress, true);
    win().removeEventListener('blur', onBlur);
  }

  function start(): void {
    if (on) return;
    for (const other of [...live]) if (other.stale()) other.stop();
    on = true;
    seen = false;
    live.add(handle);
    doc().addEventListener('pointerdown', onPress, true);
    win().addEventListener('blur', onBlur);
    const later = options.later ?? ((fn: () => void) => void requestAnimationFrame(fn));
    later(() => {
      if (!on) return;
      if (editor.root.isConnected) seen = true;
      else stop();
    });
  }

  return {
    sync(next) {
      if (next) start();
      else stop();
    },
  };
}
