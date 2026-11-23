import type { StudioState } from '../../src/studio/run/state-file.ts';

/** A state file's content, for tests that need one. */
export const SAMPLE_STATE: StudioState = {
  schemaVersion: 1,
  pid: 4242,
  port: 5000,
  framePort: 5001,
  token: 't'.repeat(43),
  version: '0.1.0',
  project: 'C:/projects/shop',
  startedAt: '2026-11-22T10:00:00.000Z',
};
