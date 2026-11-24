// The write probe: the data folder and the drafts folder take a file the way the draft store
// writes one (a temporary file beside the real one, moved over it). Nothing it makes stays.

import { dirname, join } from 'node:path';
import { type CheckResult, type CheckStatus, codeOf, fail, pass } from '../../domain/check.ts';
import type { Machine } from '../../ports/machine.ts';
import type { DoctorInput } from '../input.ts';

const PROBE_FILE = '.kitvas-doctor-probe';
const TEMP_SUFFIX = '.kitvas-tmp';

export type ProbeOutcome =
  | { state: 'ok' }
  /** The move worked only after `retries` tries. */
  | { state: 'retried'; retries: number }
  | { state: 'failed'; code: string };

/** Writes a probe file and a temporary one, moves the temporary over the probe, removes both. */
export function probeFolder(machine: Machine, folder: string): ProbeOutcome {
  const probe = join(folder, PROBE_FILE);
  const temp = `${probe}${TEMP_SUFFIX}`;
  try {
    machine.write(probe, 'probe');
    machine.write(temp, 'probe');
    const { retries } = machine.move(temp, probe);
    return retries > 0 ? { state: 'retried', retries } : { state: 'ok' };
  } catch (error) {
    return { state: 'failed', code: codeOf(error) };
  } finally {
    for (const file of [temp, probe]) {
      try {
        machine.remove(file);
      } catch {
        // A file that cannot be removed does not hide what the probe found.
      }
    }
  }
}

/** The folder itself, or the nearest folder above it that exists. */
function nearestFolder(machine: Machine, folder: string): { path: string; created: boolean } {
  let path = folder;
  while (!machine.isFolder(path)) {
    const parent = dirname(path);
    if (parent === path) break;
    path = parent;
  }
  return { path, created: path === folder };
}

type Part = { status: CheckStatus; text: string; fix?: string; code?: string };

function partOf(input: DoctorInput, label: string, folder: string): Part {
  const { t } = input;
  const target = nearestFolder(input.machine, folder);
  const outcome = probeFolder(input.machine, target.path);
  if (outcome.state === 'failed') {
    return {
      status: 'fail',
      text: t('doctor.data.failed', { folder: label, code: outcome.code }),
      fix: t('doctor.data.fixFailed'),
      code: outcome.code,
    };
  }
  if (outcome.state === 'retried') {
    return {
      status: 'warn',
      text: t('doctor.data.retried', { folder: label, retries: outcome.retries }),
      fix: t('doctor.data.fixRetried'),
    };
  }
  return {
    status: 'ok',
    text: t(target.created ? 'doctor.data.ok' : 'doctor.data.okParent', { folder: label }),
  };
}

/** `data`: the data folder and, with a workspace, its drafts folder can be written. */
export function checkData(input: DoctorInput, hasWorkspace: boolean): CheckResult {
  const { t } = input;
  const parts: Part[] = [partOf(input, t('doctor.data.dataLabel'), input.dataDir)];
  const draftsLabel = t('doctor.data.draftsLabel');
  if (hasWorkspace) parts.push(partOf(input, draftsLabel, input.draftsDir));
  else parts.push({ status: 'skipped', text: t('doctor.data.noDrafts', { folder: draftsLabel }) });
  const detail = parts.map((part) => part.text).join(' ');
  const failed = parts.find((part) => part.status === 'fail');
  if (failed?.fix !== undefined) {
    return fail('data', detail, failed.fix, failed.code);
  }
  const retried = parts.find((part) => part.status === 'warn');
  if (retried?.fix !== undefined) return { id: 'data', status: 'warn', detail, fix: retried.fix };
  return pass('data', detail);
}
