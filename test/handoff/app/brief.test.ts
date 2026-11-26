import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDraft, type DraftStore, pickSketch } from '../../../src/drafts/index.ts';
import {
  type BriefDeps,
  handoffDecisions,
  writeBrief,
} from '../../../src/handoff/app/code/brief.ts';
import { splitAddedTokens } from '../../../src/handoff/domain/code/brief.ts';
import type { ProjectListing } from '../../../src/handoff/domain/code/listing.ts';
import type { TargetFacts } from '../../../src/handoff/domain/code/target.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import type { KitStore, ProjectSetup } from '../../../src/kit/index.ts';
import { KitvasError } from '../../../src/shared/index.ts';
import {
  GOOD_LAYOUT,
  NOW,
  TINY,
  tempDrafts,
  writeVersionFiles,
} from '../../helpers/draft/drafts.ts';
import { FIXTURE_KITS, tinyKitJson } from '../../helpers/kit/kits.ts';

const D = '.kitvas/drafts/shop/v1';
const RULES = '/plugin/reference/handoff-code.md';

const TARGET: TargetFacts = {
  schemaVersion: 1,
  base: '',
  root: ['src/'],
  packages: [],
  extensions: [],
  folders: [],
  tokens: [],
  conventions: [],
  git: true,
  capped: false,
};

const HERO = [
  "import { Button } from '@kit';",
  "import { Badge } from '../parts/Badge.tsx';",
  '',
  'export function Hero() {',
  '  return (',
  '    <section className="hero" style={{ gap: \'var(--kit-space-sm)\' }}>',
  '      <Button>Buy</Button>',
  '      <Button>Later</Button>',
  '      <Badge />',
  '    </section>',
  '  );',
  '}',
].join('\n');
const ORDER = [
  "import { Button, Icon } from '@kit';",
  '',
  'export function OrderSummary() {',
  '  return (',
  '    <aside className="order-summary">',
  '      <Icon name="check" />',
  '      <Button>Pay</Button>',
  '    </aside>',
  '  );',
  '}',
].join('\n');
const BADGE =
  "export function Badge() { return <b style={{ color: 'var(--kit-color-ink)' }}>New</b>; }";
const HERO_SCSS =
  '.hero { color: var(--kit-color-ink); padding-inline: var(--kit-space-sm); margin: var(--kit-nothing); }';
const ORDER_SCSS = '.order-summary { padding-inline: var(--kit-space-sm); }';

type Entry = [id: string, file: string, tag: string];
const HERO_FILE = 'src/tsx/sections/Hero.tsx';
const ORDER_FILE = 'src/tsx/sections/OrderSummary.tsx';
const IDS: Entry[] = [
  ['sections/Hero:section', HERO_FILE, 'section'],
  ['sections/Hero:section/Button', HERO_FILE, 'Button'],
  ['sections/Hero:section/Button.2', HERO_FILE, 'Button'],
  ['sections/Hero:section/Badge', HERO_FILE, 'Badge'],
  ['sections/OrderSummary:aside', ORDER_FILE, 'aside'],
  ['sections/OrderSummary:aside/Icon', ORDER_FILE, 'Icon'],
  ['sections/OrderSummary:aside/Button', ORDER_FILE, 'Button'],
  ['index:Hero', 'src/tsx/index.tsx', 'Hero'],
];

const idsFile = (entries: Entry[]): string =>
  JSON.stringify({
    schemaVersion: 1,
    ids: Object.fromEntries(
      entries.map(([id, file, tag]) => [id, { file, line: 1, column: 1, tag }]),
    ),
  });

/** A project as the files port sees it: the paths it holds, nothing on disk. */
function fakeProject(paths: string[]): ProjectSetup {
  const set = new Set(paths);
  const under = (rel: string): string[] =>
    paths
      .filter((path) => path.startsWith(`${rel}/`))
      .map((path) => path.slice(rel.length + 1))
      .sort();
  return {
    exists: (rel) => set.has(rel) || paths.some((path) => path.startsWith(`${rel}/`)),
    realInside: () => true,
    packageVersion: () => undefined,
    packageDependencies: () => [],
    listFiles: under,
    walk: (rel) => (rel === '' ? [...paths].sort() : under(rel)),
    size: () => undefined,
    readBytes: () => undefined,
  };
}

