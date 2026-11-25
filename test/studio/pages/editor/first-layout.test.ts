import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { modeKey } from '../../../../client/studio/edit/select/mode-memory.ts';
import {
  CHROME,
  fitSides,
  LAYOUT_KEY,
  type Mode,
  NARROW_QUERY,
  openingSide,
  readSettings,
  SIDES,
  type Side,
} from '../../../../client/studio/shell/layout.ts';
import {
  MODE_KEY_START,
  OPENING_CODE,
  openingLayout,
  LAYOUT_KEY as SCRIPT_LAYOUT_KEY,
} from '../../../../src/studio/pages/editor/first-layout.ts';

/** A page element with the parts of the DOM the script touches. */
class Fake {
  attrs = new Map<string, string>();
  props = new Map<string, string>();
  hidden = false;
  children = new Map<string, Fake[]>();
  style = { setProperty: (name: string, value: string): void => void this.props.set(name, value) };
  hasAttribute = (name: string): boolean => this.attrs.has(name);
  getAttribute = (name: string): string | null => this.attrs.get(name) ?? null;
  setAttribute = (name: string, value: string): void => void this.attrs.set(name, value);
  removeAttribute = (name: string): void => void this.attrs.delete(name);
  querySelector = (selector: string): Fake | null => this.children.get(selector)?.[0] ?? null;
  querySelectorAll = (selector: string): Fake[] => this.children.get(selector) ?? [];
}

type Page = {
  main: Fake;
  asides: Record<Side, Fake>;
  grips: Record<Side, Fake>;
  fold: Fake;
  layers: Fake;
  modes: Fake[];
};

function pageOf(slug: string, editable: boolean): Page {
  const main = new Fake();
  main.attrs.set('data-draft', slug);
  main.attrs.set('data-mode', 'preview');
  if (editable) main.attrs.set('data-edit-panel', '');
  const asides = { left: new Fake(), right: new Fake() };
  asides.left.attrs.set('data-folded', '');
  const grips = { left: new Fake(), right: new Fake() };
  grips.left.hidden = true;
  const fold = new Fake();
  const layers = new Fake();
  const modes = ['preview', 'edit'].map((name) => {
    const button = new Fake();
    button.attrs.set('data-shell-mode', name);
    return button;
  });
  for (const side of SIDES) {
    main.children.set(`aside[data-side="${side}"]`, [asides[side]]);
    main.children.set(`[data-grip="${side}"]`, [grips[side]]);
  }
  main.children.set('[data-fold="left"]', [fold]);
  main.children.set('button[data-rail-tab="layers"]', [layers]);
  main.children.set('button[data-shell-mode]', modes);
  return { main, asides, grips, fold, layers, modes };
}

type World = {
  layout?: string | 'throws';
  mode?: string | 'throws';
  width: number;
  editable?: boolean;
};

/** Runs the script on a page in a world with the given storage and window; the page afterwards. */
function run(world: World): Page {
  const page = pageOf('shop', world.editable ?? true);
  const storage = (value: string | undefined, key: string) => ({
    getItem: (asked: string): string | null => {
      if (value === 'throws') throw new Error('blocked');
      return asked === key && value !== undefined ? value : null;
    },
  });
  runInNewContext(OPENING_CODE, {
    document: {
      querySelector: (selector: string) => (selector === 'main[data-mode]' ? page.main : null),
    },
    localStorage: storage(world.layout, LAYOUT_KEY),
    sessionStorage: storage(world.mode, modeKey('shop')),
    innerWidth: world.width,
    // `(max-width: 1099.98px)`
    matchMedia: () => ({ matches: world.width <= 1099.98 }),
  });
  return page;
}

/** What `panels.ts` draws at mount for the same world, by `layout.ts`. */
function expected(world: World): {
  mode: Mode;
  widths: Record<Side, string>;
  folded: Record<Side, boolean>;
  open: boolean;
} {
  const mode: Mode = (world.editable ?? true) && world.mode === 'edit' ? 'edit' : 'preview';
  const settings = readSettings({
    getItem: () => (world.layout === undefined || world.layout === 'throws' ? null : world.layout),
    setItem: () => undefined,
  });
  const view = {
    left: openingSide(settings.left, 'left', mode),
    right: openingSide(settings.right, 'right', mode),
  };
  const narrow = world.width <= 1099.98;
  const fitted = fitSides(view, world.width - CHROME);
  const pick = (side: Side): number => (narrow ? view[side].width : fitted[side]);
  return {
    mode,
    widths: { left: `${pick('left')}px`, right: `${pick('right')}px` },
    folded: { left: view.left.folded, right: view.right.folded },
    open: !narrow && !view.left.folded,
  };
}

