import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Draft } from '../../../../src/drafts/index.ts';
import { choiceLink } from '../../../../src/studio/pages/draft/draft-links.ts';
import {
  grip,
  leftSide,
  lockedNote,
  rail,
  rightSide,
  type SidesInput,
} from '../../../../src/studio/pages/editor/editor-side.ts';
import { escapeHtml, html } from '../../../../src/studio/pages/html.ts';
import { t } from '../../../helpers/translate.ts';

const DRAFT: Draft = {
  schemaVersion: 1,
  slug: 'shop',
  title: 'Shop',
  kind: 'screen',
  kit: { id: 'base', version: '1.0.0', hash: 'a'.repeat(64) },
  createdAt: '2026-11-22T10:00:00.000Z',
  versions: [
    { number: 1, createdAt: '2026-11-22T10:00:00.000Z' },
    { number: 2, createdAt: '2026-11-22T11:00:00.000Z' },
  ],
};

const link = choiceLink(DRAFT, { version: 1, state: 'filled', width: 390 });

const sides = (fields: Partial<SidesInput> = {}): SidesInput => ({
  t,
  locked: null,
  checks: html`<p>findings</p>`,
  sketches: null,
  timeline: true,
  ...fields,
});

const count = (text: string, part: string): number => text.split(part).length - 1;

/** The opening tag of an element found by a part of it. */
const tag = (text: string, part: string): string =>
  new RegExp(`<[a-z]+ [^>]*${part}[^>]*>`).exec(text)?.[0] ?? '';

test('the rail has a button per left pane, Notes among them, and the fold at its end', () => {
  const text = rail(t).text;
  assert.ok(text.startsWith('<nav class="k-island rail-nav"'));
  const panes = [...text.matchAll(/data-rail-tab="([a-z]+)"/g)].map((match) => match[1]);
  assert.deepEqual(panes, ['layers', 'insert', 'why', 'notes']);
  for (const pane of ['layers', 'insert', 'why', 'notes']) {
    const button = tag(text, `data-rail-tab="${pane}"`);
    assert.ok(button.startsWith('<button type="button" class="k-icon-btn rail-btn"'), pane);
    assert.ok(button.includes(`id="editor-rail-${pane}"`), pane);
    assert.ok(button.includes(`aria-controls="editor-pane-${pane}"`), pane);
    // The left panel starts folded: no pane is shown, so none is pressed.
    assert.ok(button.includes('aria-pressed="false"'), pane);
    assert.ok(button.includes(`aria-label="${t(`studio.edit.shell.tab.${pane}`)}"`), pane);
  }
  const fold = tag(text, 'data-fold="left"');
  assert.ok(fold.includes('aria-controls="editor-side-left"'));
  assert.ok(fold.includes('aria-expanded="false"'));
  assert.ok(text.indexOf('data-fold="left"') > text.indexOf('data-rail-tab="notes"'));
});

test('the left panel holds one host per pane, Layers shown, the others hidden', () => {
  const text = leftSide(sides()).text;
  assert.ok(
    text.startsWith('<aside class="k-island side-panel" data-side="left" id="editor-side-left"'),
  );
  assert.ok(tag(text, 'data-side="left"').includes('data-folded'));
  for (const pane of ['layers', 'insert', 'why', 'notes']) {
    const host = tag(text, `data-pane="${pane}"`);
    assert.ok(host.startsWith('<section class="pane-host k-rise"'), pane);
    assert.ok(host.includes(`id="editor-pane-${pane}"`), pane);
    assert.ok(host.includes(`aria-labelledby="editor-rail-${pane}"`), pane);
    assert.equal(host.includes(' hidden'), pane !== 'layers', pane);
  }
  // The regions keep their names (C8).
  assert.ok(tag(text, 'data-pane="insert"').includes('data-edit="palette"'));
  assert.ok(tag(text, 'data-pane="why"').includes('data-edit="why"'));
  assert.ok(tag(text, 'data-pane="notes"').includes('data-edit="notes"'));
});

test('the Layers host holds the tree and, under it, the Versions list', () => {
  const text = leftSide(sides()).text;
  const host = tag(text, 'data-pane="layers"');
  assert.ok(!host.includes('data-edit'), 'the host itself names no region');
  assert.ok(text.includes('<div class="pane-tree" data-edit="layers"></div>'));
  const versions = tag(text, 'data-timeline');
  assert.ok(versions.startsWith('<div class="pane-versions" data-timeline role="group"'));
  assert.ok(versions.includes(`aria-label="${t('studio.edit.timeline.label')}"`));
  assert.ok(versions.includes(' hidden'));
  assert.ok(text.indexOf('data-edit="layers"') < text.indexOf('data-timeline'));
  assert.ok(text.indexOf('data-timeline') < text.indexOf('data-pane="insert"'));
  // While comparing there is no Versions list: compare has a card per version.
  assert.ok(!leftSide(sides({ timeline: false })).text.includes('data-timeline'));
});