const PROJECT = [
  `${D}/build/shots/default-1280.png`,
  `${D}/build/shots/default-390.png`,
  `${D}/build/shots/notes.txt`,
  `${D}/src/json/states.json`,
  `${D}/src/img/logo.svg`,
  `${D}/src/tsx/index.tsx`,
  `${D}/${HERO_FILE}`,
  `${D}/${ORDER_FILE}`,
  `${D}/src/tsx/parts/Badge.tsx`,
  `${D}/src/scss/index.scss`,
  `${D}/src/scss/sections/hero.scss`,
  `${D}/src/scss/sections/order-summary.scss`,
  'src/components/Button.tsx',
  'src/app/page.tsx',
  '.env',
];

const DECISIONS = [
  '---',
  'kit: tiny',
  '---',
  '# Project decisions',
  '',
  '## Kits',
  '- Use tiny (2026-11-01)',
  '',
  '## Handoff',
  '- Write new screens under src/app (2026-11-25)',
  '- Scripts: npm run lint',
  '',
  '## Other',
  '- Later (2026-11-26)',
].join('\n');

type Counter = { listings: number };

function depsFor(
  store: DraftStore,
  kits: KitStore,
  counter: Counter = { listings: 0 },
  paths: string[] = PROJECT,
): BriefDeps {
  return {
    drafts: store,
    kits,
    files: fakeProject(paths),
    decisions: () => DECISIONS,
    rules: RULES,
    target: () => TARGET,
    listing: (): ProjectListing => {
      counter.listings += 1;
      return { schemaVersion: 1, watched: true, files: { [`f${counter.listings}`]: '1:a' } };
    },
  };
}

const tiny = (): KitStore => createFolderKitStore(FIXTURE_KITS);

type KitJson = Record<string, unknown>;

/** The tiny kit with its kit.json changed and extra JSON files and additions on top. */
function withKit(
  edit: (json: KitJson) => void,
  extra: { json?: Record<string, unknown>; additions?: unknown } = {},
): KitStore {
  const base = tiny();
  const json = tinyKitJson();
  edit(json);
  return {
    ...base,
    read(id) {
      const files = base.read(id);
      return files === undefined ? undefined : { ...files, kitJson: json };
    },
    readJson: (id, rel) => extra.json?.[rel] ?? base.readJson(id, rel),
    ...(extra.additions === undefined
      ? {}
      : { readAdditions: () => ({ json: extra.additions, dir: '/additions/tiny' }) }),
  };
}

function screen(options: {
  kind?: 'screen' | 'rework';
  hero?: string;
  ids?: Entry[];
  built?: boolean;
}) {
  const { store } = tempDrafts();
  createDraft(store, {
    slug: 'shop',
    title: 'Shop',
    kit: TINY,
    now: NOW,
    ...(options.kind === 'rework' ? ({ kind: 'rework', rework: { source: 'url' } } as const) : {}),
  });
  writeVersionFiles(store, 'shop', 1, {
    'md/layout.md': GOOD_LAYOUT,
    [HERO_FILE]: options.hero ?? HERO,
    [ORDER_FILE]: ORDER,
    'src/tsx/parts/Badge.tsx': BADGE,
    'src/scss/sections/hero.scss': HERO_SCSS,
    'src/scss/sections/order-summary.scss': ORDER_SCSS,
    'why/Hero.json': '{}',
    ...(options.built === false ? {} : { 'build/json/ids.json': idsFile(options.ids ?? IDS) }),
  });
  return store;
}

const WRITE = { to: './src/app/', scope: 'named', files: ['src\\components\\Button.tsx'] } as const;

function failsWith(code: string): (error: unknown) => boolean {
  return (error) => error instanceof KitvasError && error.code === code;
}

test('a screen draft: sections, components, tokens, shots and the write set', () => {
  const store = screen({});
  const { brief, dir, listed } = writeBrief(depsFor(store, tiny()), {
    slug: 'shop',
    write: { ...WRITE, files: [...WRITE.files] },
    base: '',
  });
  assert.equal(dir, `${D}/handoff/code`);
  assert.equal(listed, true);
  assert.deepEqual(
    [brief.slug, brief.version, brief.kind, brief.kit],
    ['shop', 1, 'screen', 'tiny'],
  );
  assert.equal(brief.draft.layout, `${D}/md/layout.md`);
  assert.deepEqual(brief.draft.sections, [
    {
      id: 'hero',
      tsx: `${D}/${HERO_FILE}`,
      scss: `${D}/src/scss/sections/hero.scss`,
      why: `${D}/why/Hero.json`,
    },
    {
      id: 'order-summary',
      tsx: `${D}/${ORDER_FILE}`,
      scss: `${D}/src/scss/sections/order-summary.scss`,
      why: null,
    },
  ]);
  assert.deepEqual(brief.draft.data, [`${D}/src/json/states.json`]);
  assert.deepEqual(brief.draft.images, [`${D}/src/img/logo.svg`]);
  assert.deepEqual(brief.draft.shots, [
    { state: 'default', width: 1280, path: `${D}/build/shots/default-1280.png` },
    { state: 'default', width: 390, path: `${D}/build/shots/default-390.png` },
  ]);
  assert.deepEqual(brief.write, {
    to: 'src/app',
    scope: 'named',
    files: ['src/components/Button.tsx'],
  });
  assert.equal(brief.target, `${D}/handoff/code/target.json`);
  assert.equal(brief.report, `${D}/handoff/code/fit.json`);
  assert.equal(brief.rules, RULES);
  assert.deepEqual(brief.decisions, ['Write new screens under src/app', 'Scripts: npm run lint']);
});

