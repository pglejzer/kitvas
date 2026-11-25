// The frame side of the structure editor (spec 4b; plan 14, task C4): it hears every page message
// of the editor, keeps the structure entries, the scales, the selection and edit mode, and drives
// the drag (C2), the handles (C3), hiding and the context menu request. The runtime hands it every
// editor message, the same ones `edit.ts` gets, and the canvas zoom as `scale` (ADR 0059).
//
// The drag and the handles are made with the structure, before edit mode ever goes on: each adds
// its window listeners when made, and they must run before the ones `edit.ts` adds on every turn
// on (listeners of one target run in the order they were added), or the click that ends a drag
// would also pick. They do nothing while edit mode is off. The indicator draws its overlay only
// when a drag first shows a slot, so a prototype nobody edits never gets one.

import type { EditFrameMessage, EditStudioMessage } from '../../channel/edit-protocol.ts';
import type { FrameEntry, MenuBox, ScaleStep } from '../../channel/structure-protocol.ts';
import { createDrag, type Drag } from '../drag/drag.ts';
import {
  createGestureLog,
  type GestureLog,
  type GestureLogMessage,
  type GestureTool,
} from '../drag/gesture-log.ts';
import { createHandles, type Handles } from '../drag/handles.ts';
import { slotAt } from '../drag/slot-read.ts';
import { createIndicator, type Indicator } from '../drag/slots.ts';
import { createHide, type Hide } from './hide.ts';
import { type Chosen, chosenOf, copyOfPick, soleCopy } from './items.ts';
import { MENU, pressedElement } from './row-pick.ts';

/** What the frame needs of a `contextmenu` event. */
export type MenuEvent = {
  target: unknown;
  clientX: number;
  clientY: number;
  preventDefault(): void;
};

/** The parts the structure drives; the defaults are the real ones, a test passes fakes. */
export type StructureParts = {
  drag(input: {
    entries(): ReadonlyMap<string, FrameEntry>;
    selection(): readonly string[];
    locked(): readonly string[];
    /** A drag began (`true`) or ended. */
    quiet(on: boolean): void;
  }): Drag;
  handles(scales: () => { space: readonly ScaleStep[]; size: readonly ScaleStep[] }): Handles;
  hide: Hide;
  /**
   * The id of the element a context menu names, or `null` outside any marked element: inside a
   * list item the item, and the element under the pointer while a part of it is chosen (ADR 0069).
   */
  idOf(target: unknown): string | null;
  /** The copy and the box of the element a context menu names. */
  under(target: unknown): { item?: number; path?: number[]; box?: MenuBox };
};

export type StructureDeps = {
  channel: string;
  /** The structure's own messages, and the `pick` of the element a drag takes. */
  post(message: EditFrameMessage): void;
  /** Where `contextmenu` is heard; the window unless a test says otherwise. */
  listener?: {
    add(handler: (event: MenuEvent) => void): void;
    remove(handler: (event: MenuEvent) => void): void;
  };
  parts?: StructureParts;
  /**
   * A drag began (`true`) or ended (ADR 0066): what else the frame draws (outlines, labels,
   * marks) leaves the page meanwhile. The handles leave with it here.
   */
  quiet?(on: boolean): void;
  /** Sends the log of a gesture that was lost (`gesture-log.ts`); without it no log is kept. */
  report?(message: GestureLogMessage): void;
};

export type FrameStructure = {
  handle(message: EditStudioMessage): void;
  /**
   * The inverse of the canvas zoom: how many pixels of the frame one pixel on the screen is. The
   * drag's threshold, the indicator and the handles keep their size on the screen with it.
   */
  scale(value: number): void;
  /** A build was taken in place (`page/swap.ts`). */
  swapped(): void;
};

const MARKED = '[data-ks]';

/** What the real parts read of the structure when a menu is asked for. */
type MenuState = {
  entries: ReadonlyMap<string, FrameEntry>;
  selection: readonly string[];
  chosen: Chosen;
};

function windowListener(): NonNullable<StructureDeps['listener']> {
  const options = { capture: true };
  return {
    add: (handler) => window.addEventListener('contextmenu', handler, options),
    remove: (handler) => window.removeEventListener('contextmenu', handler, options),
  };
}

