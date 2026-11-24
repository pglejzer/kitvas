import assert from 'node:assert/strict';
import { test } from 'node:test';
import { offerOf } from '../../../../../client/studio/edit/props/suggest.ts';

const HASH = 'a'.repeat(64);
const ID = 'sections/Hero:section/button';

const inspected = (suggest: { component: string; source: string; dropped: string[] } | null) => ({
  id: ID,
  hash: HASH,
  suggest,
});

test('an answer with no suggestion makes no offer', () => {
  assert.equal(offerOf(inspected(null)), null);
  assert.equal(offerOf({ id: ID, hash: HASH }), null);
});

test('Replace is one replaceElement with the source and the hash the editor saw', () => {
  const offer = offerOf(
    inspected({ component: 'Button', source: '<Button>Go</Button>', dropped: [] }),
  );
  assert.deepEqual(offer?.replace, {
    op: 'replaceElement',
    id: ID,
    source: '<Button>Go</Button>',
    hash: HASH,
  });
  assert.equal(offer?.component, 'Button');
});

test('dropped props change the change list line, and are all handed to it', () => {
  // Outside a page there are no texts, so a label is its key.
  const plain = offerOf(inspected({ component: 'Button', source: '<Button />', dropped: [] }));
  const dropping = offerOf(
    inspected({ component: 'Button', source: '<Button />', dropped: ['onClick', 'type'] }),
  );
  assert.equal(plain?.label, 'suggest.label');
  assert.equal(dropping?.label, 'suggest.labelDropped');
  assert.deepEqual(dropping?.dropped, ['onClick', 'type']);
});

test('with no safe source there is no replacement, only the wish for Ask Claude', () => {
  const offer = offerOf(inspected({ component: 'Heading', source: '', dropped: [] }));
  assert.equal(offer?.replace, null);
  assert.deepEqual(offer?.ask, { op: 'replaceTag', id: ID, tag: 'Heading', hash: HASH });
});
