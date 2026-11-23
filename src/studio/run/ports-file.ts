// The ports of a project's studio, kept so its address stays the same across starts (ADR 0040).

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { type Zod, z } from '../../shared/index.ts';

const Port = z.number().int().min(1).max(65_535);

export const SavedPortsSchema = z.strictObject({ port: Port, framePort: Port });

export type SavedPorts = Zod.infer<typeof SavedPortsSchema>;

/** The ports in `file`; `undefined` when it is missing or holds something else. */
export function readPorts(file: string): SavedPorts | undefined {
  try {
    const parsed = SavedPortsSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Written whole or not at all, so a crash never leaves half a file for the next start. */
export function writePorts(file: string, ports: SavedPorts): void {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(ports)}\n`);
  renameSync(temp, file);
}
