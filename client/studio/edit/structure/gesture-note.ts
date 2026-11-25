// A gesture the frame lost, said over the canvas (ADR 0066). The frame posts the log of a drag or
// of a handle that ended without its drop or its write (`client/channel/gesture-protocol.ts`).
// Most of those ends are the person's own: Esc, a release where nothing takes the element, a
// release where it stood. The others took the gesture away from the person, and those get one
// line over the canvas, so a drag that did not land is never silent. The last log stays on the
// screen's element (`data-gesture-log`), where it can be read when someone reports a lost drag.

import {
  type GestureEnd,
  type GestureLogMessage,
  parseGestureLog,
} from '../../../channel/gesture-protocol.ts';
import type { EditorContext } from '../context.ts';
import { text } from '../texts.ts';
import { showNote } from './refusal-note.ts';

/** The ends that took a gesture away from the person. */
const TAKEN: readonly GestureEnd[] = [
  'blur',
  'no-buttons',
  'cancelled',
  'capture-lost',
  'selection-changed',
  'unloaded',
  'no-move',
];

/** Why the gesture of `log` ended: the reason of its last step. */
export function endOf(log: GestureLogMessage): GestureEnd | null {
  return log.steps.at(-1)?.why ?? null;
}

/** The key of the line a lost gesture gets; `null` for an end the person chose. */
export function gestureNoteKey(log: GestureLogMessage): string | null {
  const why = endOf(log);
  return why !== null && TAKEN.includes(why) ? `gesture.${why}` : null;
}

/** The log as one short line: `pressed@120 drag@340 idle@910:blur`. */
export function logLine(log: GestureLogMessage): string {
  const steps = log.steps.map(
    (step) => `${step.state}@${step.at}${step.why === null ? '' : `:${step.why}`}`,
  );
  return `${log.tool} ${steps.join(' ')}`;
}

export function mountGestureNote(ctx: EditorContext): void {
  const { bridge, main } = ctx;
  window.addEventListener('message', (event) => {
    // A sandboxed frame has an opaque origin; the sender must be one of this screen's frames.
    if (event.origin !== 'null' || event.source === null) return;
    const frame = bridge.frames().find((item) => item.element.contentWindow === event.source);
    if (!frame) return;
    const log = parseGestureLog(event.data, frame.channel);
    if (!log) return;
    main.dataset.gestureLog = logLine(log);
    const key = gestureNoteKey(log);
    if (key !== null) showNote(main, 'refusal', text(key));
  });
}
