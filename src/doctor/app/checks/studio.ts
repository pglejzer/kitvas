// The checks of the studio's surroundings: loopback ports and names, and its recent errors.

import { type CheckResult, codeOf, fail, pass, skip, warn } from '../../domain/check.ts';
import { countLogErrors } from '../../domain/log-errors.ts';
import type { DoctorInput } from '../input.ts';

const STUDIO_NAME = 'kitvas.localhost';

const isLoopback = (address: string): boolean =>
  address === '::1' || address.startsWith('127.') || address === '::ffff:127.0.0.1';

/**
 * A loopback port can be opened and closed, and the studio's name does not resolve to an address
 * outside loopback. A name the system does not resolve at all passes: the browser resolves it.
 */
export async function checkPorts(input: DoctorInput): Promise<CheckResult> {
  const { t } = input;
  try {
    await input.machine.openLoopback();
  } catch (error) {
    const code = codeOf(error);
    return fail('ports', t('doctor.ports.portFailed', { code }), t('doctor.ports.fixPort'), code);
  }
  try {
    const addresses = await input.machine.resolveHost(STUDIO_NAME);
    if (addresses.length > 0 && addresses.every(isLoopback)) {
      return pass('ports', t('doctor.ports.ok'));
    }
    return warn('ports', t('doctor.ports.hostOutside'), t('doctor.ports.fixHost'));
  } catch (error) {
    // No fault of the setup: browsers resolve every `.localhost` name to loopback themselves, and
    // some systems (Windows among them) do not, so Node's lookup fails where the studio still opens.
    return pass('ports', t('doctor.ports.hostFailed', { code: codeOf(error) }));
  }
}

/** Whether this project's studio runs, and the error codes its log holds for the last 24 hours. */
export async function checkStudio(input: DoctorInput, hasWorkspace: boolean): Promise<CheckResult> {
  const { t } = input;
  if (!hasWorkspace) return skip('studio', t('doctor.studio.skipped'));
  const studio = await input.studio();
  const state = t(studio.running ? 'doctor.studio.up' : 'doctor.studio.down');
  const log = input.machine.readText(studio.logFile);
  const counts = log === undefined ? [] : countLogErrors(log, input.now);
  if (counts.length === 0) return pass('studio', t('doctor.studio.clean', { state }));
  const codes = counts.map((entry) => `${entry.code} x${entry.count}`).join(', ');
  return warn('studio', t('doctor.studio.errors', { state, codes }), t('doctor.studio.fix'));
}
