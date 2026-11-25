// `kitvas doctor [--report]`: probes the setup and says what is wrong. It reads and probes; nothing
// it makes stays. `--report` prints one block of text with nothing private in it.

import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser, readVerifyFile, VERIFY_FILE } from '../../checks/index.ts';
import {
  buildReport,
  type CheckResult,
  type DoctorInput,
  type Machine,
  renderChecks,
  runDoctor,
  tally,
} from '../../doctor/index.ts';
import { detectKits, type KitStore, loadKit, type ProjectSetup } from '../../kit/index.ts';
import {
  catalogDir,
  KitvasError,
  loadSettings,
  PLUGIN_ROOT,
  pluginVersion,
  type Translate,
  workspaceDir,
} from '../../shared/index.ts';
import type { LifecycleDeps } from '../../studio/index.ts';
import { defineCommand } from '../registry.ts';
import { insidePlugin } from './init.ts';

export type DoctorCommandDeps = {
  /** The kits of the current project, built-in ones first. */
  kits: KitStore;
  projectFiles(project: string): ProjectSetup;
  browser(): Browser;
  /** Where `kitvas browser install` puts Chromium. */
  browsersDir: string;
  lifecycle(project: string): LifecycleDeps;
  dataDir: string;
  machine: Machine;
  now(): Date;
};

export type DoctorView = { checks: CheckResult[]; report?: string };

/** Where the doctor looks: the project folder, the home folder and the language of its words. */
export type DoctorWhere = { cwd: string; home: string; t: Translate };

/** Runs the checks; the report is worked out from them only when asked for. */
async function probe(
  deps: DoctorCommandDeps,
  where: DoctorWhere,
): Promise<{ checks: CheckResult[]; report(): string }> {
  const { cwd, home, t } = where;
  const verifiedHash = (id: string): string | undefined =>
    readVerifyFile(deps.machine.readText(join(catalogDir(cwd, id), VERIFY_FILE)))?.hash;
  const input: DoctorInput = {
    t,
    now: deps.now(),
    version: pluginVersion(),
    nodeVersion: process.version,
    home,
    project: cwd,
    pluginRoot: PLUGIN_ROOT,
    dataDir: deps.dataDir,
    draftsDir: join(workspaceDir(cwd), 'drafts'),
    insidePlugin: insidePlugin(cwd),
    machine: deps.machine,
    settings: () => loadSettings({ home, cwd }),
    kit: (settings) => {
      const loaded = loadKit(deps.kits, settings.kit);
      const found = detectKits({
        kits: deps.kits,
        files: deps.projectFiles(cwd),
        verifiedHash,
        activeKit: settings.kit,
      }).kits.find((kit) => kit.id === settings.kit);
      return {
        id: settings.kit,
        version: loaded.kit.version,
        source: loaded.kit.source.type,
        issues: loaded.issues.length,
        stale: found?.stale,
      };
    },
    browser: async () => {
      try {
        const session = await deps.browser().open();
        await session.close();
        return { found: session.name, dir: deps.browsersDir };
      } catch (error) {
        if (!(error instanceof KitvasError && error.code === 'BROWSER_MISSING')) throw error;
        return { found: null, dir: deps.browsersDir };
      }
    },
    // The state file is read, never cleaned up: the doctor changes nothing that lasts.
    studio: async () => {
      const studio = deps.lifecycle(realpathSync.native(cwd));
      const state = studio.readState();
      const running = state !== undefined && (await studio.probe(state)) !== undefined;
      return { running, logFile: studio.files.log };
    },
  };
  const checks = await runDoctor(input);
  const report = (): string =>
    buildReport({
      t,
      version: input.version,
      nodeVersion: input.nodeVersion,
      system: deps.machine.system(),
      home,
      project: cwd,
      checks,
    });
  return { checks, report };
}

/** What `kitvas doctor --report` works out: the checks and the report with nothing private. */
export async function doctorReport(
  deps: DoctorCommandDeps,
  where: DoctorWhere,
): Promise<{ checks: CheckResult[]; report: string }> {
  const { checks, report } = await probe(deps, where);
  return { checks, report: report() };
}

export function createDoctorCommand(deps: DoctorCommandDeps) {
  return defineCommand<DoctorView>({
    name: 'doctor',
    summary: 'command.doctor.summary',
    // Its own `workspace` check reports a config file that does not read.
    runsWithoutSettings: true,
    async run(ctx) {
      const { checks, report } = await probe(deps, ctx);
      return ctx.flags.report ? { checks, report: report() } : { checks };
    },
    render: (view, t) => view.report ?? renderChecks(t, view.checks),
    failure(view) {
      const count = tally(view.checks).fail;
      return count > 0 ? new KitvasError('DOCTOR_FAILED', { count }) : undefined;
    },
  });
}
