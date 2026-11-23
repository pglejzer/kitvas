import { join } from 'node:path';
import { createTscChecker } from '../../src/checks/adapters/tsc-checker.ts';
import {
  type Browser,
  type ChecksReport,
  type PageReport,
  runChecks,
  type Visit,
} from '../../src/checks/index.ts';
import { createFolderKitStore } from '../../src/kit/adapters/folder-store.ts';
import { createTranslator, loadMessages, PLUGIN_ROOT } from '../../src/shared/index.ts';
import { shopDraft } from './drafts.ts';
import { FIXTURE_KITS } from './kits.ts';
import { renderTools, writeShopSections } from './render.ts';

export const t = createTranslator(loadMessages(join(PLUGIN_ROOT, 'locales'), 'en'));

/** A `shop` draft with its sections written, checked with the real tools. */
export function checkShop(options: { browser?: Browser } = {}) {
  const { store, root } = shopDraft();
  const dir = join(root, 'shop');
  writeShopSections(dir);
  const tools = renderTools();
  const types = createTscChecker({ roots: [PLUGIN_ROOT] });
  const kits = createFolderKitStore(FIXTURE_KITS);
  const check = (): Promise<ChecksReport> =>
    runChecks({ render: { drafts: store, kits, ...tools }, types, t, ...options }, 'shop');
  const close = async (): Promise<void> => {
    await tools.bundler.dispose();
    await tools.styles.dispose();
  };
  const write = (relPath: string, text: string): void =>
    store.writeText('shop', `v1/${relPath}`, text);
  return { dir, check, close, write };
}

/** A browser that answers every visit with a clean report changed by `answer`; it keeps the visits. */
export function fakeBrowser(answer: (visit: Visit) => Partial<PageReport> = () => ({})) {
  const visits: Visit[] = [];
  const browser: Browser = {
    async open() {
      return {
        name: 'fake',
        async visit(visit) {
          visits.push(visit);
          return {
            rendered: true,
            console: [],
            pageErrors: [],
            failedRequests: [],
            violations: [],
            usage: [],
            shot: visit.screenshot !== null,
            facts: null,
            deep: null,
            contrastUnsure: [],
            ...answer(visit),
          };
        },
        async close() {},
      };
    },
  };
  return { browser, visits };
}