test('each component and token is listed once, with its uses and where it comes from', () => {
  const { brief } = writeBrief(depsFor(screen({}), tiny()), {
    slug: 'shop',
    write: { to: 'src/app', scope: 'new', files: [] },
    base: '',
  });
  // The entry's own `Hero` is not a component of the draft.
  assert.deepEqual(brief.components, [
    { name: 'Badge', from: '../parts/Badge.tsx', origin: 'draft', project: null, uses: 1 },
    { name: 'Button', from: '@kit', origin: 'kit', project: null, uses: 3 },
    { name: 'Icon', from: '@kit', origin: 'kit', project: null, uses: 1 },
  ]);
  // Ink: the section's SCSS and the part's TSX. Space: the SCSS of both sections and one TSX.
  // `--kit-nothing` is no token of the kit.
  assert.deepEqual(brief.tokens, [
    { var: '--kit-color-ink', path: 'color.ink', css: '#1d2025', project: null, uses: 2 },
    { var: '--kit-space-sm', path: 'space.sm', css: '8px', project: null, uses: 3 },
  ]);
});

test('a token the project added is listed apart, to create, and a draft with none has no such field', () => {
  const used = [
    { var: '--kit-color-ink', path: 'color.ink', css: '#1d2025', project: null, uses: 2 },
    { var: '--kit-space-wide', path: 'space.wide', css: '48px', project: '--wide', uses: 1 },
  ];
  const split = splitAddedTokens(used, ['space.wide']);
  assert.deepEqual(split.tokens, [used[0]]);
  assert.deepEqual(split.added, [
    { var: '--kit-space-wide', path: 'space.wide', css: '48px', uses: 1 },
  ]);
  assert.deepEqual(splitAddedTokens(used, []).added, []);
  // The tiny kit has no additions: no field.
  const { brief } = writeBrief(depsFor(screen({}), tiny()), {
    slug: 'shop',
    write: { to: 'src/app', scope: 'new', files: [] },
    base: '',
  });
  assert.equal('added' in brief, false);
});

test('a component that is a project addition says so', () => {
  const kits = withKit(() => {}, {
    additions: {
      schemaVersion: 1,
      components: [
        {
          name: 'StarIcon',
          category: 'display',
          description: 'A star.',
          import: { from: 'components/StarIcon', name: 'StarIcon' },
          props: [{ name: 'label', type: 'string' }],
        },
      ],
    },
  });
  const hero = HERO.replace('import { Button }', 'import { Button, StarIcon }');
  const ids: Entry[] = [...IDS, ['sections/Hero:section/StarIcon', HERO_FILE, 'StarIcon']];
  const { brief } = writeBrief(depsFor(screen({ hero, ids }), kits), {
    slug: 'shop',
    write: { to: 'src/app', scope: 'new', files: [] },
    base: '',
  });
  const star = brief.components.find((component) => component.name === 'StarIcon');
  assert.deepEqual(star, {
    name: 'StarIcon',
    from: '@kit',
    origin: 'addition',
    project: null,
    uses: 1,
  });
});

test('a kit from a package names the project module and the project variable behind each', () => {
  const kits = withKit(
    (json) => {
      json.source = { type: 'npm', package: '@acme/ui', version: '1.0.0' };
      json.runtime = { entry: 'generated/kit.ts', styles: { files: [] } };
      json.tokens = {
        file: 'json/tokens.json',
        format: 'dtcg-2025.10',
        cssVars: { prefix: 'acme', map: 'json/css-vars.json' },
      };
      json.components = [
        {
          name: 'Button',
          category: 'action',
          description: 'Starts an action.',
          import: { from: '@acme/ui', name: 'Button' },
          props: [{ name: 'children', type: 'node', required: true }],
        },
        {
          name: 'Icon',
          category: 'display',
          description: 'Shows an icon.',
          import: { from: '@acme/ui/Icon' },
          props: [{ name: 'name', type: 'string', required: true }],
        },
      ];
    },
    { json: { 'json/css-vars.json': { 'color.ink': '--acme-ink' } } },
  );
  const { brief } = writeBrief(depsFor(screen({}), kits), {
    slug: 'shop',
    write: { to: 'src/app', scope: 'new', files: [] },
    base: '',
  });
  const byName = Object.fromEntries(brief.components.map((item) => [item.name, item.project]));
  assert.deepEqual(byName, { Badge: null, Button: '@acme/ui#Button', Icon: '@acme/ui/Icon' });
  const byVar = Object.fromEntries(brief.tokens.map((item) => [item.var, item.project]));
  assert.deepEqual(byVar, { '--kit-color-ink': '--acme-ink', '--kit-space-sm': null });
});

