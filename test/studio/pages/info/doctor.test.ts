import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CheckResult } from '../../../../src/doctor/index.ts';
import { escapeHtml } from '../../../../src/studio/pages/html.ts';
import { t } from '../../../helpers/translate.ts';
import { count, infoPage, mainOf } from './info-helpers.ts';

const CHECKS: CheckResult[] = [
  { id: 'node', status: 'ok', detail: 'Node 24 runs kitvas.' },
  {
    id: 'browser',
    status: 'warn',
    detail: 'No browser found.',
    fix: 'Run kitvas browser install.',
  },
  { id: 'data', status: 'fail', detail: 'The folder is locked.', fix: 'Check its permissions.' },
  { id: 'studio', status: 'skipped', detail: 'Skipped: no workspace.' },
];
const REPORT = 'kitvas doctor report\nkitvas 1.1.0\nok    node      Node 24 runs kitvas.';

const doctor = async () => ({ checks: CHECKS, report: REPORT });

/** The row of one check. */
function rowOf(text: string, id: string): string {
  const row = new RegExp(`<li class="info-check" data-check="${id}"[\\s\\S]*?</li>`).exec(text);
  assert.ok(row, id);
  return row[0];
}

test('each check is a row with the dot of its status, and a fix line when it has one', async () => {
  const text = await infoPage('doctor', doctor);
  assert.equal(count(mainOf(text), '<h1'), 1);
  assert.ok(rowOf(text, 'node').includes('<span class="k-dot" data-state="good"></span>'));
  assert.ok(rowOf(text, 'browser').includes('<span class="k-dot" data-state="review"></span>'));
  assert.ok(rowOf(text, 'data').includes('<span class="k-dot" data-state="fix"></span>'));
  const skipped = rowOf(text, 'studio');
  assert.ok(skipped.includes('<span class="k-dot"></span>'));
  assert.ok(!skipped.includes('data-state'));
  const fix = t('doctor.fixPrefix', { text: 'Run kitvas browser install.' });
  assert.ok(rowOf(text, 'browser').includes(`<span class="k-meta">${escapeHtml(fix)}</span>`));
  assert.ok(!rowOf(text, 'node').includes('k-meta'));
  assert.ok(rowOf(text, 'data').includes('The folder is locked.'));
});

test('the block holds the four counts and both buttons, with the foot marking the page', async () => {
  const text = await infoPage('doctor', doctor);
  const main = mainOf(text);
  assert.ok(main.includes('<a class="info-back" href="/">'));
  assert.equal(count(main, '<li class="info-count"'), 4);
  for (const status of ['ok', 'warn', 'fail', 'skipped']) {
    const words = escapeHtml(t(`studio.doctor.count.${status}`, { count: 1 }));
    assert.ok(main.includes(`<span>${words}</span>`), status);
  }
  assert.ok(main.includes('<a class="k-btn k-btn-line" href="/doctor">'));
  assert.ok(main.includes('data-copy-from="doctor-report-text"'));
  assert.ok(main.includes('<code id="doctor-report-text">'));
  assert.ok(main.includes('<a href="/doctor" aria-current="page">'));
});

test('a count of zero is marked so it reads quiet', async () => {
  const text = await infoPage('doctor', async () => ({
    checks: [CHECKS[0] as CheckResult],
    report: '',
  }));
  assert.ok(mainOf(text).includes('data-count="warn" data-zero'));
  assert.ok(!mainOf(text).includes('data-count="ok" data-zero'));
});

test('the report is in a pre with a Copy button, and a line says it holds nothing private', async () => {
  const main = mainOf(await infoPage('doctor', doctor));
  const box = /<div class="k-cmd info-report">[\s\S]*?<\/div>/.exec(main)?.[0] ?? '';
  assert.ok(box.includes(`<pre><code id="doctor-report-text">${escapeHtml(REPORT)}</code></pre>`));
  assert.ok(box.includes('data-copy'));
  assert.ok(box.includes(`aria-label="${escapeHtml(t('studio.page.copy'))}"`));
  assert.ok(main.includes(escapeHtml(t('studio.doctor.reportNote'))));
});

test('without a doctor the page has the two commands to run by hand, and no counts or buttons', async () => {
  const main = mainOf(await infoPage('doctor'));
  assert.ok(main.includes(escapeHtml(t('studio.doctor.unavailable'))));
  assert.ok(main.includes('<code>node &lt;plugin folder&gt;/bin/kitvas.ts doctor</code>'));
  assert.ok(main.includes('<code>node &lt;plugin folder&gt;/bin/kitvas.ts doctor --report</code>'));
  assert.ok(!main.includes('info-check'));
  assert.ok(!main.includes('info-count'));
  assert.ok(!main.includes('data-copy-from'));
  assert.ok(!main.includes('<a class="k-btn k-btn-line" href="/doctor">'));
  assert.ok(!main.includes('<pre>'));
  assert.ok(count(main, '<h1') === 1);
});

test('a doctor that rejects gives the same page, not an error', async () => {
  const text = await infoPage('doctor', () => Promise.reject(new Error('boom')));
  assert.ok(text.includes(escapeHtml(t('studio.doctor.unavailable'))));
  assert.equal(count(mainOf(text), '<div class="k-cmd">'), 2);
  assert.ok(!text.includes('boom'));
});
