import { join } from 'node:path';
import { createTranslator, loadMessages, PLUGIN_ROOT } from '../../src/shared/index.ts';

/** The English messages, as the CLI and the studio use them. */
export const t = createTranslator(loadMessages(join(PLUGIN_ROOT, 'locales'), 'en'));