test('a version with options hands off the default of each; one without has no options field', () => {
  const input = {
    slug: 'shop',
    write: { to: 'src/app', scope: 'new' as const, files: [] },
    base: '',
  };
  assert.equal('options' in writeBrief(depsFor(screen({}), tiny()), input).brief, false);

  const store = screen({});
  writeVersionFiles(store, 'shop', 1, {
    'src/json/options.json': JSON.stringify({
      schemaVersion: 1,
      options: [
        {
          id: 'columns',
          label: 'Columns',
          default: '3',
          values: [
            { id: '3', label: 'Three' },
            { id: '2', label: 'Two' },
          ],
        },
      ],
    }),
  });
  const { brief } = writeBrief(depsFor(store, tiny()), input);
  assert.deepEqual(brief.options, [{ id: 'columns', default: '3' }]);
});

test('a rework draft is a screen with its own kind', () => {
  const { brief } = writeBrief(depsFor(screen({ kind: 'rework' }), tiny()), {
    slug: 'shop',
    write: { to: 'src/app', scope: 'new', files: [] },
    base: '',
  });
  assert.equal(brief.kind, 'rework');
  assert.equal(brief.draft.sections.length, 2);
});

test('a craft draft before a sketch is picked is SKETCH_NOT_PICKED, and nothing is written', () => {
  const { store } = tempDrafts();
  createDraft(store, {
    slug: 'chip',
    title: 'Chip',
    kit: TINY,
    now: NOW,
    kind: 'craft',
    craft: { subject: 'component', name: 'Chip', description: 'A small chip.' },
  });
  assert.throws(
    () =>
      writeBrief(depsFor(store, tiny()), {
        slug: 'chip',
        write: { to: 'src/ui', scope: 'new', files: [] },
        base: '',
      }),
    failsWith('SKETCH_NOT_PICKED'),
  );
  assert.equal(store.exists('chip', 'v1/handoff/code/brief.json'), false);
});

test('a craft draft gives its picked final as the one section', () => {
  const { store } = tempDrafts();
  createDraft(store, {
    slug: 'chip',
    title: 'Chip',
    kit: TINY,
    now: NOW,
    kind: 'craft',
    craft: { subject: 'component', name: 'Chip', description: 'A small chip.' },
  });
  const { version } = pickSketch(store, 'chip', 'A', NOW);
  assert.equal(version, 2);
  writeVersionFiles(store, 'chip', 2, {
    'src/tsx/sketches/A.tsx':
      "import { Button } from '@kit';\nexport const ChipA = () => <Button style={{ color: 'var(--kit-color-ink)' }}>Chip</Button>;",
    'src/tsx/sketches/B.tsx':
      "export const ChipB = () => <i style={{ color: 'var(--kit-color-ink)' }} />;",
    'build/json/ids.json': idsFile([
      ['sketches/A:Button', 'src/tsx/sketches/A.tsx', 'Button'],
      ['index:ChipAExample', 'src/tsx/index.tsx', 'ChipAExample'],
    ]),
  });
  const base = '.kitvas/drafts/chip/v2';
  const paths = [
    `${base}/src/tsx/index.tsx`,
    `${base}/src/tsx/sketches/A.tsx`,
    `${base}/src/tsx/sketches/B.tsx`,
  ];
  const { brief } = writeBrief(depsFor(store, tiny(), { listings: 0 }, paths), {
    slug: 'chip',
    write: { to: 'src/ui', scope: 'new', files: [] },
    base: '',
  });
  assert.equal(brief.kind, 'craft');
  assert.equal(brief.version, 2);
  assert.equal(brief.draft.layout, null);
  assert.deepEqual(brief.draft.sections, [
    { id: 'Chip', tsx: `${base}/src/tsx/sketches/A.tsx`, scss: null, why: null },
  ]);
  assert.deepEqual(brief.components, [
    { name: 'Button', from: '@kit', origin: 'kit', project: null, uses: 1 },
  ]);
  // The unpicked sketch's variable is not counted.
  assert.deepEqual(brief.tokens, [
    { var: '--kit-color-ink', path: 'color.ink', css: '#1d2025', project: null, uses: 1 },
  ]);
});

