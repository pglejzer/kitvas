import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  ChecksFileSchema,
  runChecks,
  type ToolMessage,
  type TypeChecker,
  type TypeCheckInput,
} from '../../src/checks/index.ts';
import { createFsDraftStore } from '../../src/drafts/adapters/fs-draft-store.ts';
import { createDraft } from '../../src/drafts/index.ts';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import type { KitStore } from '../../src/kit/index.ts';
import { createNodeBuildFs } from '../../src/render/adapters/node-build-fs.ts';
import type { Bundler, StylePipeline, UtilityCss } from '../../src/render/index.ts';
import { KitvasError } from '../../src/shared/index.ts';
import { checkShop, t } from '../helpers/draft/checks.ts';
import { tempDir } from '../helpers/tmp.ts';

const HERO = [
  "import { Button } from '@kit';",
  '',
  'export function Hero({ state }: { state: string }) {',
  '  return (',
  '    <section className="hero">',
  '      <h1>Shop</h1>',
  '      <p>State: {state}</p>',
  '      <Button variant="ghost">Buy</Button>',
  '      <button type="button">Later</button>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');

const SHEET = [
  '.hero {',
  '  color: #fff;',
  '  padding: 8px;',
  '  margin: 10px;',
  '  border-color: var(--kit-nope);',
  '}',
  '',
].join('\n');

test('a clean draft has nothing to fix and the results are saved', async () => {
  const shop = checkShop();
  try {
    const report = await shop.check();
    assert.equal(report.built, true);
    assert.deepEqual(report.findings, []);
    assert.deepEqual(report.summary, { fix: 0, review: 0 });
    assert.deepEqual(report.checks, {
      build: 'ran',
      types: 'ran',
      ds: 'ran',
      a11y: 'skipped',
      ui: 'skipped',
      ux: 'skipped',
      runtime: 'skipped',
    });
    assert.equal(report.path, join(shop.dir, 'v1', 'build', 'json', 'checks.json'));
    const raw: unknown = JSON.parse(readFileSync(report.path, 'utf8'));
    assert.equal(typeof raw === 'object' && raw !== null && 'path' in raw, false);
    const saved = ChecksFileSchema.parse(raw);
    assert.equal(saved.schemaVersion, 1);
    assert.equal(saved.slug, 'shop');
    assert.equal(saved.version, 1);
    assert.deepEqual(saved.findings, []);
    assert.ok(existsSync(join(shop.dir, 'v1', 'build', 'json', 'tsconfig.json')));
  } finally {
    await shop.close();
  }
});

test('type errors, plain controls and hand-written styles are found and placed', async () => {
  const shop = checkShop();
  try {
    shop.write('src/tsx/sections/Hero.tsx', HERO);
    shop.write('src/scss/sections/hero.scss', SHEET);
    const report = await shop.check();
    assert.equal(report.built, true);
    assert.deepEqual(
      report.findings.map((finding) => [
        finding.severity,
        finding.rule,
        finding.file,
        finding.line,
        finding.element,
      ]),
      [
        ['fix', 'types/TS2322', 'src/tsx/sections/Hero.tsx', 8, 'sections/Hero:section/Button'],
        ['fix', 'ds/raw-color', 'src/scss/sections/hero.scss', 2, null],
        ['fix', 'ds/raw-size', 'src/scss/sections/hero.scss', 3, null],
        ['fix', 'ds/unknown-token', 'src/scss/sections/hero.scss', 5, null],
        ['review', 'ds/raw-size', 'src/scss/sections/hero.scss', 4, null],
        [
          'review',
          'ds/raw-control',
          'src/tsx/sections/Hero.tsx',
          9,
          'sections/Hero:section/button',
        ],
      ],
    );
    assert.deepEqual(report.summary, { fix: 4, review: 2 });
    const colour = report.findings[1];
    assert.equal(colour?.message, '"#fff" is a colour written by hand.');
    assert.equal(colour?.hint, 'Use a colour token; "kitvas kit css" lists them.');
    assert.match(report.findings[0]?.message ?? '', /"ghost"/);
  } finally {
    await shop.close();
  }
});

