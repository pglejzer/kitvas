// The live checks on the screen (spec 4c, goals 5 and 7; plan 16, task C): the Live section above
// the Checks pane, grouped by element with the widths each finding was seen at, and the selected
// element's live findings above the Properties pane (its accessibility is a group of the pane). Each is a block
// of its own beside its pane, never inside it (the pane's own script redraws its content, and a
// state switch swaps the Checks pane's), shown with the pane's tab through `data-pane`. A finding
// is a `.k-item` with its short name, the evidence it carries and its actions (plan 18, task D):
// Apply when kitvas can make the fix, else Ask Claude, and the Dismiss icon at the head (ADR 0061,
// `fix-view.ts`, `dismiss.ts`).

import { codeRow, measuredRow } from '../checks/evidence-view.ts';
import { setRunState } from '../checks/run.ts';
import type { EditorContext } from '../context.ts';
import { elementName } from '../history/changes.ts';
import { el } from '../props/controls.ts';
import { viewerStorage } from '../props/groups.ts';
import { text } from '../texts.ts';
import type { FullCheckStatus } from './check.ts';
import { dismissControl } from './dismiss.ts';
import { createFixes, type Fixes, fixControl } from './fix-view.ts';
import { barWords, hereBar, readOpen, writeOpen } from './here-bar.ts';
import { type LiveGroup, type LiveRow, openCount } from './items.ts';
import { rowNameKey, whereWords } from './row-words.ts';
import { keepSteady } from './steady.ts';
import { tokenButton } from './use-token.ts';

export type LiveModel = {
  on: boolean;
  groups: LiveGroup[];
  selected: string | null;
  status: FullCheckStatus;
};

export type LiveView = { render(model: LiveModel): void };

/** The box of the cards the line above Properties opens. */
const HERE_CARDS = 'live-here-cards';

/** A row of a finding; the Accessibility group of Properties links its problems to them. */
export const LIVE_ROW = 'checks-live-row';

const STATUS_KEYS: Record<FullCheckStatus, string | null> = {
  idle: null,
  running: 'live.check.running',
  done: 'live.check.done',
  failed: 'live.check.failed',
};

/** A block in front of `pane`, shown with the pane's tab. */
function blockBefore(pane: Element | null, region: string, label: string): HTMLElement | null {
  if (!(pane instanceof HTMLElement) || pane.parentElement === null) return null;
  const block = el('section', region === 'live-checks' ? 'checks-live' : 'checks-here');
  block.dataset.edit = region;
  if (pane.dataset.pane !== undefined) block.dataset.pane = pane.dataset.pane;
  block.setAttribute('aria-label', label);
  block.hidden = pane.hidden;
  pane.before(block);
  return block;
}

/** The evidence row of a finding, in the box the Checks cards use (`checks/evidence-view.ts`). */
function evidenceOfRow(
  ctx: EditorContext,
  element: string | null,
  row: LiveRow,
): HTMLElement | null {
  if (row.evidence.kind !== 'message') return measuredRow(row.evidence, row.severity);
  if (row.source !== 'code') return null;
  const tokens = ctx.store.get().edit?.tokens ?? [];
  return codeRow({ rule: row.rule, raw: row.raw ?? row.message, element }, tokens);
}

function rowOf(
  ctx: EditorContext,
  fixes: Fixes,
  element: string | null,
  row: LiveRow,
): HTMLElement {
  const item = el('li', `k-item ${LIVE_ROW}`);
  item.dataset.tone = row.severity;
  item.dataset.liveRule = row.rule;
  if (row.waived) item.dataset.accepted = '';
  // A problem of the accessibility card moves the focus here.
  item.tabIndex = -1;
  const head = el('div', 'checks-finding-head');
  const dot = el('span', 'k-dot');
  dot.dataset.state = row.waived ? 'good' : row.severity;
  dot.setAttribute('aria-hidden', 'true');
  // A short name in plain words; the finding's own message is the name's tooltip.
  const name = rowNameKey(row);
  const title = el('span', 'checks-finding-title', name === null ? row.message : text(name));
  if (name !== null) title.title = row.raw ?? row.message;
  // Dismiss is an icon button at the head's end; its row opens at the foot of the item.
  const dismissal = dismissControl(ctx, { rule: row.rule, element });
  const tools = el('span', 'checks-finding-tools');
  tools.append(dismissal.trigger);
  head.append(dot, title, tools);
  item.append(head);
  const evidence = evidenceOfRow(ctx, element, row);
  if (evidence) item.append(evidence);
  item.append(
    el(
      'small',
      'k-meta',
      whereWords(row, (key, params) => text(key, params)),
    ),
  );
  // What Apply will do (or why there is none) in one quiet line, then the button.
  // A colour written by hand gets the kit colour nearest to it; Ask Claude is then the second.
  const use = tokenButton(ctx, element, row);
  const fix = fixControl(ctx, fixes, element, row, use === null);
  const actions = el('div', 'checks-actions');
  if (use) actions.append(use);
  actions.append(fix.button);
  item.append(fix.line, actions, dismissal.panel);
  return item;
}

