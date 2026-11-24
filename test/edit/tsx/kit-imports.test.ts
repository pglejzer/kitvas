// The kit import follows use (spec 4b, decision 8): after a structural op the file's
// `import { … } from '@kit'` names exactly the kit components it uses. No other import changes,
// and the import keeps its form, its quotes and the order of the names that stay.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { syncKitImports, usedKitComponents } from '../../../src/edit/domain/tsx/kit-imports.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FOLDERS = [join(ROOT, 'test', 'fixtures'), join(ROOT, 'kits', 'base')];
const KIT: ReadonlySet<string> = new Set([
  'Badge',
  'Button',
  'Card',
  'Checkbox',
  'Dialog',
  'Grid',
  'Heading',
  'Icon',
  'Input',
  'Select',
  'Stack',
  'Text',
]);

const lines = (...parts: string[]): string => parts.join('\n');
const synced = (text: string): string => syncKitImports(text, KIT).text;
const used = (text: string): string[] => [...usedKitComponents(text, KIT)].sort();

function tsxFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : tsxFiles(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

describe('usedKitComponents', () => {
  test('counts tag roots and names read as values, of the kit only', () => {
    const text = lines(
      "import { Card, Stack } from '@kit';",
      '',
      'export function Plans() {',
      '  return (',
      '    <Stack as={Grid}>',
      '      <Card.Header>Plans</Card.Header>',
      '      <section>',
      '        <Plan />',
      '      </section>',
      '    </Stack>',
      '  );',
      '}',
    );
    assert.deepEqual(used(text), ['Card', 'Grid', 'Stack']);
  });

  test('leaves out names the file binds itself', () => {
    const text = lines(
      "import { Badge } from '../Badge.tsx';",
      'const Card = (props: { title: string }) => <div>{props.title}</div>;',
      'function Stack() {',
      '  return <div />;',
      '}',
      'export function Plans() {',
      '  return (',
      '    <Stack>',
      '      <Card title="One" />',
      '      <Badge>New</Badge>',
      '      <Text>Hi</Text>',
      '    </Stack>',
      '  );',
      '}',
    );
    assert.deepEqual(used(text), ['Text']);
  });

  test('never counts words in strings, comments or JSX text', () => {
    const text = lines(
      "import { Text } from '@kit';",
      '// <Badge> is not used here',
      "const label = '<Card>';",
      '/* <Button /> */',
      'export function Note() {',
      '  return (',
      '    <Text title="Stack">',
      "      Badge, Card and Button aren't here: {label}",
      '    </Text>',
      '  );',
      '}',
    );
    assert.deepEqual(used(text), ['Text']);
  });
});

describe('syncKitImports', () => {
  test('adds a missing name in sorted place and maps offsets past the import', () => {
    const text = lines(
      "import { Button, Stack } from '@kit';",
      '',
      'export function Hero(_props: { state: string }) {',
      '  return (',
      '    <Stack>',
      '      <Card title="New">',
      '        <Button>Go</Button>',
      '      </Card>',
      '    </Stack>',
      '  );',
      '}',
      '',
    );
    const result = syncKitImports(text, KIT);
    assert.equal(result.text, text.replace('{ Button, Stack }', '{ Button, Card, Stack }'));
    assert.equal(result.moved(0), 0);
    assert.equal(result.moved(text.indexOf('<Stack>')), result.text.indexOf('<Stack>'));
    assert.equal(result.moved(text.length), result.text.length);
  });

  test('removes names no longer used, and the line when it names nothing', () => {
    const text = lines(
      "import { Badge, Button, Text } from '@kit';",
      "import { useState } from 'react';",
      '',
      'export function Hero() {',
      '  const [open] = useState(false);',
      '  return <Button>{open ? 1 : 0}</Button>;',
      '}',
    );
    const result = syncKitImports(text, KIT);
    assert.equal(result.text, text.replace('{ Badge, Button, Text }', '{ Button }'));
    assert.equal(result.moved(text.indexOf('Badge')), null);

    const only = lines(
      "import { Badge } from '@kit';",
      "import { useState } from 'react';",
      '',
      'export const read = useState;',
    );
    assert.equal(
      synced(only),
      lines("import { useState } from 'react';", '', 'export const read = useState;'),
    );
  });

  test('replaces the names when none of them is used any more', () => {
    const text = lines("import { Badge } from '@kit';", 'export const A = () => <Card>Hi</Card>;');
    assert.equal(synced(text), text.replace('{ Badge }', '{ Card }'));
  });

  test('keeps an aliased name while its alias is used, and removes it after', () => {
    const kept = lines(
      "import { Card as Box, Stack } from '@kit';",
      'export const A = () => (',
      '  <Stack>',
      '    <Box>Hi</Box>',
      '  </Stack>',
      ');',
    );
    assert.equal(synced(kept), kept);
    const gone = lines(
      "import { Card as Box, Stack } from '@kit';",
      'export const A = () => <Stack>Hi</Stack>;',
    );
    assert.equal(synced(gone), gone.replace('{ Card as Box, Stack }', '{ Stack }'));
  });

  test('keeps the multi-line form and its trailing comma', () => {
    const text = lines(
      'import {',
      '  Badge,',
      '  Button,',
      '  Stack,',
      "} from '@kit';",
      '',
      'export const A = () => (',
      '  <Stack>',
      '    <Card>',
      '      <Button>Go</Button>',
      '    </Card>',
      '    <Text>Hi</Text>',
      '  </Stack>',
      ');',
    );
    const expected = text.replace(
      '  Badge,\n  Button,\n  Stack,\n',
      '  Button,\n  Card,\n  Stack,\n  Text,\n',
    );
    assert.equal(synced(text), expected);
  });

  test('keeps the quotes and adds a value read as a kit component', () => {
    const text = lines(
      'import { Stack } from "@kit";',
      'export const A = () => <Stack as={Grid}>Hi</Stack>;',
    );
    assert.equal(synced(text), text.replace('{ Stack }', '{ Grid, Stack }'));
  });

  test('adds one import after the last import when there is none, LF and CRLF', () => {
    const text = lines(
      "import { useState } from 'react';",
      '',
      'export function A() {',
      '  const [n] = useState(0);',
      '  return <Button>{n}</Button>;',
      '}',
    );
    assert.equal(
      synced(text),
      text.replace("from 'react';\n", "from 'react';\nimport { Button } from '@kit';\n"),
    );

    const crlf = [
      'import { useState } from "react"',
      '',
      'export const A = () => <Text>{useState.name}</Text>',
      '',
    ].join('\r\n');
    assert.equal(
      synced(crlf),
      crlf.replace('from "react"\r\n', 'from "react"\r\nimport { Text } from "@kit"\r\n'),
    );
  });

  test('adds one at the top of a file without imports', () => {
    const text = lines('export function A() {', '  return <Badge>New</Badge>;', '}', '');
    assert.equal(synced(text), `import { Badge } from '@kit';\n\n${text}`);
  });

  test('touches no other import: react, type-only, local files', () => {
    const text = lines(
      "import { useState } from 'react';",
      "import { Badge, Button } from '@kit';",
      "import type { ButtonProps } from '@kit';",
      "import { Card } from '../Card.tsx';",
      "import { Row } from '../Row.tsx';",
      '',
      'export function Plans(props: ButtonProps) {',
      '  const [open] = useState(false);',
      '  return <Card>{open ? <Button {...props}>Go</Button> : null}</Card>;',
      '}',
    );
    assert.equal(synced(text), text.replace('{ Badge, Button }', '{ Button }'));
  });

  test('keeps type names and names that are not kit components', () => {
    const text = lines(
      "import { Button, type ButtonProps, ICON_PATHS } from '@kit';",
      'export const n = ICON_PATHS;',
    );
    const result = syncKitImports(text, KIT);
    assert.equal(result.text, text.replace('Button, type', 'type'));
    assert.equal(result.moved(text.indexOf('Button')), null);
    assert.equal(result.moved(text.indexOf('export')), result.text.indexOf('export'));
  });

  test('works on the entry it is given and leaves the others alone', () => {
    const text = lines(
      "import { Button } from '@kit';",
      "import { Stack } from '@acme/ui';",
      'export const A = () => (',
      '  <Stack>',
      '    <Card />',
      '  </Stack>',
      ');',
    );
    assert.equal(
      syncKitImports(text, KIT, '@acme/ui').text,
      text.replace("{ Stack } from '@acme/ui'", "{ Card, Stack } from '@acme/ui'"),
    );
  });

  test('leaves a kit import it cannot read as it is', () => {
    const text = lines(
      "import { Button /* main */ } from '@kit';",
      'export const A = () => <Card />;',
    );
    const result = syncKitImports(text, KIT);
    assert.equal(result.text, text);
    assert.equal(result.moved(text.length), text.length);
  });

  test('leaves every fixture and Base kit file as it is: their imports already follow use', () => {
    const files = FOLDERS.flatMap(tsxFiles);
    assert.ok(files.length >= 10, `files: ${files.length}`);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      assert.equal(synced(text), text, relative(ROOT, file).replaceAll('\\', '/'));
    }
  });
});
