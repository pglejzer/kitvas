import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { KIT_SCHEMA_FILE, kitSchemaText } from '../../scripts/kit-schema.ts';
import { PLUGIN_ROOT } from '../../src/shared/env/paths.ts';
import { isRecord } from '../../src/shared/index.ts';

const generated = kitSchemaText();

/** The object at `path` of the generated schema; fails the test when it is not one. */
function objectAt(...path: string[]): Record<string, unknown> {
  let value: unknown = JSON.parse(generated);
  for (const key of path) {
    assert.ok(isRecord(value), `${path.join('.')}: ${key} is not inside an object`);
    value = value[key];
  }
  assert.ok(isRecord(value), `${path.join('.')} is not an object`);
  return value;
}

test('reference/kit.schema.json is the generated schema of kit.json', () => {
  const onDisk = readFileSync(join(PLUGIN_ROOT, ...KIT_SCHEMA_FILE.split('/')), 'utf8');
  assert.equal(
    onDisk.replaceAll('\r\n', '\n'),
    generated,
    'reference/kit.schema.json is stale: run npm run kit-schema',
  );
});

test('the schema names the parts the rules point at, and kit.json refers to them', () => {
  assert.deepEqual(Object.keys(objectAt('$defs')), [
    'component',
    'prop',
    'stateEntry',
    'example',
    'gap',
  ]);
  assert.deepEqual(objectAt('properties', 'components', 'items'), { $ref: '#/$defs/component' });
  assert.deepEqual(objectAt('properties', 'gaps', 'items'), { $ref: '#/$defs/gap' });
  const component = objectAt('$defs', 'component', 'properties');
  assert.deepEqual(component.props, { type: 'array', items: { $ref: '#/$defs/prop' } });
  assert.deepEqual(objectAt('$defs', 'component', 'properties', 'state', 'items'), {
    $ref: '#/$defs/stateEntry',
  });
  assert.deepEqual(objectAt('$defs', 'component', 'properties', 'examples', 'items'), {
    $ref: '#/$defs/example',
  });
});

test('the schema is the shape an agent writes: an example needs a title, state is a list', () => {
  assert.deepEqual(objectAt('$defs', 'example').required, ['title', 'code', 'imports']);
  assert.equal(objectAt('$defs', 'component', 'properties', 'state').type, 'array');
  // A key with a default may be left out, so it is not required.
  assert.deepEqual(objectAt('$defs', 'component').required, [
    'name',
    'category',
    'description',
    'import',
    'props',
  ]);
  assert.equal(objectAt('$defs', 'component').additionalProperties, false);
  // The script's names stay out of the bodies: no `id` key is left behind.
  assert.equal('id' in objectAt('$defs', 'gap'), false);
  const head = '{\n  "$schema": "https://json-schema.org/draft/2020-12/schema",\n  "$comment": ';
  assert.ok(generated.startsWith(head));
  assert.ok(generated.endsWith('}\n'));
});
