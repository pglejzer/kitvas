import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SourceEvent } from '../../../src/studio/api/edit-schemas.ts';
import { etagOf } from '../../../src/studio/http/etag.ts';
import {
  changeOf,
  createSourceWatcher,
  EXPECT_MS,
  MAX_WAIT_MS,
  QUIET_MS,
} from '../../../src/studio/live/watcher.ts';
import { fakeClock } from '../../helpers/fake-clock.ts';

const HERO = 'src/tsx/sections/Hero.tsx';
const HERO_SCSS = 'src/scss/sections/hero.scss';

/** A watcher over files in memory, a fake watch and a fake clock. */
function setup() {
  const clock = fakeClock(1_000_000);
  /** Files by `<slug>/<path inside the draft>`. */
  const files = new Map<string, string>();
  /** Files that another program holds open for one read. */
  const busy = new Set<string>();
  /** Paths that are folders. */
  const folders = new Set<string>();
  const events: SourceEvent[] = [];
  const builds: string[] = [];
  const errors: unknown[] = [];
  let report: (path: string) => void = () => undefined;
  let closed = 0;
  const watcher = createSourceWatcher({
    watch: (onChange) => {
      report = onChange;
      return {
        close: () => {
          closed += 1;
        },
      };
    },
    read: (slug, relPath) => {
      const key = `${slug}/${relPath}`;
      if (folders.has(key)) throw Object.assign(new Error('a folder'), { code: 'EISDIR' });
      if (busy.delete(key)) throw Object.assign(new Error('held open'), { code: 'EBUSY' });
      return files.get(key);
    },
    etag: etagOf,
    publish: (event) => {
      events.push(event);
    },
    build: (slug, version) => {
      builds.push(`${slug}@${version}`);
    },
    clock,
    onError: (error) => {
      errors.push(error);
    },
  });
  /** Writes a file and reports it the way Windows does, with backslashes. */
  const write = (slug: string, path: string, text: string): void => {
    files.set(`${slug}/${path}`, text);
    report(`${slug}\\${path.split('/').join('\\')}`);
  };
  const tell = (path: string): void => report(path);
  return {
    clock,
    files,
    busy,
    folders,
    events,
    builds,
    errors,
    watcher,
    write,
    tell,
    closed: () => closed,
  };
}

test('a reported path is read with either slash, as a draft, a version and a path in it', () => {
  assert.deepEqual(changeOf('shop\\v12\\src\\tsx\\sections\\Hero.tsx'), {
    slug: 'shop',
    version: 12,
    path: HERO,
  });
  assert.deepEqual(changeOf('shop/v2/md/layout.md'), {
    slug: 'shop',
    version: 2,
    path: 'md/layout.md',
  });
  assert.deepEqual(changeOf('shop/v2'), { slug: 'shop', version: 2, path: '' });
  assert.equal(changeOf('shop/v0/src/tsx/a.tsx'), undefined);
  assert.equal(changeOf('shop/version/src/tsx/a.tsx'), undefined);
  assert.equal(changeOf('shop/v2/build/html/index.html'), undefined);
  assert.equal(changeOf('Shop Draft/v2/src/tsx/a.tsx'), undefined);
});

test('changes are published once the draft has been quiet for 100 ms, then built', () => {
  const { clock, events, builds, write } = setup();
  write('shop', `v1/${HERO}`, 'hero');
  clock.advance(60);
  write('shop', `v1/${HERO_SCSS}`, '.hero {}');
  clock.advance(QUIET_MS - 1);
  assert.deepEqual(events, []);
  assert.deepEqual(builds, []);
  clock.advance(1);
  assert.deepEqual(events, [
    {
      slug: 'shop',
      version: 1,
      files: { [HERO]: etagOf('hero'), [HERO_SCSS]: etagOf('.hero {}') },
      by: 'other',
    },
  ]);
  assert.deepEqual(builds, ['shop@1']);
});

test('every draft has a quiet time of its own', () => {
  const { clock, events, write } = setup();
  write('shop', `v1/${HERO}`, 'hero');
  clock.advance(80);
  write('cart', `v1/${HERO}`, 'cart hero');
  clock.advance(20);
  assert.deepEqual(
    events.map((event) => event.slug),
    ['shop'],
  );
  clock.advance(79);
  assert.equal(events.length, 1);
  clock.advance(1);
  assert.deepEqual(
    events.map((event) => event.slug),
    ['shop', 'cart'],
  );
});

