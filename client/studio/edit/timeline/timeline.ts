// The Versions list (spec 4d, goal 5; plan 17, task D; plan 18, task B): at the bottom of the
// Layers pane, an older version shown read only (`store.viewing`), the selected element's changes,
// Bring back.
//
// The list has one row per version, "Now" (the latest) first. A click shows that version in every
// card (`canvas/version-view.ts`) with Edit off; "Back to now" and the Edit button return. The
// element selected when the person left now is the list's subject: its history marks the rows,
// and Bring back asks the studio for the preview of its old source and shows it as a diff to
// accept (`diff/diff-dialog.ts`). A version saved while the page is open slides in. The rules are
// in `points.ts`; this file wires them to the page.

import { showVersion } from '../../canvas/version-view.ts';
import { frameMessage } from '../../frames.ts';
import { iconButton } from '../../ui/icon.ts';
import type { EditorContext } from '../context.ts';
import { showDiff } from '../diff/diff-dialog.ts';
import { modePatch } from '../select/mode.ts';
import { frameAddress } from '../sync/live-frame.ts';
import { text } from '../texts.ts';
import { toast } from '../toast.ts';
import { getHistory, getVersionFacts, getVersions, isBuilt, postAsk, postRestore } from './api.ts';
import { type CheckLine, shotAddress, type VersionFacts, versionLine } from './facts.ts';
import {
  askWords,
  type ElementHistory,
  idIn,
  newVersions,
  type Point,
  type RestorePreview,
  versionRows,
} from './points.ts';

/** The element's history is read again this long after its files last changed. */
const HISTORY_DELAY_MS = 400;
/** How long the list says that something did not work. */
const FAILURE_MS = 6_000;

/** How a saved version's check reads in its row. */
function checkWords(check: CheckLine): string {
  switch (check.kind) {
    case 'none':
      return text('timeline.check.none');
    case 'good':
      return text('timeline.check.good');
    case 'fix':
      return text('timeline.check.fix', { count: check.count });
    case 'review':
      return text('timeline.check.review', { count: check.count });
  }
}

function button(className: string, label: string): HTMLButtonElement {
  const made = document.createElement('button');
  made.type = 'button';
  made.className = className;
  made.textContent = label;
  return made;
}

