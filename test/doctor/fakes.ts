// Fakes for the doctor's tests: an in-memory machine and a complete input.

import { join } from 'node:path';
import type { DoctorInput, Machine } from '../../src/doctor/index.ts';
import type { Settings, Translate } from '../../src/shared/index.ts';

/** A translator that answers the key and its parameters, so a test sees what was asked. */
export const fakeT: Translate = (key, params) =>
  params === undefined ? key : `${key} ${JSON.stringify(params)}`;

export type FakeMachine = Machine & {
  files: Map<string, string>;
  folders: Set<string>;
  /** Every call to `move`, in order. */
  moves: string[];
  /** What the next `move` does: its result, or the code it throws. */
  moveResult: { retries: number } | { throws: string };
  portError: string | undefined;
  hosts: string[] | { throws: string };
  missing: string[];
};

const error = (code: string): Error => Object.assign(new Error(code), { code });

export function fakeMachine(): FakeMachine {
  const files = new Map<string, string>();
  const folders = new Set<string>();
  const machine: FakeMachine = {
    files,
    folders,
    moves: [],
    moveResult: { retries: 0 },
    portError: undefined,
    hosts: ['127.0.0.1'],
    missing: [],
    readText: (file) => files.get(file),
    isFolder: (path) => folders.has(path),
    packages: () => ({ total: 7, missing: machine.missing }),
    write(file, text) {
      const parent = file.slice(0, Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\')));
      if (!folders.has(parent)) throw error('ENOENT');
      files.set(file, text);
    },
    move(from, to) {
      machine.moves.push(`${from} -> ${to}`);
      if ('throws' in machine.moveResult) throw error(machine.moveResult.throws);
      const text = files.get(from);
      if (text === undefined) throw error('ENOENT');
      files.delete(from);
      files.set(to, text);
      return machine.moveResult;
    },
    remove: (file) => {
      files.delete(file);
    },
    async openLoopback() {
      if (machine.portError !== undefined) throw error(machine.portError);
    },
    async resolveHost() {
      if ('throws' in machine.hosts) throw error(machine.hosts.throws);
      return machine.hosts;
    },
    system: () => ({ os: 'Windows_NT 10.0.26300', arch: 'x64' }),
  };
  return machine;
}

export const PLUGIN = join('/plugin');
export const DATA = join('/data');
export const DRAFTS = join('/project', '.kitvas', 'drafts');

export const SETTINGS: Settings = {
  language: 'en',
  kit: 'kitvas-ui',
  copy: null,
  check: 'normal',
  studioIdleMinutes: 30,
  workspace: { path: join('/project', '.kitvas'), exists: true },
};

/** A machine and an input in which every check passes. */
export function healthy(
  over: Partial<DoctorInput> = {},
  machine: FakeMachine = fakeMachine(),
): { input: DoctorInput; machine: FakeMachine } {
  for (const folder of [DATA, DRAFTS]) machine.folders.add(folder);
  machine.files.set(join(PLUGIN, 'package.json'), '{"engines":{"node":"^24.22.3 || >=26.13.1"}}');
  machine.files.set(
    join(PLUGIN, '.claude-plugin', 'plugin.json'),
    '{"name":"kitvas","version":"1.1.0"}',
  );
  const input: DoctorInput = {
    t: fakeT,
    now: new Date('2026-11-24T12:00:00Z'),
    version: '1.1.0',
    nodeVersion: 'v26.13.1',
    home: '/home/ada',
    project: '/project',
    pluginRoot: PLUGIN,
    dataDir: DATA,
    draftsDir: DRAFTS,
    insidePlugin: false,
    machine,
    settings: () => SETTINGS,
    kit: (settings) => ({
      id: settings.kit,
      version: '1.1.0',
      source: 'builtin',
      issues: 0,
      stale: undefined,
    }),
    decisions: () => ({ exists: true, warnings: [] }),
    browser: async () => ({ found: 'chromium', dir: '/data/browsers' }),
    studio: async () => ({ running: true, logFile: '/data/studio/a.log' }),
    ...over,
  };
  return { input, machine };
}
