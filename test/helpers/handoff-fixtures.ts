// What the hand-off tests share: a draft `shop` with the files a build leaves, the layer facts a
// browser would measure for it, and a bundler that makes no real bundle.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LayerFacts, LayerNode } from '../../src/checks/index.ts';
import type { DraftStore } from '../../src/drafts/index.ts';
import type { Bundler } from '../../src/render/index.ts';
import { GOOD_LAYOUT, writeVersionFiles } from './drafts.ts';

/** Bytes that are not a real picture: a package copies images and never decodes them. */
export const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

export const fakeBundler: Bundler = {
  async transform() {
    return undefined;
  },
  async bundle() {
    return { js: 'var B={};', css: '', errors: [] };
  },
  async exportNames() {
    return { names: [], errors: [] };
  },
  async dispose() {},
};

function node(parts: Pick<LayerNode, 'kind' | 'tag' | 'box'> & Partial<LayerNode>): LayerNode {
  return {
    parent: -1,
    ks: null,
    ownKs: false,
    placed: 'flow',
    fill: [false, false],
    flow: null,
    paints: [],
    border: null,
    radius: [0, 0, 0, 0],
    shadows: [],
    opacity: 1,
    clips: false,
    text: null,
    svg: null,
    ...parts,
  };
}

/** What the layer walk reads of the shop page: two sections, a heading and one picture. */
export function shopFacts(imageSrc = '../img/logo.png', truncated = false): LayerFacts {
  return {
    viewport: [1280, 900],
    page: [1280, 700],
    background: '#ffffffff',
    truncated,
    nodes: [
      node({
        ks: 'sections/Hero:section',
        ownKs: true,
        tag: 'section',
        kind: 'frame',
        box: [0, 0, 1280, 400],
        paints: [{ kind: 'solid', colour: '#fafafaff' }],
      }),
      node({
        parent: 0,
        ks: 'sections/Hero:section/h1',
        ownKs: true,
        tag: 'h1',
        kind: 'text',
        box: [24, 24, 400, 40],
        text: {
          characters: 'Shop the new season',
          truncated: false,
          family: 'Inter',
          weight: 600,
          italic: false,
          size: 32,
          lineHeight: 40,
          letterSpacing: 0,
          align: 'left',
          transform: 'none',
          colour: '#111111ff',
          runs: [],
        },
      }),
      node({
        parent: 0,
        tag: 'img',
        kind: 'image',
        box: [24, 80, 120, 120],
        paints: [{ kind: 'image', src: imageSrc, fit: 'cover' }],
      }),
      node({
        ks: 'sections/OrderSummary:aside',
        ownKs: true,
        tag: 'aside',
        kind: 'frame',
        box: [0, 400, 1280, 300],
        paints: [{ kind: 'solid', colour: '#ffffffff' }],
      }),
    ],
  };
}

const idOf = (name: string, tag: string) => ({
  file: `src/tsx/sections/${name}.tsx`,
  line: 5,
  column: 5,
  tag,
});

/** The layout, the ids, the styles and one picture a build of `shop` version 1 leaves. */
export function writeShopBuild(store: DraftStore): void {
  writeVersionFiles(store, 'shop', 1, {
    'md/layout.md': GOOD_LAYOUT,
    'build/css/index.css': '.hero{color:var(--kit-color-ink);padding-inline:var(--kit-space-sm)}',
    'build/json/ids.json': JSON.stringify({
      schemaVersion: 1,
      ids: {
        'sections/Hero:section': idOf('Hero', 'section'),
        'sections/Hero:section/h1': idOf('Hero', 'h1'),
        'sections/OrderSummary:aside': idOf('OrderSummary', 'aside'),
      },
    }),
  });
  const img = join(store.dir('shop'), 'v1', 'build', 'img');
  mkdirSync(img, { recursive: true });
  writeFileSync(join(img, 'logo.png'), PNG);
}
