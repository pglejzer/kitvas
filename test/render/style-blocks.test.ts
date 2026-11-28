import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { rebaseUrls, styleBlocks } from '../../src/render/domain/style-blocks.ts';

test('blocks of another file, in order', () => {
  const text = [
    '<template><p class="a">x</p></template>',
    '<style scoped>',
    '.a { color: red; }',
    '</style>',
    "<style data-x='1' lang='scss'>",
    '$c: blue;',
    '.b { color: $c; }',
    '</style>',
    '<style lang="less" scoped>.c { d: e }</style>',
    '<style scoped lang=sass>.d</style>',
  ].join('\n');
  const blocks = styleBlocks(text);
  assert.deepEqual(
    blocks.map((block) => block.lang),
    ['css', 'scss', 'less', 'sass'],
  );
  assert.match(blocks[0]?.css ?? '', /\.a \{ color: red; \}/);
  assert.match(blocks[1]?.css ?? '', /\$c: blue;/);
  assert.deepEqual(styleBlocks('<p>no styles</p>'), []);
});

test('a relative address becomes absolute only when its file exists', () => {
  const folder = process.platform === 'win32' ? 'C:\\proj\\src' : '/proj/src';
  const there = new Set<string>();
  const exists = (file: string): boolean => there.has(file.split('\\').join('/'));
  const root = folder.split('\\').join('/');
  there.add(`${root}/a.svg`);
  there.add(`${root}/b.png`);
  there.add(`${root}/c.woff2`);

  const out = rebaseUrls(
    [
      '.a { background: url(./a.svg); }',
      ".b { background: url('b.png'); }",
      '.c { src: url( "c.woff2?v=2#x" ); }',
      '.d { background: url(./none.svg); }',
      '.e { background: url(data:image/png;base64,AAAA); }',
      '.f { background: url("https://example.com/x.png"); }',
      '.g { filter: url(#blur); }',
      '.h { background: url(/abs/a.svg); }',
    ].join('\n'),
    folder,
    exists,
  );
  const lines = out.split('\n');
  assert.equal(lines[0], `.a { background: url("${pathToFileURL(`${folder}/a.svg`).href}"); }`);
  assert.match(lines[1] ?? '', /url\("file:\/\/\/.*b\.png"\)/);
  assert.match(lines[2] ?? '', /url\("file:\/\/\/.*c\.woff2\?v=2#x"\)/);
  assert.equal(lines[3], '.d { background: url(./none.svg); }');
  assert.equal(lines[4], '.e { background: url(data:image/png;base64,AAAA); }');
  assert.equal(lines[5], '.f { background: url("https://example.com/x.png"); }');
  assert.equal(lines[6], '.g { filter: url(#blur); }');
  assert.equal(lines[7], '.h { background: url(/abs/a.svg); }');
});
