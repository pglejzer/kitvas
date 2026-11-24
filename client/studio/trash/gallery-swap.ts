// The gallery after a delete, a restore or a purge made on it: the server's page is fetched and
// its filter row and its list take the place of the old ones, so the counts and the empty state
// are the server's own words. The cards stay when only the filter row changes, so no thumbnail
// loads again.

import { localizeTimes } from './time.ts';

const HEAD = '.gallery-head';
const BODY = '[data-gallery-body]';

/** Fetches this page again; `undefined` when the studio does not answer with a page. */
async function fresh(): Promise<Document | undefined> {
  try {
    const response = await fetch(location.pathname + location.search, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'text/html' },
    });
    if (!response.ok) return undefined;
    return new DOMParser().parseFromString(await response.text(), 'text/html');
  } catch {
    return undefined;
  }
}

/**
 * Takes the server's filter row, and with `list` its list too. When the page cannot be fetched, the
 * page loads itself again instead: the person never keeps a stale list.
 */
export async function swapGallery(list: boolean): Promise<void> {
  const doc = await fresh();
  const head = document.querySelector(HEAD);
  const body = document.querySelector(BODY);
  const nextHead = doc?.querySelector(HEAD);
  const nextBody = doc?.querySelector(BODY);
  if (!doc || !head || !body || !nextHead || !nextBody) {
    location.reload();
    return;
  }
  head.replaceWith(document.importNode(nextHead, true));
  if (list) body.replaceWith(document.importNode(nextBody, true));
  // The Deleted filter is gone with the last deleted draft: the address says all the drafts again.
  if (location.search.includes('show=deleted') && !document.querySelector('[data-trash-list]')) {
    history.replaceState(null, '', location.pathname);
  }
  localizeTimes(document);
}
