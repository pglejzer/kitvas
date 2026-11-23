// One browser for every check job while the studio runs: started at the first check, ended with it.

import { SHARED_BROWSER_ENV, type SharedBrowser } from '../../checks/index.ts';

export type BrowserKeeper = {
  /** The environment for a job: a check gets the shared browser, other jobs nothing. */
  envFor(args: string[]): Promise<NodeJS.ProcessEnv>;
  /** The browser's pid while it runs. */
  pid(): number | undefined;
  close(): Promise<void>;
};

/** `onChange` hears the pid when a browser starts and `undefined` when it went away by itself. */
export function keepBrowser(
  serve: () => Promise<SharedBrowser>,
  onChange?: (pid: number | undefined) => void,
): BrowserKeeper {
  let current: Promise<SharedBrowser> | undefined;
  let running: SharedBrowser | undefined;

  const start = (): Promise<SharedBrowser> => {
    const pending: Promise<SharedBrowser> = serve().then((browser) => {
      running = browser;
      onChange?.(browser.pid);
      browser.closed.then(() => {
        // Only the browser in use is forgotten; one that close() ended is gone already.
        if (current !== pending) return;
        current = undefined;
        running = undefined;
        onChange?.(undefined);
      });
      return browser;
    });
    // A browser that cannot start fails this check; the next check tries again.
    pending.catch(() => {
      if (current === pending) current = undefined;
    });
    return pending;
  };

  return {
    async envFor(args) {
      if (args[0] !== 'check') return {};
      current ??= start();
      const browser = await current;
      return {
        [SHARED_BROWSER_ENV.endpoint]: browser.endpoint,
        [SHARED_BROWSER_ENV.name]: browser.name,
      };
    },
    pid: () => running?.pid,
    async close() {
      const pending = current;
      current = undefined;
      running = undefined;
      if (!pending) return;
      try {
        await (await pending).close();
      } catch {
        // It never started, or it is gone already.
      }
    },
  };
}
