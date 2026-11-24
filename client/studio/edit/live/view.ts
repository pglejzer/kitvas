// The live checks on the screen (spec 4c, goals 5 and 7; plan 16, task C): the Live section above
// the Checks pane, grouped by element with the widths each finding was seen at, and the selected
// element's live findings with its accessibility card above the Properties pane. Each is a block
// of its own beside its pane, never inside it (the pane's own script redraws its content, and a
// state switch swaps the Checks pane's), shown with the pane's tab through `data-pane`. A finding
// is a `.k-item` with its short name, the evidence it carries and its actions (plan 18, task D).

import type { A11yCard } from '../../../channel/live-protocol.ts';
import { icon } from '../../ui/icon.ts';
import type { EditorContext } from '../context.ts';
import { elementName } from '../history/changes.ts';
import { el } from '../props/controls.ts';
import { text } from '../texts.ts';
import { renderCard } from './card.ts';
import type { FullCheckStatus } from './check.ts';
import { type Evidence, evidenceName, ratioWords } from './evidence.ts';
import type { LiveGroup, LiveRow } from './items.ts';
import { waiverControl } from './waivers.ts';

export type LiveModel = {
  on: boolean;
  groups: LiveGroup[];
  selected: string | null;
  card: A11yCard | null;
  status: FullCheckStatus;
};

export type LiveView = { render(model: LiveModel): void };

/** Whether the accessibility card is open: a convenience of this viewer only. */
const CARD_KEY = 'kitvas.edit.a11yOpen';

/** A row of a finding; the accessibility card links its problems to them. */
export const LIVE_ROW = 'checks-live-row';

function readOpen(): boolean {
  try {
    return localStorage.getItem(CARD_KEY) !== '0';
  } catch {
    return true;
  }
}

function writeOpen(open: boolean): void {
  try {
    localStorage.setItem(CARD_KEY, open ? '1' : '0');
  } catch {
    // Storage refused: the card opens as it did.
  }
}

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

function whereOf(row: LiveRow): string {
  if (row.widths.length === 0) return text('live.inCode');
  return text('live.at', { widths: row.widths.join(', ') });
}

/** The measured part of a finding: the number in its tone, and what it is held against. */
export function evidenceLine(evidence: Evidence, tone: 'fix' | 'review'): HTMLElement | null {
  const line = el('p', 'checks-evidence');
  const strong = (words: string): HTMLElement => el('strong', `k-${tone}`, words);
  const quiet = (words: string): HTMLElement => el('span', 'k-meta', words);
  const code = (words: string): HTMLElement => el('code', 'k-mono', words);
  const arrow = (): Node[] => [icon('arrow-right'), el('span', 'k-sr', text('changes.chip.to'))];
  switch (evidence.kind) {
    case 'contrast':
      line.append(
        strong(text('checks.ratio', { ratio: ratioWords(evidence.ratio) })),
        quiet(text('checks.needs', { needed: ratioWords(evidence.needed) })),
      );
      break;
    case 'target':
      line.append(
        strong(text('checks.size', { width: evidence.width, height: evidence.height })),
        quiet(text('checks.needsSize', { min: evidence.min })),
      );
      break;
    case 'overflow':
      line.append(
        strong(text('checks.px', { value: evidence.content })),
        quiet(text('checks.inBox', { width: evidence.width })),
      );
      break;
    case 'mismatch':
      line.append(
        code(evidence.property),
        code(evidence.expected),
        ...arrow(),
        strong(evidence.actual),
      );
      break;
    case 'token':
      line.append(
        code(evidence.value),
        ...arrow(),
        code(evidence.token),
        quiet(text('checks.nearest')),
      );
      break;
    case 'heading':
      line.append(strong(text('checks.level', { level: evidence.level })));
      break;
    case 'message':
      return null;
  }
  return line;
}