function rowsOf(ctx: EditorContext, fixes: Fixes, group: LiveGroup): HTMLElement {
  const list = el('ul', 'k-stack checks-live-rows');
  for (const row of group.rows) list.append(rowOf(ctx, fixes, group.id, row));
  return list;
}

function labelOf(group: LiveGroup): HTMLElement | null {
  if (group.label === null) return null;
  const tag = el('span', 'checks-num', group.label);
  tag.dataset.tone = group.tone;
  return tag;
}

function groupOf(ctx: EditorContext, fixes: Fixes, group: LiveGroup): HTMLElement {
  const item = el('li', 'checks-live-group');
  const id = group.id;
  if (id === null) {
    item.append(el('p', 'k-meta checks-live-element', text('live.other')));
  } else {
    const name = elementName(id);
    const button = el('button', 'checks-live-element');
    button.type = 'button';
    button.setAttribute('aria-label', text('live.select', { name }));
    button.title = text('live.select', { name });
    const tag = labelOf(group);
    if (tag) button.append(tag);
    button.append(el('span', 'k-clip', name));
    button.addEventListener('click', () => ctx.store.set({ selection: [id] }));
    item.append(button);
  }
  item.append(rowsOf(ctx, fixes, group));
  return item;
}

/** What a block shows, as text: an unchanged block is left alone, so its focus stays. */
const keyOf = (value: unknown): string => JSON.stringify(value);

export function mountLiveView(ctx: EditorContext): LiveView {
  const checksPane = ctx.panel.querySelector('[data-shell="checks"]');
  const propsPane = ctx.panel.querySelector('section[data-edit="props"]');
  const checks = blockBefore(checksPane, 'live-checks', text('live.label'));
  const props = blockBefore(propsPane, 'live-props', text('live.here'));
  // The source views the fixes are made from, shared by both blocks.
  const fixes = createFixes(ctx);
  let shownChecks = '';
  let shownProps = '';
  // The cards above Properties open only when the person asks (`here-bar.ts`); a height the block
  // changes by itself never moves the pane's rows (`steady.ts`).
  let hereOpen = readOpen(viewerStorage());
  let hereElement: string | null = null;
  let lastModel: LiveModel | null = null;
  const steady = props
    ? keepSteady(props, () => propsPane?.querySelector<HTMLElement>('.props-scroll') ?? null)
    : null;

  // The title and the status line stay, so a screen reader hears the status change.
  const title = el('h2', 'checks-live-title');
  const count = el('span', 'k-count');
  title.append(el('span', undefined, text('live.title')), count);
  const status = el('p', 'k-meta checks-live-status');
  status.setAttribute('role', 'status');
  const head = el('div', 'checks-live-head');
  head.append(title, status);
  const body = el('div', 'checks-live-body');
  checks?.append(head, body);

  function renderChecks(model: LiveModel): void {
    // The pane's Run buttons and the time since the check follow the job (`checks/run.ts`).
    setRunState(ctx.panel, model.status);
    if (!checks) return;
    checks.toggleAttribute('data-off', !model.on);
    const key = STATUS_KEYS[model.status];
    const said = key === null ? '' : text(key);
    if (status.textContent !== said) status.textContent = said;
    const open = model.on ? openCount(model.groups) : 0;
    count.textContent = String(open);
    count.hidden = open === 0;
    const next = keyOf([model.on, model.groups]);
    if (next === shownChecks) return;
    shownChecks = next;
    if (!model.on) {
      body.replaceChildren();
      return;
    }
    if (model.groups.length === 0) {
      body.replaceChildren(el('p', 'k-quiet checks-live-none', text('live.none')));
      return;
    }
    const list = el('ol', 'k-stack checks-live-groups');
    for (const group of model.groups) list.append(groupOf(ctx, fixes, group));
    body.replaceChildren(list);
  }

  function renderProps(model: LiveModel): void {
    if (!props) return;
    lastModel = model;
    const group = model.groups.find((one) => one.id !== null && one.id === model.selected);
    const shown = model.on && model.selected !== null;
    props.toggleAttribute('data-off', !shown);
    const next = keyOf([shown, model.selected, group, hereOpen]);
    if (next === shownProps) return;
    shownProps = next;
    // Another element: the pane under the block is drawn anew, so it is not held in place.
    if (model.selected !== hereElement) steady?.own();
    hereElement = model.selected;
    if (!shown) {
      props.replaceChildren();
      return;
    }
    const words = barWords(group);
    const open = hereOpen && words.cards;
    const bar = hereBar({
      words,
      open,
      tag: group ? labelOf(group) : null,
      cards: HERE_CARDS,
      text,
      onToggle() {
        hereOpen = !hereOpen;
        writeOpen(viewerStorage(), hereOpen);
        steady?.own();
        if (lastModel) renderProps(lastModel);
      },
    });
    const findings = el('div', 'checks-here-findings');
    findings.id = HERE_CARDS;
    findings.hidden = !open;
    if (group && open) findings.append(rowsOf(ctx, fixes, group));
    props.replaceChildren(bar, findings);
  }

  return {
    render(model) {
      renderChecks(model);
      renderProps(model);
    },
  };
}
