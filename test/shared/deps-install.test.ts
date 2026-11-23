import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  depsAreFresh,
  ensureDeps,
  installDeps,
  lockHash,
  npmInvocation,
} from '../../src/shared/deps/deps-install.ts';
import { tempDir } from '../helpers/tmp.ts';

function fakeRoot(): string {
  const root = tempDir();
  writeFileSync(join(root, 'package.json'), '{"name":"x"}');
  writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3}');
  return root;
}

test('fresh when the root has node_modules (development)', () => {
  const root = fakeRoot();
  mkdirSync(join(root, 'node_modules'));
  assert.equal(depsAreFresh(root, tempDir()), true);
});

test('install copies manifests, runs npm ci without scripts and stamps the hash', () => {
  const root = fakeRoot();
  const data = join(tempDir(), 'data');
  const calls: { command: string; args: string[]; cwd: string }[] = [];
  const done = installDeps(root, data, (command, args, cwd) => {
    calls.push({ command, args, cwd });
    return 0;
  });
  assert.equal(done, true);
  assert.equal(calls.length, 1);
  assert.ok(calls[0]?.args.includes('ci'));
  assert.ok(calls[0]?.args.includes('--ignore-scripts'));
  assert.ok(calls[0]?.args.includes('--omit=dev'));
  assert.equal(calls[0]?.cwd, data);
  assert.ok(existsSync(join(data, 'package-lock.json')));
  assert.equal(readFileSync(join(data, 'package-lock.sha256'), 'utf8').trim(), lockHash(root));
  assert.equal(depsAreFresh(root, data), true);
});

test('a failed install leaves no stamp, so the next run retries', () => {
  const root = fakeRoot();
  const data = join(tempDir(), 'data');
  assert.equal(
    installDeps(root, data, () => 1),
    false,
  );
  assert.equal(depsAreFresh(root, data), false);
});

test('stale when the lockfile changed', () => {
  const root = fakeRoot();
  const data = join(tempDir(), 'data');
  installDeps(root, data, () => 0);
  writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3,"changed":true}');
  assert.equal(depsAreFresh(root, data), false);
});

test('npm is run through node when npm-cli.js sits next to it', () => {
  const [command, args] = npmInvocation('/opt/node/bin/node', (p) => p.includes('lib'));
  assert.equal(command, '/opt/node/bin/node');
  assert.equal(args.length, 1);
  assert.deepEqual(
    npmInvocation('/opt/node/bin/node', () => false),
    ['npm', []],
  );
});

test('ensureDeps installs once, logs, and writes the data-dir pointer', () => {
  const root = fakeRoot();
  const home = tempDir();
  const data = join(tempDir(), 'data');
  const logs: string[] = [];
  let runs = 0;
  const input = {
    root,
    dataDir: data,
    home,
    run: () => {
      runs += 1;
      return 0;
    },
    log: (text: string) => logs.push(text),
    installing: 'installing',
    remember: true,
  };
  assert.equal(ensureDeps(input), true);
  assert.equal(ensureDeps(input), true);
  assert.equal(runs, 1);
  assert.deepEqual(logs, ['installing']);
  assert.equal(readFileSync(join(home, '.kitvas', 'data-dir'), 'utf8').trim(), data);
});

test('only the session hook writes the pointer; a CLI run with another folder leaves it', () => {
  const root = fakeRoot();
  const home = tempDir();
  const hookData = join(tempDir(), 'plugin-data');
  const base = { root, home, run: () => 0, log: () => undefined, installing: 'installing' };
  ensureDeps({ ...base, dataDir: hookData, remember: true });
  // `KITVAS_DATA_DIR=<other> kitvas …` for one command must not move every later run there.
  ensureDeps({ ...base, dataDir: join(tempDir(), 'other'), remember: false });
  assert.equal(readFileSync(join(home, '.kitvas', 'data-dir'), 'utf8').trim(), hookData);
});