function rowOf(ctx: EditorContext, element: string | null, row: LiveRow): HTMLElement {
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
  const name = evidenceName(row.evidence);
  head.append(dot, el('span', 'checks-finding-title', name === null ? row.message : text(name)));
  item.append(head);
  const evidence = evidenceLine(row.evidence, row.severity);
  if (evidence) item.append(evidence);
  item.append(el('small', 'k-meta', whereOf(row)));
  const actions = el('div', 'checks-actions');
  actions.append(waiverControl(ctx, { rule: row.rule, element }));
  item.append(actions);
  return item;
}

function rowsOf(ctx: EditorContext, group: LiveGroup): HTMLElement {
  const list = el('ul', 'k-stack checks-live-rows');
  for (const row of group.rows) list.append(rowOf(ctx, group.id, row));
  return list;
}

function labelOf(group: LiveGroup): HTMLElement | null {
  if (group.label === null) return null;
  const tag = el('span', 'checks-num', group.label);
  tag.dataset.tone = group.tone;
  return tag;
}

function groupOf(ctx: EditorContext, group: LiveGroup): HTMLElement {
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
  item.append(rowsOf(ctx, group));
  return item;
}

/** What a block shows, as text: an unchanged block is left alone, so its focus stays. */
const keyOf = (value: unknown): string => JSON.stringify(value);

export function mountLiveView(ctx: EditorContext): LiveView {
  const checksPane = ctx.panel.querySelector('[data-shell="checks"]');
  const propsPane = ctx.panel.querySelector('section[data-edit="props"]');
  const checks = blockBefore(checksPane, 'live-checks', text('live.label'));
  const props = blockBefore(propsPane, 'live-props', text('live.here'));
  let open = readOpen();
  let shownChecks = '';
  let shownProps = '';

  // The title and the status line stay, so a screen reader hears the status change.
  const title = el('h2', 'checks-live-title', text('live.title'));
  const status = el('p', 'k-meta checks-live-status');
  status.setAttribute('role', 'status');
  const head = el('div', 'checks-live-head');
  head.append(title, status);
  const body = el('div', 'checks-live-body');
  checks?.append(head, body);

  function renderChecks(model: LiveModel): void {
    if (!checks) return;
    checks.toggleAttribute('data-off', !model.on);
    const key = STATUS_KEYS[model.status];
    const said = key === null ? '' : text(key);
    if (status.textContent !== said) status.textContent = said;
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
    for (const group of model.groups) list.append(groupOf(ctx, group));
    body.replaceChildren(list);
  }

  function renderProps(model: LiveModel): void {
    if (!props) return;
    const group = model.groups.find((one) => one.id !== null && one.id === model.selected);
    const something = group !== undefined || model.card !== null;
    const shown = model.on && model.selected !== null && something;
    props.toggleAttribute('data-off', !shown);
    const next = keyOf([shown, model.selected, group, model.card]);
    if (next === shownProps) return;
    shownProps = next;
    if (!shown) {
      props.replaceChildren();
      return;
    }
    const parts: HTMLElement[] = [];
    const findings = el('div', 'checks-here-findings');
    if (group) {
      const heading = el('h3', 'checks-live-title', text('live.here'));
      const tag = labelOf(group);
      if (tag) heading.prepend(tag);
      findings.append(heading, rowsOf(ctx, group));
      parts.push(findings);
    }
    if (model.card) {
      const card = renderCard(model.card, {
        open,
        onToggle: (value) => {
          open = value;
          writeOpen(value);
        },
        findingOf: (rule) => {
          for (const row of findings.querySelectorAll<HTMLElement>(`.${LIVE_ROW}`)) {
            if (row.dataset.liveRule === rule && row.dataset.accepted === undefined) return row;
          }
          return null;
        },
      });
      parts.push(card);
    }
    props.replaceChildren(...parts);
  }

  return {
    render(model) {
      renderChecks(model);
      renderProps(model);
    },
  };
}
