import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editMenu, editTexts } from '../../../../src/studio/pages/editor/edit-panel.ts';

const t = (key: string): string => (key === 'studio.edit.save' ? 'Save </script><b>' : key);

test('the context menu has a host only where the version can be edited', () => {
  assert.equal(editMenu(false), '');
  const menu = editMenu(true);
  assert.equal(typeof menu === 'string' ? menu : menu.text, '<div data-edit="menu" hidden></div>');
});

test('the kit is named in the texts by the page, since it is one for the whole draft', () => {
  const named = (key: string, params: Record<string, string | number> = {}): string =>
    key === 'studio.edit.layers.kit' ? `${params.kit} component` : key;
  const text = editTexts({ t: named, nonce: 'n0', kit: 'mui', source: '@mui/material' }).text;
  const json = text.slice(text.indexOf('nonce="n0">') + 11, text.lastIndexOf('</script>'));
  const texts: unknown = JSON.parse(json);
  assert.deepEqual(texts, { ...(texts as object), 'layers.kit': 'mui component' });
});

test('the kit source is named in the texts by the page too', () => {
  const named = (key: string, params: Record<string, string | number> = {}): string =>
    key === 'studio.edit.props.added' ? `not part of ${params.source}` : key;
  const text = editTexts({ t: named, nonce: 'n0', kit: 'mui', source: '@mui/material' }).text;
  const json = text.slice(text.indexOf('nonce="n0">') + 11, text.lastIndexOf('</script>'));
  const texts: unknown = JSON.parse(json);
  assert.ok(typeof texts === 'object' && texts !== null);
  assert.equal(Reflect.get(texts, 'props.added'), 'not part of @mui/material');
});

test('the texts sit in one JSON block on the nonce, which cannot end its script block', () => {
  const text = editTexts({ t, nonce: 'n0', kit: 'kitvas UI', source: 'the built-in kit' }).text;
  assert.ok(text.startsWith('<script type="application/json" id="edit-texts" nonce="n0">'));
  const json = text.slice(text.indexOf('nonce="n0">') + 11, text.lastIndexOf('</script>'));
  assert.ok(!json.includes('<'));
  const texts: unknown = JSON.parse(json);
  assert.ok(typeof texts === 'object' && texts !== null);
  assert.deepEqual(texts, { ...texts, save: 'Save </script><b>' });
});
