import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { KitvasError } from '../../src/shared/errors/errors.ts';
import {
  loadSettings,
  saveProjectKit,
  UserConfigSchema,
} from '../../src/shared/settings/config.ts';
import { decisionsTemplate, parseDecisions } from '../../src/shared/settings/decisions.ts';
import { effectiveSettings, readProjectDecisions } from '../../src/shared/settings/project-file.ts';
import { initWorkspace } from '../../src/shared/settings/workspace.ts';
import { tempDir } from '../helpers/tmp.ts';

/** The user's `config.json` (or an old project one) in `<dir>/.kitvas/`. */
function write(dir: string, value: unknown): void {
  mkdirSync(join(dir, '.kitvas'), { recursive: true });
  writeFileSync(join(dir, '.kitvas', 'config.json'), JSON.stringify(value));
}

/** A project's decisions file. */
function writeDecisions(dir: string, text: string): void {
  mkdirSync(join(dir, '.kitvas'), { recursive: true });
  writeFileSync(join(dir, '.kitvas', 'decisions.md'), text);
}

const isInvalid = (error: unknown) =>
  error instanceof KitvasError && error.code === 'CONFIG_INVALID';

test('defaults when nothing is configured', () => {
  const home = tempDir();
  const cwd = tempDir();
  assert.deepEqual(loadSettings({ home, cwd }), {
    language: 'en',
    kit: 'base',
    copy: null,
    check: 'normal',
    studioIdleMinutes: 240,
    workspace: { path: join(cwd, '.kitvas'), exists: false },
  });
});

test('studioIdleMinutes: whole minutes from 0 (never) to one week, 240 when not set', () => {
  assert.equal(UserConfigSchema.parse({ schemaVersion: 1 }).studioIdleMinutes, 240);
  assert.equal(UserConfigSchema.parse({ schemaVersion: 1, language: 'pl' }).studioIdleMinutes, 240);
  for (const minutes of [0, 1, 240, 10_080]) {
    const parsed = UserConfigSchema.parse({ schemaVersion: 1, studioIdleMinutes: minutes });
    assert.equal(parsed.studioIdleMinutes, minutes);
  }
  for (const minutes of [-1, 10_081, 1.5, '240', null]) {
    const parsed = UserConfigSchema.safeParse({ schemaVersion: 1, studioIdleMinutes: minutes });
    assert.equal(parsed.success, false, String(minutes));
  }
});

test('reads studioIdleMinutes from the user config; a wrong one is CONFIG_INVALID', () => {
  const home = tempDir();
  write(home, { schemaVersion: 1, studioIdleMinutes: 0 });
  assert.equal(loadSettings({ home, cwd: tempDir() }).studioIdleMinutes, 0);
  write(home, { schemaVersion: 1, studioIdleMinutes: 30 });
  assert.equal(loadSettings({ home, cwd: tempDir() }).studioIdleMinutes, 30);
  write(home, { schemaVersion: 1, studioIdleMinutes: 20_000 });
  assert.throws(() => loadSettings({ home, cwd: tempDir() }), isInvalid);
});

test('reads the user language and the project settings from the decisions file', () => {
  const home = tempDir();
  const cwd = tempDir();
  write(home, { schemaVersion: 1, language: 'pl' });
  writeDecisions(cwd, '---\nkit: mui\ncopy: pl\ncheck: deep\n---\n# Decisions\n');
  const settings = loadSettings({ home, cwd });
  assert.equal(settings.language, 'pl');
  assert.equal(settings.kit, 'mui');
  assert.equal(settings.copy, 'pl');
  assert.equal(settings.check, 'deep');
  assert.equal(settings.workspace.exists, true);
});

test('the user config rejects unknown fields and broken JSON with CONFIG_INVALID', () => {
  const home = tempDir();
  write(home, { schemaVersion: 1, extra: true });
  assert.throws(() => loadSettings({ home, cwd: tempDir() }), isInvalid);
  const broken = tempDir();
  mkdirSync(join(broken, '.kitvas'));
  writeFileSync(join(broken, '.kitvas', 'config.json'), '{not json');
  assert.throws(() => loadSettings({ home: broken, cwd: tempDir() }), KitvasError);
});

test('a decisions file with no settings, a bad value or a broken block never stops a command', () => {
  for (const text of [
    '# only text\n',
    '---\nkit: ../x\ncheck: sometimes\n---\n',
    '---\nkit: acme\n# never closed\n',
    '﻿---\r\nkit: acme\r\n---\r\n',
  ]) {
    const cwd = tempDir();
    writeDecisions(cwd, text);
    const settings = loadSettings({ home: tempDir(), cwd });
    assert.equal(settings.check, 'normal');
    assert.equal(settings.copy, null);
    assert.equal(settings.kit, text.startsWith('﻿') ? 'acme' : 'base');
  }
});

test('saveProjectKit sets kit: in the front matter and keeps every other byte', () => {
  const cwd = tempDir();
  initWorkspace(cwd);
  saveProjectKit(cwd, 'acme');
  const file = join(cwd, '.kitvas', 'decisions.md');
  assert.equal(readFileSync(file, 'utf8'), decisionsTemplate('acme'));
  assert.equal(loadSettings({ home: tempDir(), cwd }).kit, 'acme');

  const hand =
    '---\r\ncopy: pl\r\nkit: old\r\n---\r\n# Mine\r\n\r\n## Kits\r\n- a (2026-01-01)\r\n';
  writeFileSync(file, hand);
  saveProjectKit(cwd, 'firma');
  assert.equal(readFileSync(file, 'utf8'), hand.replace('kit: old', 'kit: firma'));
});

