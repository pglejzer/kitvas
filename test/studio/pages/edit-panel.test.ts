import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editPanel } from '../../../src/studio/pages/edit-panel.ts';

const t = (key: string): string => (key === 'studio.edit.save' ? 'Save </script><b>' : key);

test('a version that cannot be edited gets no editor', () => {
  assert.equal(editPanel({ t, nonce: 'n0', editable: false }), '');
});

test('the editor gets its sections and its texts, which cannot end their script block', () => {
  const panel = editPanel({ t, nonce: 'n0', editable: true });
  const text = typeof panel === 'string' ? panel : panel.text;
  for (const part of ['layers', 'props', 'changes', 'conflict']) {
    assert.ok(text.includes(`data-edit="${part}"`), part);
  }
  assert.ok(text.includes('<script type="application/json" id="edit-texts" nonce="n0">'));
  const json = text.slice(text.indexOf('nonce="n0">') + 11, text.lastIndexOf('</script>'));
  assert.ok(!json.includes('<'));
  const texts: unknown = JSON.parse(json);
  assert.deepEqual(texts, { ...(texts as object), save: 'Save </script><b>' });
  // The button's own text is escaped by the template.
  assert.ok(text.includes('Save &lt;/script&gt;&lt;b&gt;'));
});