test('the right panel keeps its tabs, the fold, the conflict note and the rail', () => {
  const text = rightSide(sides()).text;
  assert.ok(
    text.startsWith('<aside class="k-island side-panel" data-side="right" id="editor-side-right"'),
  );
  assert.ok(text.includes('<div class="k-tabs side-tabs" role="tablist"'));
  const tabs = [
    ...text.matchAll(
      /<button type="button" class="k-tab" role="tab" id="editor-tab-([a-z]+)" data-tab="\1"/g,
    ),
  ];
  assert.deepEqual(
    tabs.map((match) => match[1]),
    ['properties', 'changes', 'checks', 'ai'],
  );
  assert.ok(tag(text, 'data-tab="checks"').includes('aria-selected="true"'));
  assert.ok(tag(text, 'data-tab="properties"').includes('tabindex="-1"'));
  assert.ok(text.includes('data-fold="right"'));
  assert.ok(text.indexOf('data-edit="conflict" hidden') < text.indexOf('data-pane="properties"'));
  const railButton = tag(text, 'data-rail="right"');
  const name = t('studio.edit.shell.tab.checks');
  assert.ok(
    railButton.includes(`aria-label="${escapeHtml(t('studio.edit.shell.open', { name }))}"`),
  );
  assert.ok(text.includes(`<span class="side-rail-name">${name}</span>`));
});

test('the Claude tab keeps its hooks: the tab is ai, and so is the region', () => {
  const text = rightSide(sides()).text;
  const tab = /<button [^>]*data-tab="ai"[^>]*>([^<]*)<\/button>/.exec(text);
  assert.equal(tab?.[1], t('studio.edit.shell.tab.ai'));
  assert.equal(t('studio.edit.shell.tab.ai'), 'Claude');
  assert.ok(tag(text, 'data-pane="ai"').includes('data-edit="ai"'));
});

test('the right panes are tabpanels with their regions; Checks is shown, with its content', () => {
  const text = rightSide(sides()).text;
  const regions = {
    properties: 'data-edit="props"',
    changes: 'data-edit="changes"',
    checks: 'data-shell="checks"',
    ai: 'data-edit="ai"',
  };
  for (const [pane, region] of Object.entries(regions)) {
    const host = tag(text, `data-pane="${pane}"`);
    assert.ok(host.includes(region), pane);
    assert.ok(host.includes('role="tabpanel"'), pane);
    assert.ok(host.includes(`aria-labelledby="editor-tab-${pane}"`), pane);
    assert.equal(host.includes(' hidden'), pane !== 'checks', pane);
  }
  assert.ok(text.includes('data-shell="checks" data-pane="checks"'));
  assert.ok(text.includes('<p>findings</p></section>'));
  // Properties says how to fill it while Edit is off.
  const empty = escapeHtml(t('studio.edit.shell.propsOff'));
  assert.ok(tag(text, 'data-pane="properties"').includes(`data-empty="${empty}"`));
});

test('a craft draft has the Sketches tab and pane', () => {
  const text = rightSide(sides({ sketches: html`<section>pick</section>` })).text;
  assert.ok(text.includes('data-tab="sketches"'));
  assert.ok(tag(text, 'data-pane="sketches"').includes('data-shell="sketches"'));
  assert.ok(!rightSide(sides()).text.includes('sketches'));
});

test('a version that cannot be edited says why in the editor panes, with the one next step', () => {
  const old = lockedNote({ t, block: 'old', link, latest: 2, slug: 'shop' });
  assert.ok(old.text.startsWith('<div class="k-empty pane-empty"><p>'));
  assert.ok(old.text.includes(escapeHtml(t('studio.edit.shell.reason.old'))));
  const latest = escapeHtml('/drafts/shop?version=2&state=filled&width=390');
  assert.ok(old.text.includes(`<a class="k-btn k-btn-line" href="${latest}">`));
  assert.ok(old.text.includes(t('studio.edit.shell.toLatest')));
  const compare = lockedNote({ t, block: 'compare', link, latest: 2, slug: 'shop' });
  assert.ok(compare.text.includes(t('studio.draft.stopCompare')));
  const unbuilt = lockedNote({ t, block: 'unbuilt', link, latest: 1, slug: 'shop' });
  assert.ok(unbuilt.text.includes('<div class="k-cmd"><code>kitvas build shop</code>'));
  // The note stands in the editor's panes of both sides; Properties then has no empty text.
  const locked = sides({ locked: old });
  const left = leftSide(locked).text;
  const right = rightSide(locked).text;
  assert.equal(count(left, 'pane-empty'), 3);
  assert.equal(count(right, 'pane-empty'), 3);
  assert.ok(!tag(right, 'data-pane="properties"').includes('data-empty'));
});

test('a grip is a separator the keyboard can move; the left one starts hidden', () => {
  const left = grip(t, 'left').text;
  assert.ok(
    left.startsWith('<div class="side-grip" data-grip="left" role="separator" tabindex="0"'),
  );
  assert.ok(left.includes('aria-controls="editor-side-left"'));
  assert.ok(left.endsWith(' hidden></div>'));
  assert.ok(!grip(t, 'right').text.includes('hidden'));
});

test('nothing in the sides styles itself', () => {
  const text = `${rail(t).text}${leftSide(sides()).text}${rightSide(sides()).text}`;
  assert.ok(!text.includes('style='));
});