export function mountTimeline(ctx: EditorContext): void {
  const { store, slug, main, bridge } = ctx;
  // In the Layers pane (C8); the page's own markup before that stays a fallback.
  const found =
    ctx.panel.querySelector<HTMLElement>('[data-timeline]') ??
    document.querySelector<HTMLElement>('[data-timeline]');
  if (!found) return;
  const host: HTMLElement = found;

  const head = document.createElement('div');
  head.className = 'versions-head k-head';
  const heading = document.createElement('h2');
  heading.textContent = text('timeline.label');
  head.append(heading);
  const track = document.createElement('div');
  track.className = 'versions-list';
  track.setAttribute('role', 'group');
  track.setAttribute('aria-label', text('timeline.versions'));
  const status = document.createElement('p');
  // Said to screen readers only: the canvas's caption and the row show the version on view.
  status.className = 'versions-status k-sr';
  status.setAttribute('role', 'status');
  const actions = document.createElement('div');
  actions.className = 'versions-actions';
  const bring = iconButton('undo', text('timeline.bring'));
  const back = button('k-btn k-btn-line', text('timeline.back'));
  back.dataset.primary = '';
  actions.append(bring, back);
  // In the head, which keeps its height: showing an older version moves nothing below it.
  head.append(actions);
  host.append(head, track, status);

  let versions: number[] = [];
  /** What the studio told of each version: its date, its screenshot and its check. */
  const known = new Map<number, VersionFacts>();
  /** The versions that came while the page was open: their rows slide in, once. */
  const fresh = new Set<number>();
  /** The element the marks and Bring back are about, by its id in the latest version. */
  let subject: string | null = null;
  let history: ElementHistory | null = null;
  /** Edit was on when the person left now; "Back to now" turns it on again. */
  let wasOn = false;
  /** A line the list says by itself (a load, a failure) instead of the viewing line. */
  let note = '';
  let reads = 0;
  let loads = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const latest = (): number | undefined => store.get().edit?.version ?? versions.at(-1);
  const rows = () =>
    versionRows(versions, store.get().viewing, subject === null ? null : (history?.steps ?? null));

  /** The picture of a version: its check's screenshot cropped to the top, else a neutral box. */
  function thumb(point: Point): HTMLElement {
    const box = document.createElement('span');
    box.className = 'versions-thumb';
    box.setAttribute('aria-hidden', 'true');
    const shot = known.get(point.version)?.shot ?? null;
    const address = shotAddress(bridge.frames()[0]?.element.src, point.version, shot);
    if (address === null) {
      box.dataset.empty = '';
      return box;
    }
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => {
      image.remove();
      box.dataset.empty = '';
    });
    image.src = address;
    box.append(image);
    return box;
  }

  /** "3 changes, not saved", "No changes", or "Saved 11:40 · All good"; empty until it is read. */
  function lineWords(point: Point): string {
    if (!point.now && !known.has(point.version)) return '';
    const line = versionLine(known.get(point.version), point.now, store.get().changes.length);
    if (line.kind === 'now') {
      if (line.changes === 0) return text('timeline.noChanges');
      return text(line.changes === 1 ? 'timeline.unsavedOne' : 'timeline.unsaved', {
        count: line.changes,
      });
    }
    const check = checkWords(line.check);
    return line.time === null ? check : text('timeline.savedLine', { time: line.time, check });
  }

  function rowView(point: Point): HTMLButtonElement {
    const made = button('versions-row', '');
    made.dataset.version = String(point.version);
    made.dataset.mark = point.mark;
    if (point.shown) made.setAttribute('aria-current', 'true');
    if (fresh.has(point.version)) made.classList.add('k-slide');
    const label = document.createElement('span');
    label.className = 'versions-text';
    const name = document.createElement('span');
    name.className = 'versions-name';
    name.textContent = point.now
      ? text('timeline.now')
      : text('timeline.point', { version: point.version });
    label.append(name);
    const status = lineWords(point);
    if (status !== '') {
      const line = document.createElement('small');
      line.className = 'versions-line k-clip';
      line.textContent = status;
      label.append(line);
    }
    made.append(thumb(point), label);
    if (point.mark !== 'none') {
      const chip = document.createElement('span');
      chip.className = 'versions-mark k-chip';
      chip.textContent = text(`timeline.markShort.${point.mark}`);
      made.append(chip);
    }
    const words = [text('timeline.point', { version: point.version })];
    if (point.now) words.push(text('timeline.now'));
    if (point.mark !== 'none') words.push(text(`timeline.mark.${point.mark}`));
    made.title = words.join(', ');
    made.setAttribute('aria-label', made.title);
    return made;
  }

  /** The bar's version pill names the version on view; back to now, the page's own again. */
  function namePill(viewing: number | null): void {
    const name = main.querySelector<HTMLElement>('[data-version-name]');
    if (name === null) return;
    name.dataset.page ??= name.textContent ?? '';
    name.textContent =
      viewing === null ? name.dataset.page : text('timeline.point', { version: viewing });
    const latestTag = main.querySelector<HTMLElement>('[data-version-latest]');
    if (latestTag !== null) latestTag.hidden = viewing !== null;
  }

  function render(): void {
    const { viewing } = store.get();
    namePill(viewing);
    const list = rows();
    host.hidden = list.length < 2;
    track.replaceChildren(...list.map(rowView));
    fresh.clear();
    back.hidden = viewing === null;
    bring.hidden = viewing === null;
    bring.disabled = idIn(history?.steps ?? null, viewing) === null || subject === null;
    bring.title = bring.disabled ? text('timeline.bringNone') : text('timeline.bring');
    actions.hidden = viewing === null;
    const line = viewing === null ? '' : text('timeline.viewing', { version: viewing });
    status.textContent = note || line;
    status.hidden = status.textContent === '';
  }

  /** `brief`: a failure, which goes away by itself so it never stands over a later view. */
  function say(message: string, brief = false): void {
    note = message;
    render();
    if (!brief) return;
    toast(main, message);
    setTimeout(() => {
      if (note === message) say('');
    }, FAILURE_MS);
  }

  async function readVersions(): Promise<void> {
    const read = await getVersions(slug);
    if (read.length === 0) return;
    const sorted = [...read].sort((a, b) => a - b);
    for (const version of newVersions(versions, sorted)) fresh.add(version);
    versions = sorted;
    render();
    void readFacts();
  }

  /** Each version's date, screenshot and check; `again` is read once more (its check may be new). */
  async function readFacts(again?: number): Promise<void> {
    const wanted = versions.filter((version) => version === again || !known.has(version));
    if (wanted.length === 0) return;
    const read = await Promise.all(wanted.map((version) => getVersionFacts(slug, version)));
    let news = false;
    for (const facts of read) {
      if (facts === null) continue;
      known.set(facts.number, facts);
      news = true;
    }
    if (news) render();
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
      flash: true,
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

  track.addEventListener('click', (event) => {
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
    // "N changes, not saved" follows the change list; a finished build may carry a new check.
    if (state.changes !== previous.changes && versions.length > 0) render();
    if (state.builds !== previous.builds) void readFacts(latest());
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