const LAYOUTS: (string | undefined)[] = [
  undefined,
  'throws',
  'not json',
  'null',
  '[]',
  '{}',
  JSON.stringify({ left: { width: 300, folded: false }, right: { width: 400, folded: true } }),
  JSON.stringify({ left: { width: 700, folded: false }, right: { width: 700, folded: false } }),
  JSON.stringify({ left: { width: 100, folded: 'yes' }, right: { width: 9999 } }),
  JSON.stringify({ left: { folded: true }, right: { folded: false } }),
  JSON.stringify({ left: { width: 250.6 }, right: null }),
];
const MODES: (string | undefined)[] = [undefined, 'throws', 'preview', 'edit', 'junk'];
const WIDTHS = [800, 1099, 1100, 1280, 1600, 2560];

test('the script lays the page out as panels.ts does for every stored layout, mode and window width', () => {
  for (const layout of LAYOUTS) {
    for (const mode of MODES) {
      for (const width of WIDTHS) {
        for (const editable of [true, false]) {
          const world: World = { width, editable, ...(layout === undefined ? {} : { layout }) };
          if (mode !== undefined) world.mode = mode;
          const label = JSON.stringify(world);
          const page = run(world);
          const want = expected(world);
          assert.equal(page.main.getAttribute('data-mode'), want.mode, `mode ${label}`);
          for (const side of SIDES) {
            assert.equal(
              page.main.props.get(`--side-${side}`),
              want.widths[side],
              `${side} ${label}`,
            );
            assert.equal(page.asides[side].hasAttribute('data-folded'), want.folded[side], label);
            assert.equal(page.grips[side].hidden, want.folded[side], label);
          }
          assert.equal(page.fold.getAttribute('aria-expanded'), String(want.open), label);
          assert.equal(page.layers.getAttribute('aria-pressed'), String(want.open), label);
          const pressed = page.modes.map((button) => button.getAttribute('aria-pressed'));
          assert.deepEqual(pressed, [
            String(want.mode === 'preview'),
            String(want.mode === 'edit'),
          ]);
        }
      }
    }
  }
});

test('a remembered Edit opens the editable latest version in Edit with both panels open', () => {
  const page = run({ width: 1600, mode: 'edit' });
  assert.equal(page.main.getAttribute('data-mode'), 'edit');
  assert.equal(page.asides.left.hasAttribute('data-folded'), false);
  assert.equal(page.asides.right.hasAttribute('data-folded'), false);
  assert.equal(page.main.props.get('--side-left'), '248px');
  assert.equal(page.main.props.get('--side-right'), '312px');
});

test('a version that cannot be edited stays in Preview whatever the tab remembered', () => {
  const page = run({ width: 1600, mode: 'edit', editable: false });
  assert.equal(page.main.getAttribute('data-mode'), 'preview');
  assert.equal(page.asides.left.hasAttribute('data-folded'), true);
});

test('a stored width is clamped to the window as fitSides does', () => {
  const layout = JSON.stringify({
    left: { width: 700, folded: false },
    right: { width: 700, folded: false },
  });
  const page = run({ width: 1280, layout });
  assert.equal(
    page.main.props.get('--side-left'),
    `${
      fitSides(
        { left: { width: 700, folded: false }, right: { width: 700, folded: false } },
        1280 - CHROME,
      ).left
    }px`,
  );
});

test('storage that throws leaves the defaults and does not throw', () => {
  assert.doesNotThrow(() => run({ width: 1600, layout: 'throws', mode: 'throws' }));
  const page = run({ width: 1600, layout: 'throws', mode: 'throws' });
  assert.equal(page.main.getAttribute('data-mode'), 'preview');
  assert.equal(page.asides.left.hasAttribute('data-folded'), true);
  assert.equal(page.asides.right.hasAttribute('data-folded'), false);
});

test('a document without the editor page does nothing', () => {
  assert.doesNotThrow(() =>
    runInNewContext(OPENING_CODE, { document: { querySelector: () => null } }),
  );
});

test('the script reads the same storage keys and media query as the client', () => {
  assert.equal(SCRIPT_LAYOUT_KEY, LAYOUT_KEY);
  assert.equal(modeKey('x'), `${MODE_KEY_START}x`);
  assert.ok(OPENING_CODE.includes(`'${LAYOUT_KEY}'`));
  assert.ok(OPENING_CODE.includes(`'${MODE_KEY_START}'`));
  assert.ok(OPENING_CODE.includes(NARROW_QUERY));
});

test('the script is on the response nonce and carries no any', () => {
  const script = openingLayout('N0nce').text;
  assert.ok(script.startsWith('<script nonce="N0nce">'));
  assert.ok(script.endsWith('</script>'));
  assert.ok(!/\bany\b/.test(OPENING_CODE));
});
