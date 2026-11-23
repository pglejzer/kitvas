// Use case: `kitvas kit scan`. Opens the pages of a `web` kit in the browser, one folder of facts and
// crops per page and width under `source/web/`, for the tailor agent to write components from.

import { join } from 'node:path';
import { type KitStore, type KitWriter, parseKitSource, WEB_URL } from '../../kit/index.ts';
import { KitvasError, z } from '../../shared/index.ts';
import { scanPolicy } from '../domain/addresses.ts';
import { CROPS_MAX, SCAN_WIDTHS, ScanFactsSchema, URLS_MAX } from '../domain/scan-facts.ts';
import type { Browser } from '../ports/browser.ts';

export type ScanDeps = {
  kits: KitStore;
  kitWriter: KitWriter;
  browser: Browser;
  /** All addresses of a host name; rejects when it does not resolve. */
  lookup(host: string): Promise<string[]>;
};

export type ScanResult = {
  id: string;
  pages: {
    url: string;
    width: number;
    /** Kit path of the folder holding facts.json, page.png and crops/. */
    folder: string;
    candidates: number;
  }[];
};

const JsonObject = z.record(z.string(), z.unknown());

const invalid = (detail: string): KitvasError => new KitvasError('KIT_SOURCE_INVALID', { detail });

/** kit.json as it is on disk with `source.urls` replaced, so no default of the contract leaks into it. */
function withUrls(raw: unknown, urls: string[]): string {
  const json = JsonObject.parse(raw);
  const source = JsonObject.parse(json.source);
  return `${JSON.stringify({ ...json, source: { ...source, urls } }, null, 2)}\n`;
}

/**
 * Scans the kit's pages at both widths: the given `options.urls` only, or all of the kit's when none
 * are given. Given URLs are added to the kit's own, in order and without repeats, and kit.json is
 * written back when that changed anything; a page's folder is numbered by its place in that list. A page the policy
 * refuses is `SCAN_BLOCKED`; one that does not load is `SCAN_FAILED`.
 */
export async function scanKit(
  deps: ScanDeps,
  _project: string,
  id: string,
  options: { urls: string[]; allowPrivate: boolean },
): Promise<ScanResult> {
  const files = deps.kits.read(id);
  if (!files) throw new KitvasError('KIT_NOT_FOUND', { id });
  // Only the source: a kit is scanned before its components are written.
  const source = parseKitSource(files.kitJson, id);
  if (source.type !== 'web') throw invalid(`kit "${id}" is not a web kit`);

  const urls = [...source.urls];
  for (const url of options.urls) {
    if (!WEB_URL.test(url)) throw invalid(`"${url}" is not an http or https address`);
    if (!urls.includes(url)) urls.push(url);
  }
  if (urls.length > URLS_MAX) throw invalid(`a kit scans at most ${URLS_MAX} pages`);
  if (urls.length !== source.urls.length) {
    deps.kitWriter.writeText(id, 'kit.json', withUrls(files.kitJson, urls));
  }

  const policy = scanPolicy(deps.lookup, options.allowPrivate);
  const session = await deps.browser.open();
  const pages: ScanResult['pages'] = [];
  try {
    const { scan } = session;
    if (!scan) throw new KitvasError('BROWSER_MISSING');
    let crops = 0;
    const chosen = options.urls.length > 0 ? new Set(options.urls) : undefined;
    for (const [index, url] of urls.entries()) {
      if (chosen && !chosen.has(url)) continue;
      for (const width of SCAN_WIDTHS) {
        const folder = `source/web/${index + 1}-${width}`;
        deps.kitWriter.remove(id, folder);
        const report = await scan.call(session, {
          url,
          width,
          out: join(files.dir, 'source', 'web', `${index + 1}-${width}`),
          policy,
        });
        if (report.state === 'blocked') throw new KitvasError('SCAN_BLOCKED', { url: report.url });
        if (report.state === 'failed') {
          throw new KitvasError('SCAN_FAILED', { url, detail: report.error });
        }
        const checked = ScanFactsSchema.safeParse(report.facts);
        if (!checked.success) {
          throw new KitvasError('SCAN_FAILED', {
            url,
            detail: 'the page facts have an unexpected shape',
          });
        }
        const facts = checked.data;
        // The crops of a kit are capped; the later candidates (banners come last) are dropped.
        const room = Math.max(CROPS_MAX - crops, 0);
        for (const dropped of facts.candidates.slice(room)) {
          deps.kitWriter.remove(id, `${folder}/${dropped.crop}`);
        }
        facts.candidates = facts.candidates.slice(0, room);
        crops += facts.candidates.length;
        deps.kitWriter.writeText(id, `${folder}/facts.json`, `${JSON.stringify(facts, null, 2)}\n`);
        pages.push({ url, width, folder, candidates: facts.candidates.length });
      }
    }
  } finally {
    await session.close();
  }
  return { id, pages };
}
