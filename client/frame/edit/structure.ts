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
import type { FrameEntry, ScaleStep } from '../../channel/structure-protocol.ts';
import { createDrag, type Drag } from '../drag/drag.ts';
import { createHandles, type Handles } from '../drag/handles.ts';
import { createIndicator, type Indicator, slotAt } from '../drag/slots.ts';
import { createHide, type Hide } from './hide.ts';

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
  }): Drag;
  handles(scales: () => { space: readonly ScaleStep[]; size: readonly ScaleStep[] }): Handles;
  hide: Hide;
  /** The element id around a context menu's target, or `null` outside any marked element. */
  idOf(target: unknown): string | null;
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
};

export type FrameStructure = {
  handle(message: EditStudioMessage): void;
  /**
   * The inverse of the canvas zoom: how many pixels of the frame one pixel on the screen is. The
   * drag's threshold, the indicator and the handles keep their size on the screen with it.
   */
  scale(value: number): void;
};

const MARKED = '[data-ks]';

function windowListener(): NonNullable<StructureDeps['listener']> {
  const options = { capture: true };
  return {
    add: (handler) => window.addEventListener('contextmenu', handler, options),
    remove: (handler) => window.removeEventListener('contextmenu', handler, options),
  };
}

function realParts(deps: StructureDeps): StructureParts {
  let real: Indicator | undefined;
  let zoom = 1;
  const indicator: Indicator = {
    show: (slot) => {
      if (slot === null && real === undefined) return;
      if (!real) {
        real = createIndicator(document);
        real.scale(zoom);
      }
      real.show(slot);
    },
    scale: (value) => {
      zoom = value;
      real?.scale(value);
    },
    dispose: () => real?.dispose(),
  };
  return {
    drag: ({ entries, selection, locked }) =>
      createDrag({
        post: deps.post,
        channel: deps.channel,
        entries,
        selection,
        locked,
        slots: slotAt,
        indicator,
      }),
    handles: (scales) => createHandles({ post: deps.post, channel: deps.channel, scales }),
    hide: createHide(document),
    idOf: (target) =>
      target instanceof Element ? (target.closest(MARKED)?.getAttribute('data-ks') ?? null) : null,
  };
}

export function createStructure(deps: StructureDeps): FrameStructure {
  const head = { kitvas: 1 as const, channel: deps.channel };
  const listener = deps.listener ?? windowListener();
  const parts = deps.parts ?? realParts(deps);
  let entries: ReadonlyMap<string, FrameEntry> = new Map();
  let space: readonly ScaleStep[] = [];
  let size: readonly ScaleStep[] = [];
  let selection: readonly string[] = [];
  let editing = false;
  /** Locked while editing; Preview takes the pointer as the page would. */
  let locked: string[] = [];
  let handlesOn = false;
  const drag: Drag = parts.drag({
    entries: () => entries,
    selection: () => selection,
    locked: () => locked,
  });
  const handles: Handles = parts.handles(() => ({ space, size }));

  const onMenu = (event: MenuEvent): void => {
    event.preventDefault();
    deps.post({
      ...head,
      type: 'menu',
      id: parts.idOf(event.target),
      x: event.clientX,
      y: event.clientY,
    });
  };

  /** Handles sit on a single selected element while edit mode and the page both want them. */
  const placeHandles = (): void => {
    handles.enable(editing && handlesOn);
    handles.show(editing && handlesOn && selection.length === 1 ? (selection[0] ?? null) : null);
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
      }
    },

    scale(value) {
      const zoom = value > 0 && Number.isFinite(value) ? value : 1;
      drag.scale(zoom);
      handles.scale(zoom);
    },
  };
}