test('written twice, the listing is taken once unless again is asked for', () => {
  const store = screen({});
  const counter: Counter = { listings: 0 };
  const deps = depsFor(store, tiny(), counter);
  const input = {
    slug: 'shop',
    write: { to: 'src/app', scope: 'new' as const, files: [] },
    base: '',
  };
  const before = (): unknown => store.readJson('shop', 'v1/handoff/code/before.json');

  assert.equal(writeBrief(deps, input).listed, true);
  assert.deepEqual(before(), { schemaVersion: 1, watched: true, files: { f1: '1:a' } });

  assert.equal(writeBrief(deps, input).listed, false);
  assert.equal(counter.listings, 1);
  assert.deepEqual(before(), { schemaVersion: 1, watched: true, files: { f1: '1:a' } });

  assert.equal(writeBrief(deps, { ...input, again: true }).listed, true);
  assert.deepEqual(before(), { schemaVersion: 1, watched: true, files: { f2: '1:a' } });
});

test('the brief, the facts and the listing are written in the version folder', () => {
  const store = screen({});
  const { brief } = writeBrief(depsFor(store, tiny()), {
    slug: 'shop',
    write: { to: 'src/app', scope: 'open', files: [] },
    base: '',
  });
  assert.deepEqual(
    store.readJson('shop', 'v1/handoff/code/brief.json'),
    JSON.parse(JSON.stringify(brief)),
  );
  assert.deepEqual(store.readJson('shop', 'v1/handoff/code/target.json'), TARGET);
  assert.equal(store.exists('shop', 'v1/handoff/code/before.json'), true);
});

test('a path that leaves the project, or is never written, is HANDOFF_OUTSIDE', () => {
  const store = screen({});
  const brief = (write: { to: string; files: string[] }) => () =>
    writeBrief(depsFor(store, tiny()), {
      slug: 'shop',
      write: { ...write, scope: 'named' },
      base: '',
    });
  assert.throws(brief({ to: '../other', files: [] }), failsWith('HANDOFF_OUTSIDE'));
  assert.throws(brief({ to: 'C:/Windows', files: [] }), failsWith('HANDOFF_OUTSIDE'));
  assert.throws(brief({ to: '.git/hooks', files: [] }), failsWith('HANDOFF_OUTSIDE'));
  assert.throws(brief({ to: 'src', files: ['../x.ts'] }), failsWith('HANDOFF_OUTSIDE'));
  assert.throws(brief({ to: 'src', files: ['.env'] }), failsWith('HANDOFF_OUTSIDE'));
  assert.equal(store.exists('shop', 'v1/handoff/code/brief.json'), false);
});

test('a named file that does not exist is HANDOFF_INVALID', () => {
  const store = screen({});
  assert.throws(
    () =>
      writeBrief(depsFor(store, tiny()), {
        slug: 'shop',
        write: { to: 'src', scope: 'named', files: ['src/components/Missing.tsx'] },
        base: '',
      }),
    (error) =>
      error instanceof KitvasError &&
      error.code === 'HANDOFF_INVALID' &&
      error.params.at === 'files',
  );
});

test('a draft that was never built is HANDOFF_BUILD_FAILED; one with no sections is HANDOFF_INVALID', () => {
  const input = { slug: 'shop', write: { to: 'src', scope: 'new' as const, files: [] }, base: '' };
  assert.throws(
    () => writeBrief(depsFor(screen({ built: false }), tiny()), input),
    failsWith('HANDOFF_BUILD_FAILED'),
  );
  const { store } = tempDrafts();
  createDraft(store, { slug: 'shop', title: 'Shop', kit: TINY, now: NOW });
  assert.throws(() => writeBrief(depsFor(store, tiny()), input), failsWith('HANDOFF_INVALID'));
});

test('the decisions are the bullets under Handoff, without their dates', () => {
  assert.deepEqual(handoffDecisions(DECISIONS), [
    'Write new screens under src/app',
    'Scripts: npm run lint',
  ]);
  assert.deepEqual(handoffDecisions(undefined), []);
  assert.deepEqual(handoffDecisions('# Project decisions\n\n## Kits\n- One (2026-11-01)\n'), []);
  assert.deepEqual(
    handoffDecisions('## Handoff\r\n- Keep it small (2026-11-25)\r\n\r\n# Other\r\n- no\r\n'),
    ['Keep it small'],
  );
});
