// A lost gesture's log, frame to studio (ADR 0066): the last changes of state of the frame's drag
// session or of a handle, posted once when a gesture ends without its drop or its write. The frame
// keeps the log (`client/frame/drag/gesture-log.ts`); the studio says over the canvas why a
// gesture ended early (`client/studio/edit/structure/gesture-note.ts`).

/** The tools that keep a log. */
export const GESTURE_TOOLS = ['drag', 'handle'] as const;
export type GestureTool = (typeof GESTURE_TOOLS)[number];

/** The states a step names: the session's (`frame/drag/session.ts`) and a handle's. */
export const GESTURE_STATES = [
  'idle',
  'pressed',
  'drag',
  'item',
  'rect',
  'held',
  'moving',
] as const;
export type GestureState = (typeof GESTURE_STATES)[number];

/**
 * Why a gesture ended, or what went wrong while it ran.
 * - `released`: let go, with its drop or its write, or as a plain click.
 * - `no-slot`: let go where nothing takes it. `same-place`: let go where it stood.
 * - `no-move`: a press let go away from where it began, though no move was heard in between.
 * - `not-moved`: a handle let go before it moved.
 * - `blur`: the window lost the focus. `no-buttons`: a move came with no button down.
 * - `cancelled`: the browser cancelled the pointer. `capture-lost`: the pointer capture went.
 * - `selection-changed`: the page selected something else under a held handle.
 * - `escape`: Esc. `new-press`: another press or a forwarded drag took over. `off`: edit mode
 *   went off.
 * - `swapped`: a build was taken under a press or a drag, which goes on.
 * - `unloaded`: the page was left (`pagehide`) under a press, a drag or a held handle.
 * - `busy`: a press on a handle while another handle was still held. `no-spot`: a press on the
 *   handles' overlay with no handle under the pointer, as when a handle is not drawn yet.
 */
export const GESTURE_ENDS = [
  'released',
  'no-slot',
  'same-place',
  'no-move',
  'not-moved',
  'blur',
  'no-buttons',
  'cancelled',
  'capture-lost',
  'selection-changed',
  'escape',
  'new-press',
  'off',
  'swapped',
  'unloaded',
  'busy',
  'no-spot',
] as const;
export type GestureEnd = (typeof GESTURE_ENDS)[number];

/** One change of state. `at`: milliseconds since the page loaded. `why`: only where it matters. */
export type GestureStep = { at: number; state: GestureState; why: GestureEnd | null };

/** The most steps a log keeps and a message carries. */
export const MAX_GESTURE_STEPS = 20;
/** The largest `at` a message carries: more than eleven days of one page. */
export const MAX_GESTURE_AT = 1e9;

/** Frame to studio: a gesture that ended without its drop or its write, with the steps before. */
export type GestureLogMessage = {
  kitvas: 1;
  channel: string;
  type: 'gesture-log';
  tool: GestureTool;
  steps: GestureStep[];
};

type Loose = Record<string, unknown>;

const isObject = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isTool = (value: unknown): value is GestureTool =>
  GESTURE_TOOLS.some((tool) => tool === value);
const isState = (value: unknown): value is GestureState =>
  GESTURE_STATES.some((state) => state === value);
const isEnd = (value: unknown): value is GestureEnd => GESTURE_ENDS.some((end) => end === value);

function step(value: unknown): GestureStep | undefined {
  if (!isObject(value)) return undefined;
  const { at, state, why } = value;
  if (typeof at !== 'number' || !Number.isInteger(at) || at < 0 || at > MAX_GESTURE_AT) {
    return undefined;
  }
  if (!isState(state) || (why !== null && !isEnd(why))) return undefined;
  return { at, state, why };
}

/** The log a frame of `channel` posted; `undefined` for anything else. */
export function parseGestureLog(data: unknown, channel: string): GestureLogMessage | undefined {
  if (!isObject(data) || data.kitvas !== 1 || data.channel !== channel) return undefined;
  if (data.type !== 'gesture-log' || !isTool(data.tool) || !Array.isArray(data.steps)) {
    return undefined;
  }
  if (data.steps.length > MAX_GESTURE_STEPS) return undefined;
  const steps: GestureStep[] = [];
  for (const item of data.steps) {
    const read = step(item);
    if (!read) return undefined;
    steps.push(read);
  }
  return { kitvas: 1, channel, type: 'gesture-log', tool: data.tool, steps };
}