test("a write whose ETags the editor registered is the editor's; any other is not", () => {
  const { clock, events, watcher, write } = setup();
  watcher.expect('shop', 1, { [HERO]: etagOf('mine') });
  write('shop', `v1/${HERO}`, 'mine');
  clock.advance(QUIET_MS);
  write('shop', `v1/${HERO}`, 'theirs');
  clock.advance(QUIET_MS);
  // The editor's file and a file nobody registered, in one quiet time: not only the editor's.
  watcher.expect('shop', 1, { [HERO]: etagOf('mine again') });
  write('shop', `v1/${HERO}`, 'mine again');
  write('shop', `v1/${HERO_SCSS}`, '.hero { gap: 0; }');
  clock.advance(QUIET_MS);
  assert.deepEqual(
    events.map((event) => event.by),
    ['editor', 'other', 'other'],
  );
  assert.deepEqual(Object.keys(events[2]?.files ?? {}).sort(), [HERO, HERO_SCSS].sort());
});

test('an ETag the editor registered marks a write as its own for 5 s only', () => {
  const { clock, events, watcher, write } = setup();
  watcher.expect('shop', 1, { [HERO]: etagOf('late') });
  clock.advance(EXPECT_MS + 1);
  write('shop', `v1/${HERO}`, 'late');
  clock.advance(QUIET_MS);
  watcher.expect('shop', 1, { [HERO]: etagOf('soon') });
  clock.advance(4_000);
  write('shop', `v1/${HERO}`, 'soon');
  clock.advance(QUIET_MS);
  assert.deepEqual(
    events.map((event) => event.by),
    ['other', 'editor'],
  );
});

test('a new version reports only the files that differ from the version it was copied from', () => {
  const { clock, files, events, builds, write, tell } = setup();
  files.set(`shop/v1/${HERO_SCSS}`, '.hero {}');
  write('shop', `v1/${HERO}`, 'hero');
  clock.advance(QUIET_MS);
  // Version 2: a copy of version 1, then one change in it.
  tell('shop\\v2');
  write('shop', `v2/${HERO}`, 'hero');
  write('shop', `v2/${HERO_SCSS}`, '.hero { gap: 0; }');
  clock.advance(QUIET_MS);
  // Version 3: a copy and nothing else. No event, but it needs a build of its own.
  tell('shop\\v3');
  write('shop', `v3/${HERO}`, 'hero');
  write('shop', `v3/${HERO_SCSS}`, '.hero { gap: 0; }');
  clock.advance(QUIET_MS);
  const changed = { [HERO_SCSS]: etagOf('.hero { gap: 0; }') };
  assert.deepEqual(events.slice(1), [{ slug: 'shop', version: 2, files: changed, by: 'other' }]);
  assert.deepEqual(builds, ['shop@1', 'shop@2', 'shop@3']);
});

test("the editor's files are looked at even when the watch reports none of them", () => {
  const { clock, files, events, builds, watcher } = setup();
  // The first edit of a session: the edit API copied version 1 into version 2, registered the
  // ETags of the new version's source files and wrote them. The watch missed the new folder.
  files.set(`shop/v1/${HERO_SCSS}`, '.hero {}');
  files.set(`shop/v2/${HERO_SCSS}`, '.hero {}');
  files.set(`shop/v2/${HERO}`, 'hero 2');
  watcher.expect('shop', 2, { [HERO]: etagOf('hero 2'), [HERO_SCSS]: etagOf('.hero {}') });
  clock.advance(QUIET_MS);
  assert.deepEqual(events, [
    {
      slug: 'shop',
      version: 2,
      files: { [HERO]: etagOf('hero 2'), [HERO_SCSS]: etagOf('.hero {}') },
      by: 'editor',
    },
  ]);
  assert.deepEqual(builds, ['shop@2']);
});