function realParts(deps: StructureDeps, state: () => MenuState): StructureParts {
  let real: Indicator | undefined;
  let zoom = 1;
  const indicator: Indicator = {
    show: (slot, lists = []) => {
      if (slot === null && lists.length === 0 && real === undefined) return;
      if (!real) {
        real = createIndicator(document);
        real.scale(zoom);
      }
      real.show(slot, lists);
    },
    scale: (value) => {
      zoom = value;
      real?.scale(value);
    },
    dispose: () => real?.dispose(),
  };
  const { report, channel, post } = deps;
  /** The log of one tool, when there is somebody to send it to. */
  const logOf = (tool: GestureTool): { log?: GestureLog } =>
    report
      ? { log: createGestureLog({ tool, channel, now: () => performance.now(), post: report }) }
      : {};
  /** The element a context menu names: a chosen row stays the row, so the menu is the row's. */
  const named = (target: unknown): Element | null => {
    const { entries, selection, chosen } = state();
    const pressed = target instanceof Element ? target.closest(MARKED) : null;
    return pressedElement(pressed, MENU, { entries, selected: new Set(selection), chosen });
  };
  return {
    drag: ({ entries, selection, locked, quiet }) =>
      createDrag({
        post,
        channel,
        entries,
        selection,
        locked,
        slots: slotAt,
        indicator,
        quiet,
        ...logOf('drag'),
      }),
    handles: (scales) => createHandles({ post, channel, scales, ...logOf('handle') }),
    hide: createHide(document),
    idOf: (target) => named(target)?.getAttribute('data-ks') ?? null,
    under: (target) => {
      const element = named(target);
      const id = element?.getAttribute('data-ks') ?? null;
      if (element === null || id === null) return {};
      const { left, top, width, height } = element.getBoundingClientRect();
      const lists = state().entries.get(id)?.lists;
      return { ...copyOfPick(element, id, lists), box: { x: left, y: top, width, height } };
    },
  };
}

export function createStructure(deps: StructureDeps): FrameStructure {
  const head = { kitvas: 1 as const, channel: deps.channel };
  const listener = deps.listener ?? windowListener();
  // Read when a menu is asked for, long after the state below is set up.
  const parts = deps.parts ?? realParts(deps, () => ({ entries, selection, chosen }));
  let entries: ReadonlyMap<string, FrameEntry> = new Map();
  let space: readonly ScaleStep[] = [];
  let size: readonly ScaleStep[] = [];
  let selection: readonly string[] = [];
  /** The copies the page chose (`select`'s `copies`). */
  let chosen: Chosen = chosenOf(undefined);
  let editing = false;
  /** Locked while editing; Preview takes the pointer as the page would. */
  let locked: string[] = [];
  let handlesOn = false;
  /** A drag runs: the handles are off the page until it ends. */
  let dragging = false;
  // The drag before the handles: their listeners on the window run in the order they were made.
  const drag: Drag = parts.drag({
    entries: () => entries,
    selection: () => selection,
    locked: () => locked,
    quiet(on) {
      dragging = on;
      if (editing) placeHandles();
      deps.quiet?.(on);
    },
  });
  const handles: Handles = parts.handles(() => ({ space, size }));

  /**
   * Handles sit on the one selected copy (`soleCopy`) while edit mode and the page both want them
   * and no drag runs.
   */
  function placeHandles(): void {
    const wanted = editing && handlesOn;
    handles.enable(wanted);
    const copy = wanted && !dragging ? soleCopy(selection, chosen) : null;
    handles.show(copy?.id ?? null, copy?.item);
  }

  const onMenu = (event: MenuEvent): void => {
    event.preventDefault();
    deps.post({
      ...head,
      type: 'menu',
      id: parts.idOf(event.target),
      x: event.clientX,
      y: event.clientY,
      ...parts.under(event.target),
    });
  };

  function turnOn(): void {
    if (editing) return;
    editing = true;
    parts.hide.lock(locked);
    drag.enable(true);
    listener.add(onMenu);
    placeHandles();
  }

  function turnOff(): void {
    if (!editing) return;
    editing = false;
    parts.hide.lock([]);
    drag.enable(false);
    listener.remove(onMenu);
    // `edit.ts` forgets the selection with edit mode; the page sends it again on the next `edit`.
    selection = [];
    chosen = chosenOf(undefined);
    placeHandles();
  }

  return {
    handle(message) {
      switch (message.type) {
        case 'edit':
          if (message.on) turnOn();
          else turnOff();
          break;
        case 'select':
          selection = message.ids;
          chosen = chosenOf(message.copies);
          if (editing) placeHandles();
          break;
        case 'structure':
          entries = new Map(message.entries.map((entry) => [entry.id, entry]));
          break;
        case 'tokens':
          space = message.space;
          size = message.size;
          break;
        case 'handles':
          handlesOn = message.on;
          // Before they are placed: no handle of a property the element cannot take is drawn.
          handles.limit(message.blocked, message.stepped);
          placeHandles();
          break;
        case 'hide':
          parts.hide.set(message.ids);
          break;
        case 'lock':
          locked = message.ids;
          if (editing) parts.hide.lock(locked);
          break;
        case 'drag':
          // A drag the page forwards needs the pointer tools, which exist in edit mode only.
          if (editing) drag.forward(message);
          break;
        case 'release':
          // The page heard a release the frame did not: whichever tool still holds a press ends
          // it. A press on a handle is never a press of the drag, so at most one of them acts.
          if (!editing) break;
          handles.released({ x: message.x, y: message.y }, message.shift, message.alt);
          drag.released({ x: message.x, y: message.y });
          break;
      }
    },

    scale(value) {
      const zoom = value > 0 && Number.isFinite(value) ? value : 1;
      drag.scale(zoom);
      handles.scale(zoom);
    },

    swapped() {
      drag.swapped();
    },
  };
}
