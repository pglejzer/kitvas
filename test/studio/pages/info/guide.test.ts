import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeHtml } from '../../../../src/studio/pages/html.ts';
import { t } from '../../../helpers/translate.ts';
import { count, infoPage, mainOf } from './info-helpers.ts';

test('the guide has the block with one h1, the back link, the page script and the foot line', async () => {
  const text = await infoPage('guide');
  const main = mainOf(text);
  assert.ok(
    main.startsWith(
      '<main class="k-page start info"><section class="start-block k-inverse info-block">',
    ),
  );
  assert.equal(count(main, '<h1'), 1);
  assert.ok(main.includes(`<h1>${escapeHtml(t('studio.guide.title'))}</h1>`));
  assert.ok(main.includes('<a class="info-back" href="/">'));
  assert.ok(main.includes(escapeHtml(t('studio.info.back'))));
  assert.ok(main.includes('<script type="module" nonce="N0nce" src="/assets/page.js"></script>'));
  assert.ok(main.includes('<a href="/guide" aria-current="page">'));
  assert.ok(main.includes('<a href="/shortcuts">'));
});

test('the bar has no current link, because the guide is not one of its pages', async () => {
  const text = await infoPage('guide');
  assert.ok(text.includes('class="k-bar"'));
  const bar = /<header class="k-bar">[\s\S]*?<\/header>/.exec(text)?.[0] ?? '';
  assert.ok(bar.length > 0);
  assert.ok(!bar.includes('aria-current'));
});

test('the four steps are cards of the start page, each with a title', async () => {
  const main = mainOf(await infoPage('guide'));
  const steps = /<ol class="start-steps info-steps-4">[\s\S]*?<\/ol>/.exec(main)?.[0] ?? '';
  assert.equal(count(steps, '<li><h3>'), 4);
  for (const id of ['teach', 'ask', 'check', 'change']) {
    assert.ok(steps.includes(`<h3>${escapeHtml(t(`studio.guide.step.${id}`))}</h3>`), id);
  }
});

test('each of the seven skills is a card with its command in a copy box, what you give and get', async () => {
  const main = mainOf(await infoPage('guide'));
  const cards = [...main.matchAll(/<li class="info-card info-skill"[\s\S]*?<\/li>/g)].map(
    (m) => m[0],
  );
  assert.equal(cards.length, 7);
  const commands = [
    '/kitvas',
    '/kitvas:compose',
    '/kitvas:rework',
    '/kitvas:craft',
    '/kitvas:learn',
    '/kitvas:kit',
    escapeHtml('/kitvas:edit <draft>'),
  ];
  commands.forEach((command, at) => {
    const card = cards[at] ?? '';
    assert.ok(card.includes(`<div class="k-cmd"><code>${command}</code>`), command);
    assert.ok(card.includes('data-copy'), command);
    assert.ok(card.includes(`<dt>${escapeHtml(t('studio.guide.give'))}</dt>`), command);
    assert.ok(card.includes(`<dt>${escapeHtml(t('studio.guide.get'))}</dt>`), command);
  });
});

test('the guide links to the doctor and says how a command is run by hand', async () => {
  const main = mainOf(await infoPage('guide'));
  assert.equal(count(main, 'class="info-trio"'), 1);
  assert.ok(main.includes('<a class="info-link" href="/doctor">'));
  assert.ok(main.includes(escapeHtml('node <plugin folder>/bin/kitvas.ts <command>')));
  for (const name of ['status', 'studio', 'doctor', 'draft', 'kit', 'browser']) {
    assert.ok(main.includes(`<li class="info-command"><code>${name}</code>`), name);
  }
});
