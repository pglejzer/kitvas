import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitLead } from '../../../../../client/studio/edit/why/lead.ts';

test('the first sentence leads when more follows it', () => {
  assert.deepEqual(splitLead('Three plans. The brief names three audiences.'), {
    lead: 'Three plans.',
    rest: 'The brief names three audiences.',
  });
});

test('a one-sentence line leads with its first clause', () => {
  const line =
    "Answers 'what exactly do I get' for the three plans: one row per feature, one column per plan.";
  assert.deepEqual(splitLead(line), {
    lead: "Answers 'what exactly do I get' for the three plans:",
    rest: 'one row per feature, one column per plan.',
  });
});

test('a short line with no clause has no lead, and a long first sentence is not one', () => {
  assert.deepEqual(splitLead('Closes the page'), { lead: '', rest: 'Closes the page' });
  const long = `${'word '.repeat(30).trim()}. Then more.`;
  assert.equal(splitLead(long).lead, '');
});