test('a build error is a finding; the other file checks still run', async () => {
  const shop = checkShop();
  try {
    rmSync(join(shop.dir, 'v1', 'src', 'tsx', 'sections', 'OrderSummary.tsx'));
    const report = await shop.check();
    assert.equal(report.built, false);
    const build = report.findings.find((finding) => finding.check === 'build');
    assert.equal(build?.rule, 'build/bundle');
    assert.equal(build?.severity, 'fix');
    assert.equal(build?.file, 'src/tsx/index.tsx');
    assert.ok(report.findings.some((finding) => finding.check === 'types'));
    assert.equal(report.checks.ds, 'ran');
  } finally {
    await shop.close();
  }
});

test('a layout with problems is refused', async () => {
  const shop = checkShop();
  try {
    shop.write('md/layout.md', '# Layout: Shop\n');
    await assert.rejects(
      shop.check(),
      (error: unknown) => error instanceof KitvasError && error.code === 'DRAFT_INVALID',
    );
  } finally {
    await shop.close();
  }
});

/** A repo kit with Tailwind, as `kit new` and the learner leave it. */
const SHAD_KIT = {
  schemaVersion: 1,
  id: 'shad',
  name: 'shad',
  version: '0.0.0',
  source: { type: 'repo', path: 'src/components/ui' },
  framework: 'react',
  runtime: {
    entry: 'generated/kit.ts',
    styles: { tailwind: { entry: 'src/app/globals.css' } },
  },
  tokens: {
    file: 'json/tokens.json',
    format: 'dtcg-2025.10',
    cssVars: { prefix: 'kit', map: 'json/css-var-map.json' },
  },
  components: [
    {
      name: 'Button',
      category: 'action',
      description: 'Starts an action.',
      import: { from: 'src/components/ui/button', name: 'Button' },
      styling: ['className'],
      props: [{ name: 'children', type: 'node' }],
    },
  ],
};

const SHAD_TOKENS = {
  color: {
    $type: 'color',
    primary: { $value: { colorSpace: 'srgb', components: [0.1, 0.1, 0.1] } },
  },
};

const TAILWIND_HERO = [
  "import { Button } from '@kit';",
  '',
  'export function Hero({ state }: { state: string }) {',
  '  return (',
  '    <section className="hero flex p-[13px]">',
  '      <h1 className="text-[#fff] bg-nope">Shop</h1>',
  '      <Button className="hero-cta">Buy {state}</Button>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');

const TAILWIND_FILES: Record<string, string> = {
  'md/layout.md': [
    '# Layout: Shop',
    '',
    '## hero',
    'Purpose: Say what the shop sells.',
    'Components: Button',
    '',
  ].join('\n'),
  'src/tsx/sections/Hero.tsx': TAILWIND_HERO,
  // `hero-cta` is the sheet's own class, so Tailwind making no CSS for it is no finding.
  'src/scss/sections/hero.scss':
    '.hero {\n  color: var(--kit-color-primary);\n  &-cta {\n    margin: 0;\n  }\n}\n',
};

/** What tsc would say: one error in the draft, one in the project's component, one without a file. */
const MESSAGES: ToolMessage[] = [
  { file: 'src/tsx/sections/Hero.tsx', line: 7, column: 8, code: 'TS2322', text: 'Bad prop.' },
  {
    file: '../../../../src/components/ui/button.tsx',
    line: 1,
    column: 1,
    code: 'TS7016',
    text: 'In the project.',
  },
  { file: null, line: 0, column: 0, code: 'TS6053', text: 'Without a file.' },
];

