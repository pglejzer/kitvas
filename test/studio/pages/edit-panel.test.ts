import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editMenu, editTexts } from '../../../src/studio/pages/edit-panel.ts';

const t = (key: string): string => (key === 'studio.edit.save' ? 'Save </script><b>' : key);

test('the context menu has a host only where the version can be edited', () => {
  assert.equal(editMenu(false), '');
  const menu = editMenu(true);
  assert.equal(typeof menu === 'string' ? menu : menu.text, '<div data-edit="menu" hidden></div>');
});

test('the texts sit in one JSON block on the nonce, which cannot end its script block', () => {
  const text = editTexts({ t, nonce: 'n0' }).text;
  assert.ok(text.startsWith('<script type="application/json" id="edit-texts" nonce="n0">'));
  const json = text.slice(text.indexOf('nonce="n0">') + 11, text.lastIndexOf('</script>'));
  assert.ok(!json.includes('<'));
  const texts: unknown = JSON.parse(json);
  assert.ok(typeof texts === 'object' && texts !== null);
  assert.deepEqual(texts, { ...texts, save: 'Save </script><b>' });
});
