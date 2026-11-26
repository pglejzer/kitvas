import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { VERIFY_FILE, type VerifyFile } from '../../../src/checks/index.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import { loadKit } from '../../../src/kit/index.ts';
import { catalogDir } from '../../../src/shared/index.ts';
import { pageRoutes } from '../../../src/studio/pages/routes.ts';
import { studioHeaders } from '../../../src/studio/security/response-headers.ts';
import { tempDrafts } from '../../helpers/draft/drafts.ts';
import { BASE_STAMP, writeCatalog } from '../../helpers/kit/catalog.ts';
import { copyKit, tinyKitJson } from '../../helpers/kit/kits.ts';
import { tempDir } from '../../helpers/tmp.ts';
import { t } from '../../helpers/translate.ts';

const STAMP = { ...BASE_STAMP, kit: 'tiny', shown: ['Button.1'], skipped: [] };

/** A written kit whose first example has a reference, with a project and its built catalog. */
function setup(source: Record<string, unknown>) {
  const root = copyKit('tiny');
  const json = tinyKitJson() as {
    source: unknown;
    components: { examples?: { reference?: string }[] }[];
  };
  json.source = source;
  const example = json.components[0]?.examples?.[0];
  assert.ok(example);
  example.reference = 'source/images/button.png';
  writeFileSync(join(root, 'tiny', 'kit.json'), JSON.stringify(json));
  const kits = createFolderKitStore(root);
  const project = tempDir('kitvas-project-');
  const dir = writeCatalog(project, STAMP);
  return { kits, project, dir, hash: loadKit(kits, 'tiny').hash };
}

function pageOf(setupResult: ReturnType<typeof setup>): string {
  const routes = pageRoutes({
    drafts: tempDrafts().store,
    kits: setupResult.kits,
    project: setupResult.project,
    t,
    skin: '/* skin */',
    frame: { port: 5001, key: 'k3y' },
    version: '1.0.0',
    projectKit: () => 'base',
  });
  const route = routes.find((candidate) => candidate.id === 'kit');
  assert.ok(route);
  return route.handle({
    params: { id: 'tiny' },
    headers: {},
    query: new URLSearchParams(),
    host: '127.0.0.1:5000',
    nonce: 'N0nce',
  }) as unknown as string;
}

function writeVerify(dir: string, hash: string): void {
  const file: VerifyFile = {
    schemaVersion: 2,
    kit: 'tiny',
    hash,
    at: '2026-11-23T10:15:00.000Z',
    valid: true,
    steps: {
      schema: 'passed',
      imports: 'passed',
      types: 'passed',
      render: 'passed',
      tokens: 'passed',
      look: 'passed',
    },
    look: [{ key: 'Button.1', score: 81.4, size: 90, colour: 70.2, structure: 80 }],
    issues: [],
    notes: [],
  };
  writeFileSync(join(dir, VERIFY_FILE), JSON.stringify(file));
}

function writeRef(project: string): void {
  const refs = join(catalogDir(project, 'tiny'), 'build', 'img', 'refs');
  mkdirSync(refs, { recursive: true });
  writeFileSync(join(refs, 'Button.1.png'), 'png');
}

test('a written kit shows its source line and the reference beside the frame with its score', () => {
  const made = setup({ type: 'web', urls: ['https://example.com/a', 'https://example.com/b'] });
  writeRef(made.project);
  writeVerify(made.dir, made.hash);
  const text = pageOf(made);
  assert.ok(
    text.includes('<span class="kit-lead-line" data-kit-source>Website example.com</span>'),
  );
  assert.ok(text.includes('<div class="kit-pair"><iframe class="kit-frame"'));
  assert.ok(
    text.includes(
      '<img class="kit-ref" data-reference="Button.1" src="http://127.0.0.1:5001/k/k3y/tiny/img/refs/Button.1.png" alt="Reference for Button: ',
    ),
  );
  assert.ok(
    text.includes(
      'data-look="Button.1">Look 81/100 <span>(size 90, colour 70, structure 80)</span>',
    ),
  );
});

test('the figma and images sources have their own lines', () => {
  const figma = setup({ type: 'figma', url: `https://www.figma.com/design/${'a'.repeat(22)}/x` });
  assert.ok(
    pageOf(figma).includes('<span class="kit-lead-line" data-kit-source>Figma file</span>'),
  );
  const images = setup({ type: 'images' });
  assert.ok(
    pageOf(images).includes('<span class="kit-lead-line" data-kit-source>Screenshots</span>'),
  );
});

test('a score for another kit hash is replaced by the stale note', () => {
  const made = setup({ type: 'images' });
  writeRef(made.project);
  writeVerify(made.dir, 'another-hash');
  const text = pageOf(made);
  assert.ok(text.includes('data-look="stale"'));
  assert.ok(text.includes('Run &quot;kitvas kit verify tiny&quot;.'));
  assert.ok(!text.includes('Look 81/100'));
});

test('a reference that the build did not copy shows no image', () => {
  const made = setup({ type: 'images' });
  writeVerify(made.dir, made.hash);
  const text = pageOf(made);
  assert.ok(!text.includes('<img'));
  assert.ok(!text.includes('kit-pair'));
  assert.ok(text.includes('Look 81/100'));
});

test('the studio page may load images from the prototype origin and nowhere else', () => {
  const csp = studioHeaders('N0nce', 5001)['content-security-policy'] ?? '';
  const imgSrc = csp.split('; ').find((part) => part.startsWith('img-src'));
  assert.equal(
    imgSrc,
    "img-src 'self' data: http://127.0.0.1:5001 http://localhost:5001 http://kitvas.localhost:5001",
  );
});
