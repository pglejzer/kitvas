// The version timeline (spec 4d, goal 5; plan 17, task D): the strip under the canvas, an older
// version shown read only (`store.viewing`), the selected element's changes, Bring back.
//
// The strip has one point per version; the latest is "now". A click, or a drag let go over a
// point, shows that version in every card (`canvas/version-view.ts`) with Edit off; "Back to now"
// and the Edit button return. The element selected when the person left now is the strip's
// subject: its history marks the points, and Bring back asks the studio for the preview of its
// old source and shows it as a diff to accept (`diff/diff-dialog.ts`). The rules are in
// `points.ts`; this file wires them to the page.

import { showVersion } from '../../canvas/version-view.ts';
import { frameMessage } from '../../frames.ts';
import type { EditorContext } from '../context.ts';
import { showDiff } from '../diff/diff-dialog.ts';
import { modePatch } from '../select/mode.ts';
import { frameAddress } from '../sync/live-frame.ts';
import { text } from '../texts.ts';
import { toast } from '../toast.ts';
import { getHistory, getVersions, isBuilt, postAsk, postRestore } from './api.ts';
import {
  askWords,
  type ElementHistory,
  idIn,
  type Point,
  pointAt,
  pointsOf,
  type RestorePreview,
} from './points.ts';

/** A pointer that moved this far over the track is a drag, not a click. */
const DRAG_PX = 4;
/** The element's history is read again this long after its files last changed. */
const HISTORY_DELAY_MS = 400;
/** How long the strip says that something did not work. */
const FAILURE_MS = 6_000;

function button(className: string, label: string): HTMLButtonElement {
  const made = document.createElement('button');
  made.type = 'button';
  made.className = className;
  made.textContent = label;
  return made;
}

