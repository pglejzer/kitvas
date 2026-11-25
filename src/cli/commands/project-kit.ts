// The kit a command uses when none is named: the project's, from `.kitvas/decisions.md`.

import type { KitStore } from '../../kit/index.ts';
import { loadSettings } from '../../shared/index.ts';
import type { CommandContext } from '../registry.ts';

/**
 * The kit the decisions file names; `base` when that kit does not exist, so a stale name never stops
 * a command (`kitvas decisions` and `kitvas doctor` report it, ADR 0076).
 */
export function projectKitId(kits: KitStore, ctx: CommandContext): string {
  const { kit } = loadSettings({ home: ctx.home, cwd: ctx.cwd });
  return kits.list().includes(kit) ? kit : 'base';
}