/** A project with the `shad` kit in `.kitvas/kits/` and a draft `shop` that uses it. */
function tailwindShop() {
  const project = tempDir('kitvas-project-');
  const write = (relPath: string, text: string): void => {
    const file = join(project, ...relPath.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  write(
    'src/components/ui/button.tsx',
    'export function Button(props: { children?: string }) {\n  return <button type="button">{props.children}</button>;\n}\n',
  );
  write('src/app/globals.css', '@import "tailwindcss";\n');
  write('.kitvas/kits/shad/kit.json', JSON.stringify(SHAD_KIT, null, 2));
  write('.kitvas/kits/shad/json/tokens.json', JSON.stringify(SHAD_TOKENS, null, 2));
  write('.kitvas/kits/shad/json/css-var-map.json', '{ "color.primary": "--primary" }\n');
  write(
    '.kitvas/kits/shad/generated/kit.ts',
    'export { Button } from "../../../../src/components/ui/button";\n',
  );

  const folder = createFolderKitStore(join(project, '.kitvas', 'kits'));
  // The project layer of the kit store says which project a kit belongs to.
  const kits: KitStore = {
    ...folder,
    read: (id) => {
      const files = folder.read(id);
      return files && { ...files, project };
    },
  };
  const drafts = createFsDraftStore(join(project, '.kitvas', 'drafts'));
  createDraft(drafts, {
    slug: 'shop',
    title: 'Shop',
    kit: { id: 'shad', version: '0.0.0', hash: 'a'.repeat(64) },
    now: new Date('2026-11-23T10:00:00.000Z'),
  });
  for (const [relPath, text] of Object.entries(TAILWIND_FILES)) {
    drafts.writeText('shop', `v1/${relPath}`, text);
  }
  return { project, drafts, kits };
}

// The build's tools are stand-ins: this test is about what the checks make of their results.
const bundler: Bundler = {
  transform: async () => undefined,
  bundle: async () => ({ js: '', css: '', errors: [] }),
  exportNames: async () => ({ names: [], errors: [] }),
  dispose: async () => {},
};
const styles: StylePipeline = {
  compile: async () => ({ css: '', errors: [] }),
  dispose: async () => {},
};
const utility: UtilityCss = {
  build: async () => ({ css: '', unknown: ['bg-nope', 'hero-cta'], errors: [], files: [] }),
  dispose: async () => {},
};

test("a Tailwind project kit: class findings, and only the draft's type errors", async () => {
  const { project, drafts, kits } = tailwindShop();
  const inputs: TypeCheckInput[] = [];
  const types: TypeChecker = {
    check: async (input) => {
      inputs.push(input);
      return MESSAGES;
    },
  };
  const render = {
    drafts,
    kits,
    bundler,
    styles,
    utility,
    fs: createNodeBuildFs(),
    runtimeFiles: [],
  };
  const report = await runChecks({ render, types, t }, 'shop');

  assert.equal(report.built, true);
  const versionDir = join(project, '.kitvas', 'drafts', 'shop', 'v1');
  assert.deepEqual(inputs, [
    {
      workingDir: versionDir,
      entry: join(versionDir, 'src', 'tsx', 'index.tsx'),
      kitEntry: join(project, '.kitvas', 'kits', 'shad', 'generated', 'kit.ts'),
      project,
      resolve: undefined,
    },
  ]);
  const hero = 'src/tsx/sections/Hero.tsx';
  assert.deepEqual(
    report.findings.map((finding) => [
      finding.severity,
      finding.rule,
      finding.file,
      finding.line,
      finding.column,
    ]),
    [
      ['fix', 'types/TS2322', hero, 7, 8],
      ['fix', 'ds/tailwind-arbitrary', hero, 6, 22],
      ['review', 'types/TS6053', null, 0, 0],
      ['review', 'ds/tailwind-arbitrary', hero, 5, 35],
      ['review', 'ds/tailwind-unknown', hero, 6, 34],
    ],
  );
  assert.equal(
    report.findings[1]?.message,
    '"text-[#fff]" is an arbitrary value, not a step of the kit\'s theme.',
  );
  assert.equal(
    report.findings[4]?.message,
    '"bg-nope" produced no CSS: it is not a class of this kit\'s Tailwind setup.',
  );
  assert.equal(report.findings[4]?.hint, 'Check the spelling, or use a class the theme provides.');
});