test('a file written again with the same text is no change and no build', () => {
  const { clock, events, builds, write } = setup();
  write('shop', `v1/${HERO}`, 'hero');
  clock.advance(QUIET_MS);
  // Windows often reports one write twice, further apart than the quiet time.
  write('shop', `v1/${HERO}`, 'hero');
  clock.advance(QUIET_MS);
  assert.equal(events.length, 1);
  assert.deepEqual(builds, ['shop@1']);
});

test('a removed file builds, and so does the file made again with the old text', () => {
  const { clock, files, events, builds, write, tell } = setup();
  files.set(`shop/v1/${HERO}`, 'hero');
  write('shop', `v2/${HERO}`, 'hero 2');
  clock.advance(QUIET_MS);
  files.delete(`shop/v2/${HERO}`);
  tell('shop\\v2\\src\\tsx\\sections\\Hero.tsx');
  clock.advance(QUIET_MS);
  write('shop', `v2/${HERO}`, 'hero');
  clock.advance(QUIET_MS);
  assert.deepEqual(
    events.map((event) => event.files[HERO]),
    [etagOf('hero 2'), etagOf('hero')],
  );
  assert.deepEqual(builds, ['shop@2', 'shop@2', 'shop@2']);
});

test('a layout or data change builds without a source event', () => {
  const { clock, events, builds, write } = setup();
  write('shop', `v1/${HERO}`, 'hero');
  clock.advance(QUIET_MS);
  write('shop', 'v1/md/layout.md', '# Layout: Shop');
  clock.advance(QUIET_MS);
  write('shop', 'v1/src/json/states.json', '{}');
  clock.advance(QUIET_MS);
  write('shop', 'v1/md/layout.md', '# Layout: Shop');
  clock.advance(QUIET_MS);
  assert.equal(events.length, 1);
  assert.deepEqual(builds, ['shop@1', 'shop@1', 'shop@1']);
});

test('build output, generated entries, temporary files and other folders are not looked at', () => {
  const { clock, events, builds, tell } = setup();
  for (const path of [
    'shop\\v1\\build\\js\\index.js',
    'shop\\v1\\src\\tsx\\index.tsx',
    'shop\\v1\\src\\scss\\index.scss',
    'shop\\v1\\src\\tsx\\sections\\Hero.tsx.kitvas-tmp',
    'shop\\v1\\md\\notes.md',
    'shop\\draft.json',
    'notes.txt',
  ]) {
    tell(path);
  }
  clock.advance(MAX_WAIT_MS);
  assert.deepEqual(events, []);
  assert.deepEqual(builds, []);
  assert.equal(clock.pending(), 0);
});

test('a draft that never goes quiet is still looked at 1 s after its first change', () => {
  const { clock, events, write } = setup();
  for (let step = 0; step < 20; step += 1) {
    write('shop', `v1/${HERO}`, `step ${step}`);
    clock.advance(50);
  }
  assert.equal(events.length, 1);
  assert.equal(events[0]?.files[HERO], etagOf('step 19'));
});

test('a file another program holds open is read again; a folder is not', () => {
  const { clock, events, busy, folders, write, tell, errors } = setup();
  folders.add('shop/v1/src/tsx/sections');
  busy.add(`shop/v1/${HERO}`);
  tell('shop\\v1\\src\\tsx\\sections');
  write('shop', `v1/${HERO}`, 'hero');
  clock.advance(QUIET_MS);
  // A length, not `deepEqual(events, [])`: that would narrow the list to `never[]` below.
  assert.equal(events.length, 0);
  clock.advance(QUIET_MS);
  assert.deepEqual(
    events.map((event) => Object.keys(event.files)),
    [[HERO]],
  );
  assert.equal(clock.pending(), 0);
  assert.deepEqual(errors, []);
});

test('close stops the watch and drops what was waiting', () => {
  const { clock, events, builds, watcher, write, tell, closed } = setup();
  write('shop', `v1/${HERO}`, 'hero');
  watcher.close();
  watcher.close();
  clock.advance(QUIET_MS);
  watcher.expect('shop', 1, { [HERO]: etagOf('hero') });
  tell(`shop\\v1\\${HERO}`);
  clock.advance(QUIET_MS);
  assert.deepEqual(events, []);
  assert.deepEqual(builds, []);
  assert.equal(closed(), 1);
  assert.equal(clock.pending(), 0);
});
