// The only place that loads zod. Everything else imports `z` from here.

import type * as Zod from 'zod';
import { defaultDepRoots, loadDep } from './deps.ts';

const loaded = await loadDep<typeof Zod>('zod', defaultDepRoots());

export const z = loaded.z;
export type { Zod };
