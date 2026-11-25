// API deps for route tests: the shop draft, jobs that never end, an event hub.

import { memoryViewStore } from '../../src/shared/settings/config.ts';
import type { ApiDeps } from '../../src/studio/api/routes.ts';
import { createEventHub } from '../../src/studio/events/event-hub.ts';
import { createInbox } from '../../src/studio/inbox/inbox.ts';
import { createJobs } from '../../src/studio/jobs/jobs.ts';
import { createOpenLinks } from '../../src/studio/security/open-links.ts';
import { NOW, shopDraft } from './drafts.ts';
import { builtinKits } from './kits.ts';
import { t } from './translate.ts';

export function apiDeps(overrides: Partial<ApiDeps> = {}): ApiDeps {
  return {
    drafts: shopDraft().store,
    kits: builtinKits(),
    version: '1.0.0',
    startedAt: NOW.toISOString(),
    port: 5000,
    framePort: 5001,
    now: () => NOW,
    jobs: createJobs({
      run: () => ({ done: new Promise(() => undefined), cancel: () => undefined }),
      publish: () => undefined,
      now: () => NOW,
      t,
    }),
    events: createEventHub(),
    inbox: createInbox({ now: () => NOW, publish: () => undefined }),
    t,
    links: createOpenLinks(() => NOW),
    view: memoryViewStore(),
    ...overrides,
  };
}
