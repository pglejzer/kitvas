// `/drafts/<slug>`: one version framed at a width, in a state, with its findings and next step.

import { CHECKS, type ChecksFile, readChecks } from '../../checks/index.ts';
import {
  type Draft,
  type DraftStore,
  latestVersion,
  loadDraft,
  type States,
  versionInfo,
} from '../../drafts/index.ts';
import { type KitStore, loadKit } from '../../kit/index.ts';
import { KitvasError, type Translate } from '../../shared/index.ts';
import {
  type DraftChoice,
  draftHref,
  pickCompare,
  pickState,
  pickVersion,
  pickWidth,
  WIDTHS,
} from '../views/draft-query.ts';
import { findingsFor, nextStep, versionStatus } from '../views/status.ts';
import { filterRow, optionRow } from './controls.ts';
import { craftPick } from './craft-board.ts';
import { stage } from './draft-stage.ts';
import { type FrameOrigin, frameSrc } from './frame-src.ts';
import type { PageRequest } from './gallery.ts';
import { type Html, html } from './html.ts';
import { notesSection } from './notes.ts';
import { originalPane } from './original-pane.ts';
import { page } from './shell.ts';

export type DraftPageDeps = {
  drafts: DraftStore;
  kits: KitStore;
  t: Translate;
  skin: string;
  frame: FrameOrigin;
};

/** The kit's own name; its id when the kit is gone or cannot be read. */
function kitName(kits: KitStore, id: string): string {
  try {
    return loadKit(kits, id).kit.name;
  } catch (error) {
    if (error instanceof KitvasError) return id;
    throw error;
  }
}

/** The latest version before `version`; null when there is none. */
function previousVersion(draft: Draft, version: number): number | null {
  const earlier = draft.versions.map((entry) => entry.number).filter((n) => n < version);
  return earlier.length > 0 ? Math.max(...earlier) : null;
}

/** "Compare with version n" or "Stop comparing"; nothing when there is no earlier version. */
function compareRow(
  t: Translate,
  draft: Draft,
  choice: DraftChoice,
  link: (change: Partial<DraftChoice>, compare: number | null) => string,
): Html | '' {
  const name = t('studio.draft.compareRow');
  // A rework also compares with its original, version 0.
  const original =
    draft.kind === 'rework' && choice.compare !== 0
      ? [{ label: t('studio.draft.compareOriginal'), href: link({}, 0), current: false }]
      : [];
  if (choice.compare !== undefined) {
    const stop = { label: t('studio.draft.stopCompare'), href: link({}, null), current: false };
    return filterRow(name, [stop, ...original]);
  }
  const previous = previousVersion(draft, choice.version);
  const start =
    previous === null
      ? []
      : [
          {
            label: t('studio.draft.compare', { version: previous }),
            href: link({}, previous),
            current: false,
          },
        ];
  if (start.length + original.length === 0) return '';
  return filterRow(name, [...start, ...original]);
}

function controlRows(t: Translate, draft: Draft, states: States, choice: DraftChoice): Html {
  // A comparison stays on while the view changes, except against the version it would show twice.
  const link = (
    change: Partial<DraftChoice>,
    compare: number | null = choice.compare ?? null,
  ): string => {
    const merged = { ...choice, ...change };
    const base: DraftChoice = { version: merged.version, state: merged.state, width: merged.width };
    const keep = compare !== null && compare !== merged.version;
    return draftHref(draft.slug, keep ? { ...base, compare } : base);
  };
  const widths = WIDTHS.map((width) => ({
    label: t(`studio.width.${width}`),
    href: link({ width }),
    current: width === choice.width,
  }));
  const shown = states.states.map((state) => ({
    label: state.label,
    href: link({ state: state.id }),
    current: state.id === choice.state,
    state: state.id,
  }));
  const versions = [...draft.versions]
    .sort((a, b) => b.number - a.number)
    .map((entry) => ({
      label: String(entry.number),
      href: link({ version: entry.number }),
      current: entry.number === choice.version,
    }));
  return html`${optionRow(t('studio.draft.width'), widths)}${optionRow(t('studio.draft.state'), shown)}${optionRow(t('studio.draft.version'), versions)}${compareRow(t, draft, choice, link)}`;
}

/** Where the version came from and what its checks could not do. */
function footLines(
  t: Translate,
  kit: string,
  built: boolean,
  checks: ChecksFile | undefined,
): Html {
  const lines: string[] = [];
  if (built) lines.push(t('studio.draft.kit', { kit }));
  if (built && !checks) lines.push(t('studio.draft.notChecked'));
  if (checks) {
    const skipped = CHECKS.filter((name) => checks.checks[name] === 'skipped').map((name) =>
      t(`studio.check.${name}`),
    );
    if (skipped.length > 0) lines.push(t('studio.draft.skipped', { checks: skipped.join(', ') }));
    if (checks.findings.length === 0) lines.push(t('studio.draft.clean'));
  }
  return html`<div class="foot">${lines.map((line) => html`<p>${line}</p>`)}</div>`;
}

export function draftPage(deps: DraftPageDeps, slug: string, request: PageRequest): string {
  const { t } = deps;
  const draft = loadDraft(deps.drafts, slug);
  const version = pickVersion(request.query, draft);
  const info = versionInfo(deps.drafts, slug, version);
  const compare = pickCompare(request.query, draft, version);
  const choice: DraftChoice = {
    version,
    state: pickState(request.query, info.states),
    width: pickWidth(request.query),
    ...(compare === null ? {} : { compare }),
  };
  const checks = info.built ? readChecks(deps.drafts, slug, version) : undefined;
  const { shown, elsewhere } = findingsFor(checks, choice.state, choice.width);
  const next = nextStep(versionStatus(info.built, checks), slug, latestVersion(draft));
  const target = (number: number) => ({ slug, version: number, state: choice.state });
  // Compare 0 is the original of a rework: a picture, not a built version.
  const original =
    compare === 0
      ? originalPane({
          t,
          store: deps.drafts,
          slug,
          title: draft.title,
          width: choice.width,
          score: checks?.rework ?? null,
        })
      : null;
  const framed = stage({
    t,
    host: request.host,
    width: choice.width,
    name: draft.title,
    version,
    built: info.built,
    slug,
    src: frameSrc(deps.frame, request.host, target(version)),
    original,
    compare:
      compare === null || compare === 0
        ? null
        : {
            version: compare,
            built: versionInfo(deps.drafts, slug, compare).built,
            src: frameSrc(deps.frame, request.host, target(compare)),
          },
  });
  const kit = kitName(deps.kits, draft.kit.id);
  const layout = choice.width > WIDTHS[0] ? 'draft wide' : 'draft';
  const controls = html`<section class="controls" aria-label="${t('studio.draft.controls')}">${controlRows(t, draft, info.states, choice)}${footLines(t, kit, info.built, checks)}</section>`;
  const notes = notesSection({ t, shown, elsewhere, next });
  const attrs = html` data-draft="${slug}" data-version="${version}" data-state="${choice.state}" data-width="${choice.width}"${compare === null || compare === 0 ? '' : html` data-compare="${compare}"`}`;
  const script = html`<script type="module" src="/assets/draft.js"></script>`;
  const craft = craftPick(t, draft) ?? '';
  const body = html`<main class="draft-page"${attrs}><h1>${draft.title}</h1><div class="${layout}">${controls}<section class="stage">${framed}${craft}</section>${notes}</div>${script}</main>`;
  return page({
    title: draft.title,
    nonce: request.nonce,
    skin: deps.skin,
    nav: { t, current: null },
    body,
  });
}