export function mountTimeline(ctx: EditorContext): void {
  const { store, slug, main, bridge } = ctx;
  const found = main.querySelector<HTMLElement>('[data-timeline]');
  if (!found) return;
  const host: HTMLElement = found;

  const track = document.createElement('div');
  track.className = 'timeline-track';
  track.setAttribute('role', 'group');
  track.setAttribute('aria-label', text('timeline.versions'));
  const status = document.createElement('p');
  status.className = 'timeline-status';
  status.setAttribute('role', 'status');
  const bring = button('timeline-action', text('timeline.bring'));
  const back = button('timeline-action', text('timeline.back'));
  back.dataset.primary = '';
  host.append(track, status, bring, back);

  let versions: number[] = [];
  /** The element the marks and Bring back are about, by its id in the latest version. */
  let subject: string | null = null;
  let history: ElementHistory | null = null;
  /** Edit was on when the person left now; "Back to now" turns it on again. */
  let wasOn = false;
  /** A line the strip says by itself (a load, a failure) instead of the viewing line. */
  let note = '';
  let reads = 0;
  let loads = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** A drag over the track: the point under the pointer, and whether it moved far enough. */
  let drag: { start: number; over: number; moved: boolean } | null = null;
  let dragged = false;

  const latest = (): number | undefined => store.get().edit?.version ?? versions.at(-1);
  const points = (): Point[] =>
    pointsOf(versions, store.get().viewing, subject === null ? null : (history?.steps ?? null));

  function render(): void {
    const { viewing } = store.get();
    const list = points();
    host.hidden = list.length < 2;
    // The canvas makes room for the strip only while it shows (`edit-skin/timeline.ts`).
    host.closest('[data-shell="canvas"]')?.toggleAttribute('data-has-timeline', !host.hidden);
    track.replaceChildren(
      ...list.map((point, index) => {
        const label = point.now ? text('timeline.now') : String(point.version);
        const made = button('timeline-point', label);
        made.dataset.version = String(point.version);
        made.dataset.mark = point.mark;
        if (point.shown) made.setAttribute('aria-current', 'true');
        if (drag?.over === index) made.dataset.over = '';
        const words = [text('timeline.point', { version: point.version })];
        if (point.now) words.push(text('timeline.now'));
        if (point.mark !== 'none') words.push(text(`timeline.mark.${point.mark}`));
        made.title = words.join(', ');
        made.setAttribute('aria-label', made.title);
        return made;
      }),
    );
    back.hidden = viewing === null;
    bring.hidden = viewing === null;
    bring.disabled = idIn(history?.steps ?? null, viewing) === null || subject === null;
    bring.title = bring.disabled ? text('timeline.bringNone') : '';
    const line = viewing === null ? '' : text('timeline.viewing', { version: viewing });
    status.textContent = note || line;
  }

  /** `brief`: a failure, which goes away by itself so it never stands over a later view. */
  function say(message: string, brief = false): void {
    note = message;
    render();
    if (!brief) return;
    setTimeout(() => {
      if (note === message) say('');
    }, FAILURE_MS);
  }

  async function readVersions(): Promise<void> {
    const read = await getVersions(slug);
    if (read.length === 0) return;
    versions = [...read].sort((a, b) => a - b);
    render();
  }

  async function readHistory(): Promise<void> {
    const mine = ++reads;
    const id = subject;
    const answer = id === null ? null : await getHistory(slug, id);
    if (mine !== reads) return;
    history = answer;
    render();
  }

  /** Every card loads `version`; the line stays until the first of them is there. */
  function frame(version: number, viewing: boolean): void {
    loads += 1;
    const live = Date.now() + loads;
    const loading = showVersion(
      main,
      bridge.frames(),
      { version, viewing, caption: text('timeline.caption', { version }) },
      (current, next) => frameAddress(current, { version: next, state: main.dataset.state, live }),
    );
    if (loading.length > 0 && viewing) note = text('timeline.loading', { version });
  }

  async function view(version: number): Promise<void> {
    if (store.get().viewing === version) return;
    const mine = ++loads;
    say(text('timeline.checking', { version }));
    const built = await isBuilt(slug, version);
    if (mine !== loads) return;
    if (built !== true) {
      // Only the latest version can be built from the studio; an older one is built by Claude.
      say(text(built === null ? 'timeline.failed' : 'timeline.notBuilt', { version }), true);
      return;
    }
    const state = store.get();
    if (state.viewing === null) wasOn = state.on;
    note = '';
    frame(version, true);
    // The selection goes with Edit; `subject` keeps the element for the marks and Bring back.
    store.set({ viewing: version, ...(modePatch(state.on, 'preview') ?? {}) });
  }

  /** Back to the version the editor edits, with the subject selected again when Edit is on. */
  function toNow(on: boolean): void {
    const version = latest();
    if (store.get().viewing === null || version === undefined) return;
    loads += 1;
    note = '';
    frame(version, false);
    store.set({ viewing: null, on, selection: on && subject !== null ? [subject] : [] });
  }

  function go(version: number): void {
    if (version === latest()) toNow(wasOn);
    else void view(version);
  }

  function accept(preview: RestorePreview, version: number): void {
    const ops = preview.ops;
    if (ops === null) return;
    toNow(true);
    void ctx.history.apply({
      ops,
      label: text('timeline.bringLabel', { version }),
      selectCreated: true,
    });
  }

  function ask(id: string, version: number, preview: RestorePreview): void {
    const request = {
      element: id,
      context: store.get().context,
      text: askWords(id, version, preview),
    };
    void postAsk(slug, request).then((sent) => {
      toast(main, text(sent ? 'timeline.asked' : 'timeline.askFailed'));
    });
  }

  async function bringBack(): Promise<void> {
    const version = store.get().viewing;
    const id = subject;
    if (version === null || id === null) return;
    bring.disabled = true;
    const answer = await postRestore(slug, { id, version });
    if (store.get().viewing !== version) return;
    if (!answer.ok) {
      const gone = answer.code === 'EDIT_ELEMENT_NOT_FOUND';
      say(text(gone ? 'timeline.gone' : 'timeline.failed', { version }), true);
      return;
    }
    const preview = answer.body;
    render();
    showDiff(ctx, {
      title: text('timeline.bringTitle', { version }),
      file: preview.file,
      old: preview.old,
      current: preview.current,
      imports: preview.imports,
      missing: preview.missing,
      accept: () => accept(preview, version),
      askClaude: () => ask(id, version, preview),
    });
  }

  /** The index of the point under a pointer at page `x`. */
  const over = (x: number): number => {
    const first = track.firstElementChild?.getBoundingClientRect();
    const last = track.lastElementChild?.getBoundingClientRect();
    if (!first || !last) return -1;
    const left = first.left + first.width / 2;
    const right = last.left + last.width / 2;
    return pointAt(x - left, right - left, track.childElementCount);
  };

  track.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    drag = { start: event.clientX, over: over(event.clientX), moved: false };
    dragged = false;
  });
  // On the window: a drag carries on while the pointer leaves the strip.
  window.addEventListener('pointermove', (event) => {
    if (drag === null) return;
    const next = over(event.clientX);
    const moved = drag.moved || Math.abs(event.clientX - drag.start) > DRAG_PX;
    if (next === drag.over && moved === drag.moved) return;
    drag = { ...drag, over: next, moved };
    if (moved) render();
  });
  window.addEventListener('pointerup', () => {
    const ended = drag;
    drag = null;
    if (ended === null || !ended.moved) return;
    // The click that follows a drag is not a second choice.
    dragged = true;
    const point = points()[ended.over];
    render();
    if (point) go(point.version);
  });
  window.addEventListener('pointercancel', () => {
    drag = null;
    render();
  });
  track.addEventListener('click', (event) => {
    if (dragged) {
      dragged = false;
      return;
    }
    if (!(event.target instanceof Element)) return;
    const version = Number(event.target.closest<HTMLElement>('[data-version]')?.dataset.version);
    if (Number.isInteger(version) && version > 0) go(version);
  });
  back.addEventListener('click', () => toNow(wasOn));
  bring.addEventListener('click', () => void bringBack());

  // A card that loaded the version says `ready`: the loading line has done its work.
  window.addEventListener('message', (event) => {
    if (note === '' || store.get().viewing === null) return;
    if (frameMessage(bridge.frames(), event)?.message.type === 'ready') say('');
  });

  store.subscribe((state, previous) => {
    if (state.viewing !== null) {
      // Edit pressed while an older version shows: back to now, editing.
      if (state.on && !previous.on) toNow(true);
      else if (state.viewing !== previous.viewing) render();
      return;
    }
    if (state.edit?.version !== previous.edit?.version) void readVersions();
    const next = state.on ? (state.selection[0] ?? null) : null;
    if (next !== subject) {
      subject = next;
      history = null;
      render();
      void readHistory();
    } else if (state.etags !== previous.etags && subject !== null) {
      // The element may have changed, by an edit or by Claude: its marks follow, once it rests.
      clearTimeout(timer);
      timer = setTimeout(() => void readHistory(), HISTORY_DELAY_MS);
    } else if (state.viewing !== previous.viewing) render();
  });

  render();
  void readVersions();
}