test('saveProjectKit makes the file when it was not there yet', () => {
  const cwd = tempDir();
  mkdirSync(join(cwd, '.kitvas'));
  saveProjectKit(cwd, 'firma');
  assert.equal(loadSettings({ home: tempDir(), cwd }).kit, 'firma');
  assert.ok(readFileSync(join(cwd, '.kitvas', 'decisions.md'), 'utf8').includes('## Layout'));
});

test('saveProjectKit refuses an id that is not one and writes nothing', () => {
  const cwd = tempDir();
  initWorkspace(cwd);
  assert.throws(() => saveProjectKit(cwd, '../x'), isInvalid);
  assert.equal(loadSettings({ home: tempDir(), cwd }).kit, 'base');
  assert.equal(readFileSync(join(cwd, '.kitvas', 'decisions.md'), 'utf8'), decisionsTemplate());
});

test('a workspace from before: its kit moves into the decisions file once, nothing lost', () => {
  const cwd = tempDir();
  write(cwd, { schemaVersion: 1, kit: 'mui' });
  assert.equal(loadSettings({ home: tempDir(), cwd }).kit, 'mui');
  assert.equal(
    readFileSync(join(cwd, '.kitvas', 'decisions.md'), 'utf8'),
    decisionsTemplate('mui'),
  );
  assert.equal(existsSync(join(cwd, '.kitvas', 'config.json')), false);
  // The second read has nothing left to move.
  assert.equal(loadSettings({ home: tempDir(), cwd }).kit, 'mui');

  const init = tempDir();
  write(init, { schemaVersion: 1, kit: 'acme' });
  assert.equal(initWorkspace(init).created, false);
  assert.equal(loadSettings({ home: tempDir(), cwd: init }).kit, 'acme');
});

test('the move keeps a kit value that does not fit as written, and a broken config.json stays', () => {
  const odd = tempDir();
  write(odd, { schemaVersion: 1, kit: '../x' });
  const settings = loadSettings({ home: tempDir(), cwd: odd });
  assert.equal(settings.kit, 'base');
  assert.deepEqual(
    parseDecisions(readFileSync(join(odd, '.kitvas', 'decisions.md'), 'utf8')).warnings.map(
      (warning) => warning.code,
    ),
    ['badValue'],
  );

  const broken = tempDir();
  mkdirSync(join(broken, '.kitvas'));
  writeFileSync(join(broken, '.kitvas', 'config.json'), '{not json');
  assert.throws(() => loadSettings({ home: tempDir(), cwd: broken }), isInvalid);
  assert.equal(existsSync(join(broken, '.kitvas', 'decisions.md')), false);
  assert.equal(readFileSync(join(broken, '.kitvas', 'config.json'), 'utf8'), '{not json');
});

test('with a decisions file, an old config.json is not read and not touched', () => {
  const cwd = tempDir();
  write(cwd, { schemaVersion: 1, kit: 'mui' });
  writeDecisions(cwd, '---\nkit: acme\n---\n');
  assert.equal(loadSettings({ home: tempDir(), cwd }).kit, 'acme');
  assert.equal(existsSync(join(cwd, '.kitvas', 'config.json')), true);
});

test('a kit the file names that does not exist is a warning and base, from the default', () => {
  const parsed = parseDecisions('---\nkit: gone\ncopy: pl\n---\n');
  const found = effectiveSettings(parsed, ['base', 'tiny']);
  assert.deepEqual(found.settings, { kit: 'base', copy: 'pl', check: 'normal' });
  assert.deepEqual(found.from, { kit: 'default', copy: 'file', check: 'default' });
  assert.deepEqual(found.warnings, [{ code: 'kitMissing', line: 2, params: { id: 'gone' } }]);
  // A kit that exists, or no list to check against, is taken as written.
  assert.equal(effectiveSettings(parsed, ['gone']).settings.kit, 'gone');
  assert.equal(effectiveSettings(parsed).settings.kit, 'gone');
});

test('readProjectDecisions: no workspace gives the defaults, a file gives its parts', () => {
  const none = tempDir();
  const empty = readProjectDecisions(none);
  assert.equal(empty.exists, false);
  assert.equal(empty.path, join(none, '.kitvas', 'decisions.md'));
  assert.equal(empty.text, '');
  assert.deepEqual(empty.settings, { kit: 'base', copy: null, check: 'normal' });
  assert.deepEqual(empty.from, { kit: 'default', copy: 'default', check: 'default' });

  const cwd = tempDir();
  writeDecisions(cwd, '---\ncheck: deep\nkit: gone\n---\n# T\n\n## Kits\n- x (2026-01-01)\n');
  const found = readProjectDecisions(cwd, ['base']);
  assert.equal(found.exists, true);
  assert.equal(found.settings.check, 'deep');
  assert.equal(found.settings.kit, 'base');
  assert.equal(found.from.check, 'file');
  assert.equal(found.text, '# T\n\n## Kits\n- x (2026-01-01)\n');
  assert.deepEqual(
    found.warnings.map((warning) => warning.code),
    ['kitMissing'],
  );
});
