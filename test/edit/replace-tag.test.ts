import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { replaceTagOpen } from '../../src/edit/app/replace-tag.ts';
import { readTag, type TagView } from '../../src/edit/index.ts';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { type KitComponent, requireKit } from '../../src/kit/index.ts';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';

const base = requireKit(createFolderKitStore(join(PLUGIN_ROOT, 'kits')), 'base');

function component(name: string): KitComponent {
  const found = base.kit.components.find((each) => each.name === name);
  if (found === undefined) throw new Error(`Base has no ${name}`);
  return found;
}

/** The first opening tag of `text`, as the inspect panel reads it. */
function viewOf(text: string): TagView {
  const view = readTag(text, text.indexOf('<'));
  if (typeof view === 'string') assert.fail(`no tag in ${text}: ${view}`);
  return view;
}

/** `text`'s first element replaced by the Base component `to`, the file's text handed in. */
function replace(text: string, from: string | null, to: string | KitComponent, tag?: string) {
  const target = typeof to === 'string' ? component(to) : to;
  const old = from === null ? null : component(from);
  return replaceTagOpen(viewOf(text), old, target, tag ?? target.name, text);
}

test('a Button replaced by a Badge keeps what Badge takes and names the dropped props', () => {
  const text = '<Button variant="outline" tone="neutral" className="c" onClick={go}>Go</Button>';
  assert.deepEqual(replace(text, 'Button', 'Badge'), {
    open: '<Badge tone="neutral" className="c">',
    dropped: ['variant', 'onClick'],
  });
});

test('an enum value the new component lacks is dropped, and an empty tag stays short', () => {
  assert.deepEqual(replace('<Button tone="danger">Delete</Button>', 'Button', 'Badge'), {
    open: '<Badge>',
    dropped: ['tone'],
  });
});

test('an enum expression stays only when every value the old prop has fits the new one', () => {
  // Button's size is md or sm, both Text sizes; its tone may be neutral, which Text lacks.
  assert.deepEqual(replace('<Button size={size} tone={tone}>Go</Button>', 'Button', 'Text'), {
    open: '<Text size={size}>',
    dropped: ['tone'],
  });
});

test('an enum expression on an element the catalog does not list is dropped', () => {
  assert.deepEqual(replace('<span tone={tone} className="note">Hi</span>', null, 'Badge'), {
    open: '<Badge className="note">',
    dropped: ['tone'],
  });
});

test('a tag written one attribute per line keeps its layout, also with CRLF', () => {
  const lines = ['<Button', '  variant="plain"', '  className="cta"', '>', '  Go', '</Button>'];
  for (const newline of ['\n', '\r\n']) {
    const text = lines.join(newline);
    assert.deepEqual(replace(text, 'Button', 'Badge'), {
      open: ['<Badge', '  className="cta"', '>'].join(newline),
      dropped: ['variant'],
    });
  }
});

test('without the file text the tag is written again on one line', () => {
  const lines = ['<Button', '  variant="plain"', '  className="cta"', '>', 'Go', '</Button>'];
  const text = lines.join('\n');
  const result = replaceTagOpen(viewOf(text), component('Button'), component('Badge'), 'Badge');
  assert.deepEqual(result, { open: '<Badge className="cta">', dropped: ['variant'] });
});

test('a required prop the element lacks is written as the catalog example writes it', () => {
  assert.deepEqual(replace('<Text tone="muted">Plans</Text>', 'Text', 'Heading'), {
    open: '<Heading level={1}>',
    dropped: ['tone'],
  });
});

test('required props of every kind come from the example, after the props that stay', () => {
  assert.deepEqual(replace('<Card padding="lg" className="box">Hi</Card>', 'Card', 'Dialog'), {
    open: '<Dialog className="box" open title="Remove item" onClose={() => {}}>',
    dropped: ['padding'],
  });
});

test('a component without children is refused for an element that has some', () => {
  assert.deepEqual(replace('<Button>Save</Button>', 'Button', 'Icon'), {
    refused: 'not-accepted',
  });
});

test('a self-closing element stays self-closing and keeps a literal the new prop takes', () => {
  assert.deepEqual(replace('<Input label="Email" className="field" />', 'Input', 'Checkbox'), {
    open: '<Checkbox label="Email" className="field" />',
    dropped: [],
  });
});

test('key and ref stay on any component', () => {
  assert.deepEqual(replace('<Button key="a" variant="plain">Go</Button>', 'Button', 'Badge'), {
    open: '<Badge key="a">',
    dropped: ['variant'],
  });
});

test('a className the new component cannot take is dropped and named', () => {
  const bare = { ...component('Badge'), styling: [] };
  assert.deepEqual(replace('<Button className="cta">Go</Button>', 'Button', bare), {
    open: '<Badge>',
    dropped: ['className'],
  });
});

test('a spread is refused: it may set any prop', () => {
  assert.deepEqual(replace('<Button {...rest}>Go</Button>', 'Button', 'Badge'), {
    refused: 'spread',
  });
});

test('a tag that is neither the component nor one of its parts is refused', () => {
  assert.deepEqual(replace('<Button>Go</Button>', 'Button', 'Badge', 'Badge.Header'), {
    refused: 'unknown-component',
  });
});

test('the same component gives the tag back as it is', () => {
  const text = '<Badge tone="fix">1 to fix</Badge>';
  assert.deepEqual(replace(text, 'Badge', 'Badge'), { open: '<Badge tone="fix">', dropped: [] });
});
