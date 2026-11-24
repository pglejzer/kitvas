// `/drafts/<slug>`: the editor screen (plan 15, C4). The top bar picks the version, compare and the
// mode; the canvas between the side panels frames the version at a width, in a state; the right
// panel holds its findings. The window never scrolls: the panels and the canvas do, each alone.

import { CHECKS, type ChecksFile, readChecks } from '../../checks/index.ts';
import {
  type Draft,
  type DraftStore,
  latestVersion,
  loadDraft,
  versionInfo,
} from '../../drafts/index.ts';
import { type KitStore, loadKit } from '../../kit/index.ts';
import { KitvasError, type Translate } from '../../shared/index.ts';
import {
  type DraftChoice,
  pickCompare,
  pickState,
  pickVersion,
  pickView,
  pickWidth,
} from '../views/draft-query.ts';
import { findingsFor, nextStep, versionStatus } from '../views/status.ts';
import { craftPick } from './craft-board.ts';
import { choiceLink } from './draft-links.ts';
import { dock, stage } from './draft-stage.ts';
import { editMenu, editTexts } from './edit-panel.ts';
import { editBlock, editorBar } from './editor-bar.ts';
import { grip, leftSide, rightSide } from './editor-side.ts';
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

/** Where the version came from and what its checks could not do: the top of the Checks tab. */
function checksLines(
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
  return html`<div class="checks-lines">${lines.map((line) => html`<p>${line}</p>`)}</div>`;
}

type View = {
  deps: DraftPageDeps;
  request: PageRequest;
  draft: Draft;
  choice: DraftChoice;
  built: boolean;
  checks: ChecksFile | undefined;
  /** The compared version, `0` for a rework's original; `null` without compare. */
  compare: number | null;
};

/** The cards of the canvas: the version, beside the compared one or a rework's original. */
function cards(view: View): Html {
  const { deps, request, draft, choice, compare } = view;
  const { t } = deps;
  const slug = draft.slug;
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
          score: view.checks?.rework ?? null,
        })
      : null;
  return stage({
    t,
    host: request.host,
    width: choice.width,
    view: choice.view ?? null,
    name: draft.title,
    version: choice.version,
    built: view.built,
    slug,
    src: frameSrc(deps.frame, request.host, target(choice.version)),
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
}

/** `main`'s data (C4): what the page's scripts read of the view, and whether it can be edited. */
function mainAttrs(view: View, editable: boolean): Html {
  const { choice, compare } = view;
  const compared = compare === null || compare === 0 ? '' : html` data-compare="${compare}"`;
  // A width other than the three the checks run at: the card shows it, the marks stay hidden.
  const custom = choice.view === undefined ? '' : html` data-view="${choice.view}"`;
  const edit = editable ? html` data-edit-panel` : '';
  return html` data-draft="${view.draft.slug}" data-version="${choice.version}" data-state="${choice.state}" data-width="${choice.width}"${compared} data-mode="preview"${custom}${edit}`;
}

export function draftPage(deps: DraftPageDeps, slug: string, request: PageRequest): string {
  const { t } = deps;
  const draft = loadDraft(deps.drafts, slug);
  const version = pickVersion(request.query, draft);
  const info = versionInfo(deps.drafts, slug, version);
  const compare = pickCompare(request.query, draft, version);
  const custom = pickView(request.query);
  const choice: DraftChoice = {
    version,
    state: pickState(request.query, info.states),
    width: pickWidth(request.query),
    ...(compare === null ? {} : { compare }),
    ...(custom === null ? {} : { view: custom }),
  };
  const checks = info.built ? readChecks(deps.drafts, slug, version) : undefined;
  const view: View = { deps, request, draft, choice, built: info.built, checks, compare };
  const { shown, elsewhere } = findingsFor(checks, choice.state, choice.width);
  const latest = latestVersion(draft);
  const next = nextStep(versionStatus(info.built, checks), slug, latest);
  const link = choiceLink(draft, choice);
  const block = editBlock({ built: info.built, version, latest, compare });
  const editable = block === null;

  const bar = editorBar({ t, draft, choice, link, latest, block });
  const sides = {
    t,
    locked: block === null ? null : t(`studio.edit.shell.reason.${block}`),
    checks: html`${checksLines(t, kitName(deps.kits, draft.kit.id), info.built, checks)}${notesSection({ t, shown, elsewhere, next })}`,
    sketches: craftPick(t, draft),
  };
  const canvas = html`<section class="editor-canvas stage" data-shell="canvas" aria-label="${t('studio.edit.shell.canvas')}">${cards(view)}${dock({ t, choice, states: info.states, link })}</section>`;
  const body = html`<main class="draft-page"${mainAttrs(view, editable)}>${bar}<div class="editor-body">${leftSide(sides)}${grip(t, 'left')}${canvas}${grip(t, 'right')}${rightSide(sides)}</div>${editMenu(editable)}${editTexts({ t, nonce: request.nonce })}<script type="module" src="/assets/draft.js"></script></main>`;
  return page({
    title: draft.title,
    nonce: request.nonce,
    skin: deps.skin,
    nav: { t, current: null },
    chrome: 'screen',
    body,
  });
}
