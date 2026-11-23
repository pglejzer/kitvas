// The checks that need a browser: every state at every viewport, with a screenshot each.

import { join } from 'node:path';
import type { RawFinding, Shot } from '../domain/finding.ts';
import type { IdEntry } from '../domain/ids.ts';
import { a11yFindings, componentsOf, runtimeFindings, VIEWPORTS } from '../domain/page.ts';
import { type CatalogComponent, usageFindings } from '../domain/usage.ts';
import type { Browser } from '../ports/browser.ts';

export type BrowserInput = {
  /** Absolute folder of the draft version. */
  versionDir: string;
  states: string[];
  ids: IdEntry[];
  catalog: CatalogComponent[];
};

export type BrowserResult = { findings: RawFinding[]; shots: Shot[]; browser: string };

/** One browser for the whole run, closed at the end whatever happens. */
export async function browserChecks(browser: Browser, input: BrowserInput): Promise<BrowserResult> {
  const session = await browser.open();
  const findings: RawFinding[] = [];
  const shots: Shot[] = [];
  const page = join(input.versionDir, 'build', 'html', 'index.html');
  try {
    for (const state of input.states) {
      for (const { width, height } of VIEWPORTS) {
        const file = `build/shots/${state}-${width}.png`;
        const screenshot = join(input.versionDir, ...file.split('/'));
        const report = await session.visit({ page, state, width, height, screenshot });
        const seen = {
          state,
          width,
          ids: input.ids,
          components: componentsOf(report.usage),
        };
        findings.push(
          ...runtimeFindings(report, seen),
          ...a11yFindings(report.violations, seen),
          ...usageFindings({
            usage: report.usage,
            catalog: input.catalog,
            ids: input.ids,
            state,
            width,
          }),
        );
        if (report.shot) shots.push({ state, width, file });
      }
    }
  } finally {
    await session.close();
  }
  return { findings, shots, browser: session.name };
}
