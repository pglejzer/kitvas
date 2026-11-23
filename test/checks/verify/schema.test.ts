import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { schemaStep } from '../../../src/checks/app/verify/schema.ts';
import { createFolderKitStore } from '../../../src/kit/adapters/folder-store.ts';
import {
  generatedEntry,
  type KitStore,
  type KitWriter,
  type ProjectFiles,
  parseKit,
} from '../../../src/kit/index.ts';
import { KitvasError, PLUGIN_ROOT, projectKitsDir } from '../../../src/shared/index.ts';
import { copyKit, FIXTURE_KITS } from '../../helpers/kits.ts';
import { acmeKitJson, PROJECT } from './support.ts';

const FIXTURE = join(PLUGIN_ROOT, 'test', 'fixtures', 'projects', 'acme-npm', 'kit');
const readFixture = (relPath: string): unknown =>
  JSON.parse(readFileSync(join(FIXTURE, ...relPath.split('/')), 'utf8'));

/** The `acme` project kit, held in memory as the layered store would hand it out. */
function acmeStore(kitJson: unknown = acmeKitJson()): KitStore {
  const files: Record<string, unknown> = {
    'json/tokens.json': readFixture('json/tokens.json'),
    'json/css-var-map.json': readFixture('json/css-var-map.json'),
  };
  return {
    list: () => ['acme'],
    read: (id) =>
      id === 'acme'
        ? { id, dir: join(projectKitsDir(PROJECT), 'acme'), kitJson, project: PROJECT }
        : undefined,
    readJson: (_id, relPath) => files[relPath],
    exists: (_id, relPath) => relPath in files,
  };
}

/** A writer that keeps what it is given and has nothing on disk. */
function recorder(): KitWriter & { writes: [string, string, string][] } {
  const writes: [string, string, string][] = [];
  return {
    writes,
    readText: () => undefined,
    writeText: (id, relPath, text) => {
      writes.push([id, relPath, text]);
    },
    writeBytes: () => {},
    remove: () => {},
    writeAddition: () => {},
    exportFiles: () => {},
  };
}

/** A project where every path exists and the named packages are installed. */
const projectWith = (packages: Record<string, string>) => {
  const asked: string[] = [];
  const files: ProjectFiles = {
    exists: () => true,
    realInside: () => true,
    packageVersion: (name) => packages[name],
  };
  return {
    asked,
    projectFiles: (project: string): ProjectFiles => {
      asked.push(project);
      return files;
    },
  };
};

const noProject = (): ProjectFiles => {
  throw new Error('a built-in kit has no project to look at');
};

test('a sound project kit passes and gets its generated entry written', () => {
  const kitWriter = recorder();
  const project = projectWith({ '@acme/ui': '1.2.0', react: '19.3.1' });
  const result = schemaStep({ kits: acmeStore(), kitWriter, ...project }, 'acme');
  assert.equal(result.state, 'passed');
  assert.deepEqual(result.issues, []);
  assert.equal(result.loaded?.project, PROJECT);
  assert.deepEqual(project.asked, [PROJECT]);
  assert.deepEqual(kitWriter.writes, [
    ['acme', 'generated/kit.ts', generatedEntry(parseKit(acmeKitJson(), 'acme')).text],
  ]);
});

test('what the project lacks fails the step, and nothing is written', () => {
  const kitWriter = recorder();
  const project = projectWith({ react: '17.0.2' });
  const result = schemaStep({ kits: acmeStore(), kitWriter, ...project }, 'acme');
  assert.equal(result.state, 'failed');
  assert.deepEqual(result.issues, [
    {
      step: 'schema',
      path: 'source.package',
      key: 'kitIssue.packageMissing',
      params: { name: '@acme/ui' },
    },
    {
      step: 'schema',
      path: 'framework',
      key: 'kitIssue.reactTooOld',
      params: { version: '17.0.2' },
    },
  ]);
  assert.deepEqual(kitWriter.writes, []);
  assert.ok(result.loaded, 'the kit was still read');
});

test('a problem of the kit itself fails the step with its place', () => {
  const kitWriter = recorder();
  const kits = createFolderKitStore(copyKit('tiny', 'other'));
  const result = schemaStep({ kits, kitWriter, projectFiles: noProject }, 'other');
  assert.equal(result.state, 'failed');
  assert.deepEqual(result.issues, [
    {
      step: 'schema',
      path: 'id',
      key: 'kitIssue.idMismatch',
      params: { id: 'tiny', folder: 'other' },
    },
  ]);
});

test('a built-in kit passes without a look at any project', () => {
  const kitWriter = recorder();
  const kits = createFolderKitStore(FIXTURE_KITS);
  const result = schemaStep({ kits, kitWriter, projectFiles: noProject }, 'tiny');
  assert.equal(result.state, 'passed');
  assert.deepEqual(result.issues, []);
  assert.equal(result.loaded?.kit.id, 'tiny');
  assert.deepEqual(kitWriter.writes, []);
});

test('a kit.json the contract refuses is an issue of the step, at the place the contract names', () => {
  const json = acmeKitJson();
  json.components = [];
  const kitWriter = recorder();
  const project = projectWith({});
  const result = schemaStep({ kits: acmeStore(json), kitWriter, ...project }, 'acme');
  assert.equal(result.state, 'failed');
  assert.equal(result.loaded, undefined);
  assert.equal(result.issues.length, 1);
  const [issue] = result.issues;
  assert.deepEqual(
    [issue?.step, issue?.path, issue?.key, issue?.params.id],
    ['schema', 'components', 'error.KIT_INVALID', 'acme'],
  );
  assert.match(String(issue?.params.detail), /^components: ./);
  assert.deepEqual(project.asked, []);
});

test('a kit that is not there is an error, not an answer', () => {
  const kits = createFolderKitStore(FIXTURE_KITS);
  assert.throws(
    () => schemaStep({ kits, kitWriter: recorder(), projectFiles: noProject }, 'nope'),
    (error: unknown) => error instanceof KitvasError && error.code === 'KIT_NOT_FOUND',
  );
});
