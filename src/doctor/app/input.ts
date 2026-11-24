// What the doctor is given: the facts of one project and the ports that read the machine.

import type { Settings, Translate } from '../../shared/index.ts';
import type { Machine } from '../ports/machine.ts';

export type KitFacts = {
  id: string;
  version: string;
  source: string;
  /** How many issues loading the kit found. */
  issues: number;
  /** True when the last `kit verify` is for other kit data; `undefined` where kitvas does not know. */
  stale: boolean | undefined;
};

export type BrowserFacts = { found: string | null; dir: string };

export type StudioFacts = {
  running: boolean;
  /** The studio's log file; its error lines are counted. */
  logFile: string;
};

export type DoctorInput = {
  t: Translate;
  now: Date;
  /** The version of kitvas. */
  version: string;
  /** The Node that runs kitvas, as `process.version`. */
  nodeVersion: string;
  home: string;
  /** The project's folder. */
  project: string;
  pluginRoot: string;
  dataDir: string;
  /** The workspace's drafts folder. */
  draftsDir: string;
  /** The project folder is the plugin folder or inside it. */
  insidePlugin: boolean;
  machine: Machine;
  /** The user's and the project's settings; throws `CONFIG_INVALID` for a broken file. */
  settings(): Settings;
  /** Loads the project's kit; throws a kitvas error when it cannot. */
  kit(settings: Settings): KitFacts;
  browser(): Promise<BrowserFacts>;
  studio(): Promise<StudioFacts>;
};
