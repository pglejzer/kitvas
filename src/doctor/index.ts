// Public API of the doctor module. Adapters are wired in src/main.ts, not exported here.

export * from './app/input.ts';
export * from './app/report.ts';
export * from './app/run-doctor.ts';
export * from './domain/check.ts';
export * from './domain/log-errors.ts';
export * from './domain/manifest.ts';
export * from './domain/redact.ts';
export type * from './ports/machine.ts';
