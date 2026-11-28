import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { createSassPipeline } from '../../src/render/adapters/sass-pipeline.ts';
import { scssLookup } from '../../src/render/adapters/scss-plugin.ts';
import { createTailwindCss } from '../../src/render/adapters/tailwind-css.ts';
import { createProjectStyles } from '../../src/render/app/project-styles.ts';
import type { ProjectStyleResult } from '../../src/render/ports/project-styles.ts';
import type { UtilityCss, UtilityInput } from '../../src/render/ports/utility-css.ts';
import { PLUGIN_ROOT } from '../../src/shared/index.ts';
import { tempDir } from '../helpers/tmp.ts';
import { TAILWIND_PACKAGES, tempProject } from './helpers/temp-project.ts';

function setup(files: Record<string, string>, utility?: UtilityCss) {
  const project = tempDir('kitvas-styles-');
  for (const [name, text] of Object.entries(files)) {
    const file = join(project, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  const pipeline = createSassPipeline({ roots: [PLUGIN_ROOT] });
  const styles = createProjectStyles({
    read: (file) => (existsSync(file) ? readFileSync(file, 'utf8') : undefined),
    exists: existsSync,
    lookup: scssLookup,
    compile: pipeline.compileText,
    utility: utility ?? createTailwindCss(),
  });
  return { project, styles, close: () => pipeline.dispose() };
}

function css(result: ProjectStyleResult): string {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.ok ? result.css : '';
}

test('a style file is compiled whole', async () => {
  const { project, styles, close } = setup({
    'a.scss': '$c: red;\n.a { color: $c; }\n',
    'b.css': '.b{color:blue}\n',
  });
  try {
    const scss = await styles({ project, file: 'a.scss', resolve: undefined });
    assert.equal(css(scss), '.a {\n  color: red;\n}');
    const plain = await styles({ project, file: 'b.css', resolve: undefined });
    assert.equal(css(plain), '.b {\n  color: blue;\n}');
  } finally {
    await close();
  }
});

test('plain CSS the compiler cannot parse is kept as it is: the browser reads it as the app does', async () => {
  // An old engine's hack (`screen\0`) stops the compiler; a browser drops only that rule.
  const hack = '.a{color:red}@media screen\\0 and (min-width:40em){.a{color:blue}}.b{color:green}';
  const { project, styles, close } = setup({
    'dist/app.min.css': hack,
    'bad.scss': '.a { color: ; }',
  });
  try {
    assert.equal(
      css(await styles({ project, file: 'dist/app.min.css', resolve: undefined })),
      hack,
    );
    // Sass is the project's own source: a failure there is still reported.
    const scss = await styles({ project, file: 'bad.scss', resolve: undefined });
    assert.equal(scss.ok, false);
  } finally {
    await close();
  }
});

test('the blocks of another file are compiled in order', async () => {
  const { project, styles, close } = setup({
    'Card.vue': [
      '<template><p /></template>',
      '<style>.a { color: red; }</style>',
      '<style lang="scss">$g: 4px;\n.b { gap: $g; }</style>',
      '',
    ].join('\n'),
  });
  try {
    const out = css(await styles({ project, file: 'Card.vue', resolve: undefined }));
    assert.ok(out.indexOf('.a {') !== -1 && out.indexOf('.a {') < out.indexOf('.b {'));
    assert.match(out, /gap: 4px;/);
  } finally {
    await close();
  }
});

test("an Angular component's .ts is compiled by its decorator's styles", async () => {
  const { project, styles, close } = setup({
    'list.component.ts':
      "@Component({\n  selector: 'app-list',\n  styles: `.page-link { cursor: pointer; }`,\n})\nexport class List {}\n",
    'plain.ts': 'export const styles = `.x { color: red; }`;\n',
  });
  try {
    const out = css(await styles({ project, file: 'list.component.ts', resolve: undefined }));
    assert.equal(out, '.page-link {\n  cursor: pointer;\n}');
    const none = await styles({ project, file: 'plain.ts', resolve: undefined });
    assert.equal(none.ok ? '' : none.reason, 'unsupported');
  } finally {
    await close();
  }
});

test('a language kitvas does not compile', async () => {
  const { project, styles, close } = setup({
    'A.vue': '<style lang="less">.a { .b; }</style>',
    'B.html': '<p>no style</p>',
    'bad.scss': '.a {\n  color: $nope;\n}\n',
  });
  try {
    const less = await styles({ project, file: 'A.vue', resolve: undefined });
    assert.equal(less.ok, false);
    assert.equal(less.ok ? '' : less.reason, 'unsupported');
    const none = await styles({ project, file: 'B.html', resolve: undefined });
    assert.equal(none.ok ? '' : none.reason, 'unsupported');
    const gone = await styles({ project, file: 'gone.scss', resolve: undefined });
    assert.equal(gone.ok ? '' : gone.reason, 'missing');
    const bad = await styles({ project, file: 'bad.scss', resolve: undefined });
    assert.equal(bad.ok ? '' : bad.reason, 'failed');
    assert.match(bad.ok ? '' : bad.detail, /bad\.scss:2: /);
  } finally {
    await close();
  }
});

test("loads follow the project's own patterns", async () => {
  const { project, styles, close } = setup({
    'src/styles/_tokens.scss': '$gap: 8px;\n',
    'src/lib/_mixins.scss': '$pad: 3px;\n',
    'by-root.scss': "@use 'styles/tokens' as t;\n.a { gap: t.$gap; }\n",
    'by-paths.scss': "@use '@lib/mixins' as m;\n.b { padding: m.$pad; }\n",
    'tsconfig.json': JSON.stringify({
      compilerOptions: { paths: { '@lib/*': ['./src/lib/*'] } },
    }),
  });
  try {
    const root = await styles({
      project,
      file: 'by-root.scss',
      resolve: { roots: ['src'], alias: {}, types: [] },
    });
    assert.match(css(root), /gap: 8px;/);
    const paths = await styles({ project, file: 'by-paths.scss', resolve: undefined });
    assert.match(css(paths), /padding: 3px;/);
  } finally {
    await close();
  }
});

test('a style file with a Tailwind line goes to the utility port with the sources, not to Sass', async () => {
  const seen: UtilityInput[] = [];
  const utility: UtilityCss = {
    build: async (input) => {
      seen.push(input);
      return { css: '.p-4 { padding: 1rem; }', unknown: [], errors: [], files: [] };
    },
    dispose: async () => {},
  };
  const { project, styles, close } = setup(
    {
      'v3.css': '@tailwind base;\n@tailwind utilities;\n',
      'v4.css': "@import 'tailwindcss';\n",
      'plain.scss': '.a { color: red; }\n',
    },
    utility,
  );
  try {
    const sources = ['/app/page.html'];
    for (const file of ['v3.css', 'v4.css']) {
      assert.equal(
        css(await styles({ project, file, resolve: undefined, sources })),
        '.p-4 { padding: 1rem; }',
      );
    }
    assert.equal(seen.length, 2);
    assert.deepEqual(seen[0]?.sources, sources);
    assert.equal(seen[0]?.entry, `${project.split('\\').join('/')}/v3.css`);
    await styles({ project, file: 'plain.scss', resolve: undefined, sources });
    assert.equal(seen.length, 2, 'a file with no Tailwind never reaches the port');
  } finally {
    await close();
  }
});

test('a Tailwind style file is built with the project own Tailwind for the classes of its sources', async () => {
  const real = createTailwindCss();
  const project = tempProject(TAILWIND_PACKAGES, {
    'app.css': '@import "tailwindcss";\n@theme {\n  --color-brand: #0055ff;\n}\n',
    'page.html': '<p class="p-4 bg-brand">Hello</p>\n',
  });
  const { styles, close } = setup({}, real);
  try {
    const out = css(
      await styles({
        project,
        file: 'app.css',
        resolve: undefined,
        sources: [join(project, 'page.html')],
      }),
    );
    assert.match(out, /\.bg-brand/);
    assert.match(out, /\.p-4/);
    assert.doesNotMatch(out, /\.mt-8/);
  } finally {
    await close();
    await real.dispose();
  }
});

test('a relative address becomes absolute only when its file exists', async () => {
  const { project, styles, close } = setup({
    'ui/a.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'ui/a.scss': [
      '.a { background: url(./a.svg); }',
      '.b { background: url(./none.svg); }',
      '.c { background: url(data:image/png;base64,AAAA); }',
      '.d { background: url(https://example.com/x.png); }',
      '',
    ].join('\n'),
  });
  try {
    const out = css(await styles({ project, file: 'ui/a.scss', resolve: undefined }));
    assert.match(out, /url\("file:\/\/\/.*a\.svg"\)/);
    assert.match(out, /url\(\.\/none\.svg\)/);
    assert.match(out, /url\(data:image\/png;base64,AAAA\)/);
    assert.match(out, /url\(https:\/\/example\.com\/x\.png\)/);
  } finally {
    await close();
  }
});
